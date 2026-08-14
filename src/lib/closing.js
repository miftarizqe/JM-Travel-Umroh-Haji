import pool from '@/lib/db';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';

const JENIS_LABEL = {
  reseller_perwakilan: 'Margin reseller',
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
    'SELECT id, name, role, perekrut_id FROM users WHERE id = ?', [id]
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
export async function cariPotensiResellerLangsung(conn, myId) {
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
              p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
              p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
              p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
       FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.referral_perw_id = ? AND b.status IN ('active','menunggu_batal')`,
      [d.id]
    );
    for (const b of rows) {
      const paket = String(b.paket || 'deluxe').toLowerCase();
      const kamarKey = kamarKeyOf(b.kamar);
      const hppKantor = Number(b[`hpp_${paket}_${kamarKey}`] || 0);
      const jml = b.jumlah_jamaah || 1;
      // Harga & cost basis dipakai adalah milik SAYA (penerima margin), bukan
      // milik downline yang closing — sama seperti loop reseller_perwakilan
      // di prosesBookingSelesai.
      const [ph] = await conn.query(
        'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [myId, b.prog_id]
      );
      const hargaJual = Number(ph[0]?.[`jual_${paket}_${kamarKey}`] || 0);
      const cost = await costBasisPerwakilan(conn, myId, b.prog_id, paket, kamarKey, hppKantor);
      if (hargaJual <= 0) continue;
      const nominal = (hargaJual - cost) * jml;
      if (nominal <= 0) continue;
      potensi += nominal;
      bookings.push({
        id: b.id, prog_name: b.prog_name, paket: b.paket, kamar: b.kamar,
        jumlah_jamaah: jml, status: b.status,
        closer_nama: d.name, downline_id: d.id, potensi_nominal: nominal,
      });
    }
  }
  return { potensi, bookings };
}

function kamarKeyOf(kamar) {
  const k = String(kamar || '').toLowerCase();
  if (k.includes('quad')) return 'quad';
  if (k.includes('double')) return 'double';
  return 'triple';
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
      `SELECT b.*, p.kategori, p.tanggal_berangkat,
              p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
              p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
              p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
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

    // Margin reseller berjenjang perwakilan — TIDAK digate oleh kategori
    // program, karena ujroh perwakilan sendiri juga tidak pernah dibatasi
    // kategori. Ini satu-satunya skema komisi yang tersisa di sistem sejak
    // role agen & Leader dihapus.
    if (b.referral_perw_id) {
      const kamarKeyReseller = kamarKeyOf(b.kamar);
      const hppKantor = Number(b[`hpp_${paket}_${kamarKeyReseller}`] || 0);
      const perwakilanClosing = await getUser(conn, b.referral_perw_id);

      if (perwakilanClosing?.perekrut_id) {
        const perekrut = await getUser(conn, perwakilanClosing.perekrut_id);
        if (perekrut?.role === 'perwakilan') {
          let current = perekrut;
          let hop = 0;
          while (current && current.role === 'perwakilan' && hop < 20) {
            hop++;
            const [r] = await conn.query(
              'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [current.id, b.prog_id]
            );
            const hargaCurrent = Number(r[0]?.[`jual_${paket}_${kamarKeyReseller}`] || 0);
            if (hargaCurrent > 0) {
              const cost = await costBasisPerwakilan(conn, current.id, b.prog_id, paket, kamarKeyReseller, hppKantor);
              const margin = (hargaCurrent - cost) * jml;
              await catat(conn, bookingId, current, 'reseller_perwakilan', margin, jml, paket,
                `Margin reseller dari closing ${perwakilanClosing.name}`);
              rincian.push({ penerima: current.name, id: current.id, role: current.role, jenis: 'reseller_perwakilan', nominal: margin });
            }
            current = current.perekrut_id ? await getUser(conn, current.perekrut_id) : null;
          }
        }
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

    for (const r of rincian) {
      if (!r.id) continue;
      if (r.nominal > 0) {
        await kirimNotifikasi(pool, {
          user_id: r.id,
          tipe: 'komisi_cair',
          judul: 'Komisi Cair',
          pesan: `${JENIS_LABEL[r.jenis] || 'Komisi'} Rp ${Number(r.nominal).toLocaleString('id-ID')} dari closing ${b.prog_name || ''}.`,
          link: '/dashboard/perwakilan',
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
