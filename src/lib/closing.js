import pool from '@/lib/db';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { groupJamaahAktif } from '@/lib/jamaahHarga';

const JENIS_LABEL = {
  reseller_perwakilan: 'Margin reseller',
  ujroh_perwakilan: 'Ujroh closing',
  closing_langsung_sahabat: 'Closing langsung',
  referral_closing_reguler_sahabat: 'Ujroh Referral Sahabat',
};

async function catat(conn, bookingId, penerima, jenis, nominal, jml, paket, ket) {
  if (!penerima?.id || nominal <= 0) return 0;
  await conn.query(
    `INSERT INTO komisi_ledger
     (booking_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, paket, keterangan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [bookingId, penerima.id, penerima.name || null, jenis, jml, nominal, paket, ket || null]
  );
  return nominal;
}

async function getUser(conn, id) {
  if (!id) return null;
  const [r] = await conn.query(
    'SELECT id, name, role, role_kedua, perekrut_id, kode_unik, perekrut_perwakilan_jamaah_id, perekrut_sahabat_jamaah_id FROM users WHERE id = ?', [id]
  );
  return r[0] || null;
}

// Proyeksi margin reseller yang BELUM cair, dari downline LANGSUNG (1 hop)
// yang closingnya masih aktif. Skema reseller_perwakilan yang asli (lihat
// prosesBookingSelesai di bawah) bisa berjenjang tak terbatas lewat rantai
// perwakilan-merekrut-perwakilan, dengan margin per level tergantung harga
// jual masing-masing — replikasi persis versi berjenjangnya di sini berisiko
// salah hitung, jadi SENGAJA dibatasi ke downline langsung saja (skenario
// paling umum). Dipakai utk kartu "Forecast" perwakilan.
//
// `statuses` bisa dioper beda buat hitung kartu "Lost" (margin reseller yang
// HILANG karena booking downline dibatalkan) — panggil dengan ['dibatalkan']
// alih-alih default ['active','menunggu_batal'] — logic hitungnya identik,
// cuma beda filter status booking yang di-scan.
export async function cariPotensiResellerLangsung(conn, myId, statuses = ['active', 'menunggu_batal']) {
  const me = await getUser(conn, myId);
  if (!me || me.role !== 'perwakilan') return { potensi: 0, bookings: [] };

  const [downline] = await conn.query(
    `SELECT id, name FROM users WHERE perekrut_id = ? AND role = 'perwakilan'`,
    [myId]
  );

  let potensi = 0;
  const bookings = [];
  for (const d of downline) {
    const [rows] = await conn.query(
      `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.status, b.prog_id,
              b.jamaah_data, b.total_harga, b.opsi_tambahan_total,
              p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
              p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
              p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
       FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.referral_perw_id = ? AND b.status IN (${statuses.map(() => '?').join(',')})`,
      [d.id, ...statuses]
    );
    for (const b of rows) {
      // Harga & cost basis dipakai adalah milik SAYA (penerima margin), bukan
      // milik downline yang closing — sama seperti loop reseller_perwakilan
      // di prosesBookingSelesai. Dihitung PER KOMBO paket+kamar (bisa beda
      // per jamaah dalam 1 booking, lihat groupJamaahAktif) bukan 1 kombo
      // seragam × jumlah_jamaah kayak dulu.
      const [ph] = await conn.query(
        'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [myId, b.prog_id]
      );
      let nominalBooking = 0;
      for (const grup of groupJamaahAktif(b)) {
        const paket = String(grup.paket || 'deluxe').toLowerCase();
        const kamarKey = grup.kamarKey;
        const hppKantor = Number(b[`hpp_${paket}_${kamarKey}`] || 0);
        const hargaJual = Number(ph[0]?.[`jual_${paket}_${kamarKey}`] || 0);
        const cost = await costBasisPerwakilan(conn, myId, b.prog_id, paket, kamarKey, hppKantor);
        if (hargaJual <= 0) continue;
        nominalBooking += (hargaJual - cost) * grup.count;
      }
      if (nominalBooking <= 0) continue;
      potensi += nominalBooking;
      bookings.push({
        id: b.id, prog_name: b.prog_name, paket: b.paket, kamar: b.kamar,
        jumlah_jamaah: b.jumlah_jamaah || 1, status: b.status,
        closer_nama: d.name, downline_id: d.id, potensi_nominal: nominalBooking,
      });
    }
  }
  return { potensi, bookings };
}

// HPP efektif seorang perwakilan: kalau perekrutnya perwakilan lain yang
// SUDAH pasang harga reseller, itu jadi HPP-nya (bukan HPP kantor).
// Berjenjang natural — tiap level cuma perlu tahu harga 1 level di atasnya.
export async function costBasisPerwakilan(conn, perwId, progId, paket, kamarKey, hppKantor) {
  const user = await getUser(conn, perwId);
  if (!user || !user.perekrut_id) return hppKantor;
  const upline = await getUser(conn, user.perekrut_id);
  if (!upline || upline.role !== 'perwakilan') return hppKantor;
  const [r] = await conn.query('SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [upline.id, progId]);
  const harga = Number(r[0]?.[`jual_${paket}_${kamarKey}`] || 0);
  return harga > 0 ? harga : hppKantor;
}

const tglID = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// Syarat "closing terhitung" (ujroh final):
//   - booking tidak dibatalkan (status='active')
//   - sudah lunas (pelunasan_status='paid')
//   - formulir jamaah lengkap (form_filled >= form_total)
//   - tanggal_berangkat program sudah diisi DAN sudah lewat
//   - tidak ada pengajuan pembatalan yang masih aktif (menunggu/disetujui) —
//     pengajuan yang ditolak tidak menghalangi, booking tetap jalan normal.
// Dipakai baik oleh sweep otomatis (closing-otomatis.js) maupun trigger manual
// admin ("Proses Sekarang") — supaya tidak ada jalur yang bisa melewati aturan ini.
async function cekSyaratClosing(conn, b) {
  if (b.status === 'selesai') return 'Booking sudah berstatus selesai.';
  if (b.status !== 'active') return `Booking berstatus "${b.status}", tidak bisa diproses closing.`;
  if (b.pelunasan_status !== 'paid') return 'Booking belum lunas.';
  if (b.form_filled < b.form_total) {
    return `Formulir jamaah belum lengkap (${b.form_filled}/${b.form_total}).`;
  }
  if (!b.tanggal_berangkat) {
    return 'Program belum punya tanggal keberangkatan — lengkapi dulu di Kelola Program.';
  }
  const berangkat = new Date(b.tanggal_berangkat);
  const hariIni = new Date(new Date().toDateString());
  if (berangkat >= hariIni) {
    return `Menunggu tanggal keberangkatan (${tglID(b.tanggal_berangkat)}) — closing diproses otomatis setelahnya.`;
  }
  const [pb] = await conn.query(
    `SELECT id FROM pembatalan WHERE booking_id = ? AND status IN ('menunggu','disetujui') LIMIT 1`,
    [b.id]
  );
  if (pb.length > 0) return 'Ada pengajuan pembatalan yang masih aktif.';
  return null;
}

/**
 * Proses satu booking jadi "selesai" + cairkan komisi, KALAU syarat closing terpenuhi.
 * @param {string} bookingId
 * @param {{id:string, name?:string}} actor - admin yang klik manual, atau { id:'SYSTEM', name:'Sistem (Otomatis)' } dari sweep cron.
 * @returns {{ ok:true, skema_berlaku:boolean, rincian:object[] } | { ok:false, error:string }}
 */
export async function prosesBookingSelesai(bookingId, actor) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT b.*, p.kategori, p.tanggal_berangkat, p.publish_type,
              p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
              p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
              p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double,
              p.sahabat_closing_langsung_hop_nominal, p.sahabat_closing_nominal_closer
       FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.id = ?`, [bookingId]
    );
    if (rows.length === 0) {
      return { ok: false, error: 'Booking tidak ditemukan' };
    }
    const b = rows[0];

    const alasanGagal = await cekSyaratClosing(conn, b);
    if (alasanGagal) {
      return { ok: false, error: alasanGagal };
    }

    await conn.beginTransaction();
    await conn.query("UPDATE bookings SET status = 'selesai' WHERE id = ?", [bookingId]);

    const jml = b.jumlah_jamaah || 1;
    const paket = String(b.paket || 'deluxe').toLowerCase();
    const rincian = [];

    const berlaku = (b.kategori || 'group_resmi') === 'group_resmi';

    // Pemilik booking (b.user_id) — dipakai dua kali di bawah: (1) resolusi
    // referral perwakilan permanen kalau statusnya SEKARANG jamaah, (2) blok
    // referral sahabat reguler baru (poin C). Booking owner yang statusnya
    // SEKARANG jamaah SELALU pakai kolom permanen (bukan b.referral_perw_id
    // apa adanya), soalnya booking lama (pra-backfill) bisa masih nyimpen
    // nilai lama dari mekanisme dropdown yang mutable dulu — kolom permanen
    // adalah satu-satunya sumber kebenaran buat jamaah. Booking owner yang
    // BUKAN jamaah lagi (sudah upgrade jadi perwakilan/sahabat) pakai
    // b.referral_perw_id apa adanya seperti sebelumnya — closing MEREKA
    // SENDIRI sebagai perwakilan sudah lewat reseller-chain (perekrut_id) di
    // bawah, bukan lewat kolom permanen ini.
    const pemilikBooking = await getUser(conn, b.user_id);
    const referralPerwIdEfektif = pemilikBooking?.role === 'jamaah'
      ? (pemilikBooking.perekrut_perwakilan_jamaah_id || null)
      : b.referral_perw_id;

    // Margin reseller berjenjang perwakilan — TIDAK digate oleh kategori
    // program, karena ujroh perwakilan sendiri juga tidak pernah dibatasi
    // kategori. Ini satu-satunya skema komisi yang tersisa di sistem sejak
    // role agen & Leader dihapus. Dihitung PER KOMBO paket+kamar (bisa beda
    // per jamaah dalam 1 booking) bukan 1 kombo seragam × jml kayak dulu.
    if (referralPerwIdEfektif) {
      const grupJamaah = groupJamaahAktif(b);
      const perwakilanClosing = await getUser(conn, referralPerwIdEfektif);

      // Ujroh closing langsung milik SI PERWAKILAN SENDIRI (harga jual −
      // cost basis, per kombo paket+kamar) — sebelumnya cuma dihitung LIVE
      // di /api/perwakilan/dashboard, gak pernah tercatat permanen di
      // komisi_ledger. Sekarang DICATAT di sini (2026-09-02, dikonfirmasi
      // user) biar bisa masuk pipeline "Pencairan Ujroh Perwakilan" yang
      // sama persis polanya kayak pengajuan_ujroh Sahabat Baitullah — lahir
      // PENDING (dikonfirmasi_at NULL), baru "cair" setelah lewat
      // pengajuan→ACC→TF. costBasisPerwakilan otomatis pakai harga upline
      // kalau perwakilan ini direkrut perwakilan lain (skema reseller),
      // else HPP kantor — SAMA PERSIS logic yang dashboard pakai, jangan
      // dihitung ulang beda formula di 2 tempat.
      if (perwakilanClosing) {
        let hppTotalSendiri = 0;
        for (const g of grupJamaah) {
          const paketG = String(g.paket || 'deluxe').toLowerCase();
          const hppKantor = Number(b[`hpp_${paketG}_${g.kamarKey}`] || 0);
          const cost = await costBasisPerwakilan(conn, perwakilanClosing.id, b.prog_id, paketG, g.kamarKey, hppKantor);
          hppTotalSendiri += cost * g.count;
        }
        const ujrohSendiri = (b.total_harga || 0) - hppTotalSendiri;
        if (ujrohSendiri > 0) {
          await catat(conn, bookingId, perwakilanClosing, 'ujroh_perwakilan', ujrohSendiri, jml, paket,
            `Ujroh closing — ${b.prog_name}`);
          rincian.push({ penerima: perwakilanClosing.name, id: perwakilanClosing.id, role: perwakilanClosing.role, jenis: 'ujroh_perwakilan', nominal: ujrohSendiri });
        }
      }

      if (perwakilanClosing?.perekrut_id) {
        const perekrut = await getUser(conn, perwakilanClosing.perekrut_id);
        const adalahPerwakilan = (u) => u?.role === 'perwakilan' || u?.role_kedua === 'perwakilan';
        if (adalahPerwakilan(perekrut)) {
          let current = perekrut;
          let hop = 0;
          while (current && adalahPerwakilan(current) && hop < 20) {
            hop++;
            const [r] = await conn.query(
              'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [current.id, b.prog_id]
            );
            let marginTotal = 0;
            for (const g of grupJamaah) {
              const paketG = String(g.paket || 'deluxe').toLowerCase();
              const hppKantor = Number(b[`hpp_${paketG}_${g.kamarKey}`] || 0);
              const hargaCurrent = Number(r[0]?.[`jual_${paketG}_${g.kamarKey}`] || 0);
              if (hargaCurrent <= 0) continue;
              const cost = await costBasisPerwakilan(conn, current.id, b.prog_id, paketG, g.kamarKey, hppKantor);
              marginTotal += (hargaCurrent - cost) * g.count;
            }
            if (marginTotal > 0) {
              await catat(conn, bookingId, current, 'reseller_perwakilan', marginTotal, jml, paket,
                `Margin reseller dari closing ${perwakilanClosing.name}`);
              rincian.push({ penerima: current.name, id: current.id, role: current.role, jenis: 'reseller_perwakilan', nominal: marginTotal });
            }
            current = current.perekrut_id ? await getUser(conn, current.perekrut_id) : null;
          }
        }
      }
    }

    // Closing langsung sahabat — jamaah booking LANGSUNG (bukan nabung)
    // dibantu anggota sahabat, kategori TERPISAH dari komisi flat rekrutan
    // (yang dicatat di status-pendaftaran-sahabat saat rekrutan aktif, bukan
    // di sini).
    //
    // Dua skenario, dibedain dari SIAPA yang ada di referral_sahabat_id
    // (lihat src/lib/booking.js — self-checkout auto-atribusi ke Head of
    // Program, closing buat orang lain nyimpen id closer aslinya):
    //  - Checkout diri sendiri (referral_sahabat_id === head_of_program_user_id):
    //    persen dari harga booking (pengaturan.komisi_sahabat_closing_persen,
    //    global — dikonfirmasi user 2026-09-06 TETAP global, gak per-program,
    //    beda dari skenario closing jamaah lain di bawah), 100% ke Head of
    //    Program.
    //  - Closing buat jamaah LAIN yang booking program PUBLIK (bukan jadi
    //    gabung Sahabat Baitullah — skenario ini SENGAJA cuma relevan buat
    //    publish_type='public', dikonfirmasi user 2026-09-06, program
    //    publish_type='sahabat_baitullah' emang cuma bisa dicheckout jamaah
    //    Sahabat Baitullah sendiri jadi gak ada "closing jamaah lain" di
    //    situ): closer & Head of Program dua-duanya dapet nominal FIX
    //    PER-PROGRAM, independen satu sama lain (bukan potong-memotong 1
    //    pool) — direkomendasikan default Rp1jt (closer) & Rp2jt (HOP) pas
    //    admin bikin program baru, tapi tetap bisa diedit. Closer
    //    (programs.sahabat_closing_nominal_closer) dianggap pengganti
    //    voucher Rp1jt yang gak dia dapet karena orang yang diajak gak jadi
    //    gabung Sahabat Baitullah. HOP (programs.sahabat_closing_langsung_hop_nominal).
    //    Dua-duanya fallback ke Rp1jt/setting global lama kalau program itu
    //    belum diisi (program lama pra-fitur ini).
    if (b.referral_sahabat_id) {
      const [[pengaturanSahabat]] = await conn.query(
        'SELECT komisi_sahabat_closing_persen, sahabat_closing_langsung_hop_nominal, head_of_program_user_id FROM pengaturan WHERE id = 1'
      );
      const sahabatMember = await getUser(conn, b.referral_sahabat_id);
      const isSelfCheckout = pengaturanSahabat?.head_of_program_user_id
        && String(b.referral_sahabat_id) === String(pengaturanSahabat.head_of_program_user_id);

      // Identitas jamaah pemesan booking ini — dipakai buat keterangan
      // detail (nama + no. akun) di tiap baris ledger, biar rekap pengajuan
      // ujroh ke direktur jelas asal-usulnya, bukan cuma nama program
      // (dikonfirmasi user 2026-09-02).
      const jamaahBooking = await getUser(conn, b.user_id);
      const labelAtasNama = `atas nama ${jamaahBooking?.name || '-'} (No. Akun: ${jamaahBooking?.kode_unik || '-'}, Booking #${bookingId})`;

      if (isSelfCheckout) {
        const persen = Number(pengaturanSahabat?.komisi_sahabat_closing_persen || 0);
        const poolClosingLangsung = Math.round((b.total_harga || 0) * persen / 100);
        const tercatat = await catat(conn, bookingId, sahabatMember, 'closing_langsung_sahabat', poolClosingLangsung, jml, paket,
          `Closing Langsung — ${labelAtasNama} — ${b.prog_name}`);
        if (tercatat > 0) {
          rincian.push({ penerima: sahabatMember.name, id: sahabatMember.id, role: sahabatMember.role, jenis: 'closing_langsung_sahabat', nominal: tercatat });
        }
      } else {
        const closerNominal = Number(b.sahabat_closing_nominal_closer ?? 1_000_000);
        const hopNominal = Number(b.sahabat_closing_langsung_hop_nominal ?? pengaturanSahabat?.sahabat_closing_langsung_hop_nominal ?? 0);

        if (pengaturanSahabat?.head_of_program_user_id) {
          const hop = await getUser(conn, pengaturanSahabat.head_of_program_user_id);
          const tercatatHop = await catat(conn, bookingId, hop, 'closing_langsung_sahabat', hopNominal, jml, paket,
            `Bagian Head of Program — closing ${labelAtasNama} oleh ${sahabatMember?.name || '-'} — ${b.prog_name}`);
          if (tercatatHop > 0) {
            rincian.push({ penerima: hop.name, id: hop.id, role: hop.role, jenis: 'closing_langsung_sahabat', nominal: tercatatHop });
          }
        }

        const tercatatCloser = await catat(conn, bookingId, sahabatMember, 'closing_langsung_sahabat', closerNominal, jml, paket,
          `Closing Langsung — ${labelAtasNama} — ${b.prog_name}`);
        if (tercatatCloser > 0) {
          rincian.push({ penerima: sahabatMember.name, id: sahabatMember.id, role: sahabatMember.role, jenis: 'closing_langsung_sahabat', nominal: tercatatCloser });
        }
      }
    }

    // Referral permanen sahabat (Sahabat Baitullah) buat jamaah yg closing
    // program REGULER — komisi flat 1jt, TERPISAH TOTAL dari
    // referral_sahabat_id (closing_langsung_sahabat) di atas: keduanya
    // bisa sama-sama tercatat utk 1 booking yang sama kalau kebetulan
    // sahabat member yang bantu closing juga sama dgn perekrut permanennya
    // (dua baris ledger beda jenis, BUKAN dianggap dobel bayar —
    // closing_langsung_sahabat = "bantu closing booking ini",
    // referral_closing_reguler_sahabat = "yg merekrut dia jadi jamaah dari
    // awal", dua hal beda yg kebetulan bisa jatuh ke orang yang sama).
    // Digate publish_type !== 'sahabat_baitullah' — program Sahabat Baitullah sendiri
    // punya cascade 5-generasi terpisah total di status-pendaftaran-sahabat,
    // gak boleh disentuh/dobel di sini.
    if (pemilikBooking?.role === 'jamaah' && pemilikBooking.perekrut_sahabat_jamaah_id
        && b.publish_type !== 'sahabat_baitullah') {
      const sahabatReferrer = await getUser(conn, pemilikBooking.perekrut_sahabat_jamaah_id);
      const NOMINAL_REFERRAL_REGULER_SAHABAT = 1_000_000;
      const tercatatReferral = await catat(conn, bookingId, sahabatReferrer, 'referral_closing_reguler_sahabat',
        NOMINAL_REFERRAL_REGULER_SAHABAT, jml, paket,
        `Referral pendaftaran — atas nama ${pemilikBooking?.name || '-'} (Booking #${bookingId}) — ${b.prog_name}`);
      if (tercatatReferral > 0) {
        rincian.push({ penerima: sahabatReferrer.name, id: sahabatReferrer.id, role: sahabatReferrer.role, jenis: 'referral_closing_reguler_sahabat', nominal: tercatatReferral });
      }
    }

    await conn.commit();

    // Notifikasi & audit dikirim SETELAH commit — kalau ada yang gagal di sini,
    // booking & komisi yang sudah tercatat tidak perlu ikut di-rollback.
    const otomatis = actor?.id === 'SYSTEM';
    await catatAudit(pool, {
      actor,
      aksi: 'booking_selesai',
      target_type: 'booking',
      target_id: bookingId,
      keterangan: `${b.prog_name || '-'} — total komisi dicairkan: ${rincian.length} baris${otomatis ? ' (closing otomatis)' : ''}`,
    });

    await kirimNotifikasi(pool, {
      user_id: b.user_id,
      tipe: 'booking_selesai',
      judul: 'Booking Selesai',
      pesan: `Perjalanan ${b.prog_name || ''} Anda berstatus selesai. Selamat menunaikan ibadah!`,
      link: '/dashboard/jamaah',
    });

    // Notifikasi di sini SENGAJA bilang "tercatat" bukan "cair" — baris
    // komisi_ledger yang baru diinsert masih `dikonfirmasi_at IS NULL`
    // (pending), duitnya BELUM ditransfer. Sama pola kayak Sahabat Baitullah
    // (saldo_pending vs saldo_tabungan_umroh terkonfirmasi) — dikonfirmasi
    // user 2026-09-03, sebelumnya judulnya "Komisi Cair" nyiratkan udah
    // ditransfer padahal belum. Link juga dibikin role-aware (dulu selalu
    // ke dashboard perwakilan walau penerimanya sahabat).
    for (const r of rincian) {
      if (!r.id) continue;
      if (r.nominal > 0) {
        await kirimNotifikasi(pool, {
          user_id: r.id,
          tipe: 'komisi_tercatat',
          judul: 'Ujroh Tercatat — Menunggu Pencairan',
          pesan: `${JENIS_LABEL[r.jenis] || 'Ujroh'} Rp ${Number(r.nominal).toLocaleString('id-ID')} dari closing ${b.prog_name || ''} sudah tercatat sebagai saldo pending, menunggu proses pencairan admin.`,
          // Dipilih dari JENIS komisinya, bukan role penerima — akun
          // dual-role (role_kedua) bisa nerima jenis sahabat walau role
          // utamanya perwakilan, link notif harus tetap ke dashboard yang
          // relevan sama jenis komisinya.
          link: r.jenis.includes('sahabat_baitullah') ? '/dashboard/sahabat' : '/dashboard/perwakilan',
        });
      }
    }

    return { ok: true, skema_berlaku: berlaku, rincian };
  } catch (error) {
    try { await conn.rollback(); } catch {}
    console.error(error);
    return { ok: false, error: 'Terjadi kesalahan server' };
  } finally {
    conn.release();
  }
}
