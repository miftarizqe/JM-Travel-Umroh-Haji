import pool from '@/lib/db';
import { wajibRole, wajibLogin } from '@/lib/auth';
import { kirimNotifikasi, kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { generateOrUpdateKwitansi, generateTandaTerimaUntukPayment } from '@/lib/invoiceKwitansi';
import { cekDanFinalisasiLunasSahabat } from '@/lib/pembayaranSahabatMandiri';
import { lepasHoldSaldoSahabat } from '@/lib/saldoSahabat';
import { catatRekening } from '@/lib/rekeningLedger';
import { potongKuotaSeatDp } from '@/lib/booking';
import { hitungSisaBayar } from '@/lib/pelunasan';

// GET — payments (admin/booking), termasuk bukti transfer
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    const status = searchParams.get('status');

    // JOIN bookings + referral perwakilan — dipakai buat nyusun pesan
    // WhatsApp ke jamaah (jamaah_data punya wa per orang) & ke perwakilan
    // yang refer booking ini (notifikasi ada closing baru pakai kode mereka).
    // JOIN invoice_kwitansi 2x — ttu (Tanda Terima Uang, PER PAYMENT lewat
    // payment_id, relevan buat type='dp') & kw (Kwitansi, PER BOOKING karena
    // 1 booking cuma punya 1 Kwitansi final, relevan buat type='lunas') —
    // dipakai nunjukin penanda "udah dikirim apa belum" di list Konfirmasi
    // Pembayaran tanpa admin perlu buka tiap dokumen satu-satu (dikonfirmasi
    // user 2026-10-14).
    let query = `
      SELECT p.*, COALESCE(u.name, p.nama) AS nama,
             b.prog_name, b.jamaah_data, b.jumlah_jamaah, b.total_harga, b.dp_amount,
             b.referral_perw_id, b.referral_kode,
             ref.name AS referral_nama, ref.wa AS referral_wa,
             ttu.terkirim AS ttu_terkirim, kw.terkirim AS kwitansi_terkirim
      FROM payments p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN users ref ON ref.id = b.referral_perw_id
      LEFT JOIN invoice_kwitansi ttu ON ttu.payment_id = p.id AND ttu.jenis = 'tanda_terima'
      LEFT JOIN invoice_kwitansi kw ON kw.booking_id = p.booking_id AND kw.jenis = 'kwitansi'
    `;
    const params = [];

    if (bookingId) {
      query += ' WHERE p.booking_id = ?';
      params.push(bookingId);
    } else if (status) {
      query += ' WHERE p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.created_at DESC';

    const [payments] = await pool.query(query, params);
    return Response.json({ payments });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — submit bukti pembayaran (bukti_path WAJIB)
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { booking_id, user_id, type, amount, kode_unik, bukti_path, bukti_nama, voucher_kode } = await request.json();

    if (!booking_id || !user_id || !type || !amount) {
      return Response.json({ error: 'Field wajib tidak lengkap' }, { status: 400 });
    }
    // Bukti transfer wajib — tidak boleh submit tanpa bukti
    if (!bukti_path) {
      return Response.json({ error: 'Bukti transfer wajib diunggah' }, { status: 400 });
    }

    const [bookings] = await pool.query(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [booking_id, user_id]
    );
    if (bookings.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }

    // Pelunasan hanya boleh setelah formulir jamaah lengkap
    if (type === 'lunas' && bookings[0].form_filled < bookings[0].form_total) {
      return Response.json(
        { error: 'Formulir jamaah belum lengkap. Lengkapi dulu sebelum pelunasan.' },
        { status: 400 }
      );
    }

    // Pelunasan hanya boleh setelah setuju Surat Perjanjian Jamaah Umroh —
    // SETUJU ONLINE SAJA SUDAH CUKUP (dikonfirmasi user 2026-10-13). Materai
    // + TTD fisik beneran dilakukan BELAKANGAN (jamaah ke kantor, atau
    // paling lambat pas sesi manasik), disiapkan & diproses manajemen
    // sendiri — BUKAN syarat jamaah bisa bayar pelunasan, jadi SENGAJA
    // gak dicek lagi di sini (dulu ada gerbang kedua yang mewajibkan
    // perjanjian_scan_path/TTD digital 'selesai' juga, itu yang bikin
    // jamaah "nyangkut" nunggu admin padahal proses fisiknya emang baru
    // kejadian pas manasik — gerbang itu dihapus). Kriteria SAMA PERSIS
    // perjanjianSelesai() di src/lib/bookingStage.js & client di
    // /pelunasan, jangan hitung ulang beda logic di tempat lain.
    if (type === 'lunas' && !bookings[0].setuju_pks) {
      return Response.json(
        { error: 'Anda belum menyetujui Surat Perjanjian Jamaah Umroh. Setujui dulu sebelum pelunasan.' },
        { status: 400 }
      );
    }

    // Cicilan pelunasan (dikonfirmasi user 2026-10-14): jamaah boleh bayar
    // SEBAGIAN sisa tagihan, gak harus sekali lunas total — nominal cuma
    // divalidasi gak boleh 0/minus atau NGELEBIHIN sisa yang beneran
    // kurang (dihitung dari total_harga - dp_amount - SEMUA lunas yang
    // udah confirmed, lihat hitungSisaBayar). Submission kedua ditolak
    // selagi masih ada 1 yang pending, biar gak numpuk bukti yang
    // belum diproses admin satu per satu.
    // Voucher dipakai PAS PELUNASAN (beda dari voucher checkout yang udah
    // kepotong di total_harga sejak awal) — nominalnya cuma mengecilkan
    // `amount` yang disetor, JADI harus disimpan di payment ini biar admin
    // approve nanti bisa ngurangin total_harga booking senilai yang sama
    // (migration 226). Kalau enggak, hitungSisaBayar bakal nganggep ada
    // sisa senilai diskon SELAMANYA karena dari sisi total_harga emang
    // gak pernah berkurang (ditemukan & diperbaiki 2026-10-14, bareng
    // cicilan pelunasan).
    let diskonVoucher = 0;
    if (type === 'lunas' && voucher_kode) {
      const [[v]] = await pool.query('SELECT * FROM vouchers WHERE kode = ?', [voucher_kode.toUpperCase()]);
      if (!v) return Response.json({ error: 'Voucher tidak ditemukan' }, { status: 400 });
      if (v.used) return Response.json({ error: 'Voucher sudah digunakan' }, { status: 400 });
      if (new Date(v.valid_until) < new Date()) return Response.json({ error: 'Voucher sudah kadaluarsa' }, { status: 400 });
      if (v.for_user && v.for_user !== user_id) return Response.json({ error: 'Voucher tidak berlaku untuk akun ini' }, { status: 400 });
      diskonVoucher = Number(v.potongan || 0);
    }

    if (type === 'lunas') {
      const sisa = await hitungSisaBayar(pool, booking_id);
      if (sisa <= 0) {
        return Response.json({ error: 'Booking ini sudah lunas, tidak ada sisa tagihan.' }, { status: 400 });
      }
      if (Number(amount) <= 0) {
        return Response.json({ error: 'Nominal pembayaran harus lebih dari 0.' }, { status: 400 });
      }
      if (Number(amount) + diskonVoucher > sisa) {
        return Response.json({ error: `Nominal melebihi sisa tagihan (Rp${sisa.toLocaleString('id-ID')}).` }, { status: 400 });
      }
      const [[pendingLunas]] = await pool.query(
        `SELECT id FROM payments WHERE booking_id = ? AND type = 'lunas' AND status = 'pending'`,
        [booking_id]
      );
      if (pendingLunas) {
        return Response.json({ error: 'Masih ada pembayaran pelunasan yang menunggu konfirmasi admin. Tunggu diproses dulu sebelum kirim lagi.' }, { status: 400 });
      }
    }

    const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [user_id]);
    const nama = users.length ? users[0].name : null;

    await pool.query(
      `INSERT INTO payments
       (booking_id, user_id, nama, type, amount, kode_unik, bukti_path, bukti_nama, bukti_uploaded_at, status, voucher_kode, diskon_voucher)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'pending', ?, ?)`,
      [booking_id, user_id, nama, type, amount, kode_unik || 0, bukti_path, bukti_nama || null,
       diskonVoucher > 0 ? voucher_kode.toUpperCase() : null, diskonVoucher > 0 ? diskonVoucher : null]
    );

    if (type === 'lunas') {
      await pool.query(
        "UPDATE bookings SET pelunasan_status = 'pending_confirm' WHERE id = ?",
        [booking_id]
      );
    }

    await kirimNotifikasiAdmin(pool, {
      tipe: 'pembayaran_baru',
      judul: `Bukti ${type === 'lunas' ? 'Pelunasan' : 'DP'} Baru`,
      pesan: `${nama || 'Jamaah'} mengirim bukti ${type === 'lunas' ? 'pelunasan' : 'DP'} untuk booking ${booking_id}.`,
      link: '/admin?tab=payments',
    });

    return Response.json(
      { message: 'Bukti pembayaran berhasil dikirim! Menunggu konfirmasi admin.' },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH — admin approve/reject payment
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { payment_id, action, reject_reason } = await request.json();

    if (!payment_id || !action) {
      return Response.json({ error: 'payment_id dan action wajib diisi' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'Action harus approve atau reject' }, { status: 400 });
    }

    const [payments] = await pool.query('SELECT * FROM payments WHERE id = ?', [payment_id]);
    if (payments.length === 0) {
      return Response.json({ error: 'Payment tidak ditemukan' }, { status: 404 });
    }
    const payment = payments[0];

    const [bookingRows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [payment.booking_id]);
    const booking = bookingRows[0];
    // Kalau booking di-order-kan perwakilan, dua-duanya (jamaah & orderer) perlu tahu.
    const penerimaNotif = [booking?.user_id, booking?.ordered_by].filter((id, i, arr) => id && arr.indexOf(id) === i);

    if (action === 'approve') {
      // Kuota kursi dicek & dipotong DI SINI (dikonfirmasi user 2026-10-13,
      // bukan lagi pas checkout) -- paling duluan, SEBELUM payment ditandai
      // confirmed, biar kalau kuota ternyata udah penuh, gak ada mutasi
      // sama sekali yang kepaksa setengah jalan (approve-nya gagal bersih).
      if (payment.type === 'dp') {
        await potongKuotaSeatDp(pool, payment.booking_id);
      }

      await pool.query("UPDATE payments SET status = 'confirmed' WHERE id = ?", [payment_id]);

      // Rekening Alkhalid Jaya Megah — uang masuk dari SEMUA pembayaran
      // program umroh biasa (DP maupun pelunasan), KECUALI booking Program
      // Sahabat Baitullah eksklusif (publish_type='sahabat_baitullah', checkout
      // mandiri) — itu bukan penjualan umroh reguler, sengaja gak dihitung
      // ke rekening manapun di sini (dikonfirmasi user 2026-09-02).
      try {
        const [[prog]] = await pool.query('SELECT publish_type FROM programs WHERE id = ?', [booking?.prog_id]);
        if (prog?.publish_type !== 'sahabat_baitullah') {
          await catatRekening(pool, {
            rekening: 'alkhalid', jenis: 'masuk', sumber_tipe: payment.type === 'lunas' ? 'payment_lunas' : 'payment_dp',
            sumber_id: payment.id, nominal: payment.amount,
            keterangan: `${payment.type === 'lunas' ? 'Pelunasan' : 'DP'} — ${booking?.prog_name || payment.booking_id} (${payment.nama || '-'})`,
          });
        }
      } catch (e) {
        console.error('Gagal catat rekening Alkhalid:', e);
      }

      // Booking checkout-mandiri Program Sahabat Baitullah (bayar dari saldo
      // tabungan + sisa pribadi) butuh KEDUA sumber dana di-acc admin dulu
      // sebelum beneran lunas (dikonfirmasi user 2026-08-29) — kalau booking
      // ini punya baris pemakaian_saldo_sahabat terkait, JANGAN langsung set
      // paid di sini, serahkan ke cekDanFinalisasiLunasSahabat yang cek
      // dua-duanya. Booking normal (99% kasus) TIDAK punya baris ini sama
      // sekali — perilaku di bawah SAMA PERSIS kayak sebelumnya, zero regresi.
      let punyaDebitSaldo = false;
      if (payment.type === 'lunas') {
        // Cuma program eksklusif — hold saldo di program REGULER itu bayar DP
        // (bayar_dp_dari_saldo di /api/bookings/batch), pelunasannya tetap
        // alur transfer biasa.
        const [[debit]] = await pool.query(
          `SELECT kl.id FROM komisi_ledger kl JOIN bookings b ON b.id = kl.booking_id JOIN programs p ON p.id = b.prog_id
           WHERE kl.booking_id = ? AND kl.jenis = 'pemakaian_saldo_sahabat' AND p.publish_type = 'sahabat_baitullah'`,
          [payment.booking_id]
        );
        punyaDebitSaldo = !!debit;
      }

      if (payment.type === 'dp') {
        await pool.query("UPDATE bookings SET dp_status = 'confirmed' WHERE id = ?", [payment.booking_id]);
        // DP reguler yang dibayar dari saldo Sahabat — hold saldonya ikut
        // ditandai confirmed (saldo SUDAH kepotong dari detik checkout, ini
        // cuma status resmi) biar gak perlu ACC dua kali di tab komisi.
        await pool.query(
          `UPDATE komisi_ledger kl JOIN bookings b ON b.id = kl.booking_id JOIN programs p ON p.id = b.prog_id
           SET kl.dikonfirmasi_at = NOW()
           WHERE kl.booking_id = ? AND kl.jenis = 'pemakaian_saldo_sahabat' AND kl.dikonfirmasi_at IS NULL
             AND p.publish_type != 'sahabat_baitullah'`,
          [payment.booking_id]
        );
      }

      // Voucher pelunasan (migration 226) — nominalnya cuma ngecilin amount
      // yang disetor, JADI total_harga booking harus dikurangi senilai yang
      // sama DI SINI (pas beneran di-ACC, bukan pas submit) biar
      // hitungSisaBayar di bawah bisa bener-bener nutup ke 0, bukan
      // nyangkut selamanya senilai diskon (ditemukan & diperbaiki
      // 2026-10-14, bareng cicilan pelunasan — lihat src/lib/pelunasan.js).
      if (payment.type === 'lunas' && Number(payment.diskon_voucher) > 0) {
        await pool.query(
          'UPDATE bookings SET total_harga = GREATEST(0, total_harga - ?) WHERE id = ?',
          [payment.diskon_voucher, payment.booking_id]
        );
      }

      // Cicilan pelunasan (dikonfirmasi user 2026-10-14): 1 payment type=
      // 'lunas' TIDAK OTOMATIS berarti lunas total lagi — dicek beneran
      // nutup SISA tagihan apa belum (hitungSisaBayar jumlahin SEMUA lunas
      // confirmed TERMASUK yang baru aja di-UPDATE confirmed di atas).
      // Belum nutup -> balik ke 'unpaid' (BUKAN 'paid'), jamaah masih bisa
      // kirim cicilan berikutnya dari /pelunasan kayak biasa.
      let lunasSelesai = false;
      if (payment.type === 'lunas' && !punyaDebitSaldo) {
        const sisaSetelahIni = await hitungSisaBayar(pool, payment.booking_id);
        lunasSelesai = sisaSetelahIni <= 0;
        await pool.query("UPDATE bookings SET pelunasan_status = ? WHERE id = ?", [lunasSelesai ? 'paid' : 'unpaid', payment.booking_id]);
      }

      // Tanda Terima Uang digenerate OTOMATIS buat DP confirmed ATAU
      // cicilan pelunasan yang BELUM nutup semua sisa — 1 dokumen per
      // payment, bukti uang itu spesifik diterima (fungsi ini idempotent,
      // aman dipanggil kapan pun). Gagal generate JANGAN sampai gagalin
      // approve pembayarannya sendiri — makanya try/catch.
      //
      // Cuma di-SKIP kalau payment INI yang bikin pelunasan_status jadi
      // 'paid' (dikonfirmasi user 2026-10-14, "gausah TTU, bisa aja
      // langsung kwitansi") — payment itu SELALU ikut memicu Kwitansi
      // (generateOrUpdateKwitansi di bawah), jadi TTU-nya jadi dokumen
      // kembar yang gak pernah perlu dikirim sendiri.
      if (!(payment.type === 'lunas' && lunasSelesai)) {
        try {
          await generateTandaTerimaUntukPayment(pool, payment.id, auth.user.id);
        } catch (e) {
          console.error('Gagal auto-generate tanda terima:', e);
        }
      }

      if (payment.type === 'lunas' && punyaDebitSaldo) {
        // Cek 2 sumber dana (saldo + topup) — kalau saldo-nya juga udah
        // di-acc, ini yang bakal nge-set paid + generate Kwitansi/invoice.
        try {
          await cekDanFinalisasiLunasSahabat(pool, payment.booking_id, auth.user);
        } catch (e) {
          console.error('Gagal finalisasi lunas sahabat mandiri:', e);
        }
      } else if (payment.type === 'lunas' && lunasSelesai) {
        // Kwitansi Pembayaran & auto-settle Invoice cuma jalan begitu
        // BENERAN lunas total (lunasSelesai, bukan cuma 1 cicilan
        // confirmed — dikonfirmasi user 2026-10-14). generateOrUpdateKwitansi
        // sendiri udah ada gerbang internal (pelunasan_status!=='paid' ->
        // null), tapi auto-settle Invoice di bawah ini GAK PUNYA gerbang
        // serupa — makanya kondisi lunasSelesai WAJIB dicek di sini juga,
        // kalau enggak Invoice bisa ke-tandain "paid" padahal baru dicicil
        // sebagian. Nomor Kwitansi dibekukan pas lunas total pertama kali.
        try {
          await generateOrUpdateKwitansi(pool, payment.booking_id, auth.user.id);
        } catch (e) {
          console.error('Gagal auto-generate kwitansi:', e);
        }

        // Kalau sebelumnya udah pernah digenerate Invoice buat booking ini
        // (sbg tagihan, sebelum dibayar — bisa DP/Pelunasan/cicilan apa aja,
        // Invoice sekarang gak dibedain jenisnya lagi), begitu booking ini
        // beneran lunas total di sini, tandai semua Invoice-nya lunas
        // otomatis — nomor tetap sama, gak bikin dokumen baru, admin gak
        // perlu toggle status manual lagi.
        try {
          await pool.query(
            "UPDATE invoice_kwitansi SET status = 'paid' WHERE booking_id = ? AND jenis = 'invoice' AND status != 'paid'",
            [payment.booking_id]
          );
        } catch (e) {
          console.error('Gagal auto-settle invoice:', e);
        }
      }

      // Notifikasi "dikonfirmasi" ke jamaah SENGAJA di-skip buat jalur
      // punyaDebitSaldo — cekDanFinalisasiLunasSahabat yang kirim notifnya
      // sendiri, TAPI CUMA kalau beneran udah lunas 2-2nya (biar jamaah gak
      // dapet notif "lunas" padahal masih nunggu acc saldo).
      if (!(payment.type === 'lunas' && punyaDebitSaldo)) {
        // Wording beda buat cicilan (belum nutup semua sisa) vs pelunasan
        // beneran tuntas (dikonfirmasi user 2026-10-14) — jamaah perlu tau
        // ini baru SEBAGIAN, bukan udah kelar semua.
        const labelLunas = payment.type === 'lunas' ? (lunasSelesai ? 'Pelunasan' : 'Cicilan Pelunasan') : 'DP';
        for (const uid of penerimaNotif) {
          await kirimNotifikasi(pool, {
            user_id: uid,
            tipe: payment.type === 'lunas' ? (lunasSelesai ? 'pelunasan_confirmed' : 'cicilan_confirmed') : 'dp_confirmed',
            judul: `${labelLunas} Dikonfirmasi`,
            pesan: `${labelLunas} booking ${booking?.prog_name || payment.booking_id} sudah dikonfirmasi admin.${payment.type === 'lunas' && !lunasSelesai ? ' Masih ada sisa tagihan yang belum dibayar.' : ''}`,
            link: '/dashboard/jamaah',
          });
        }
      }

      await catatAudit(pool, {
        actor: auth.user,
        aksi: payment.type === 'lunas' ? 'approve_pelunasan' : 'approve_dp',
        target_type: 'payment',
        target_id: payment_id,
        keterangan: `Booking ${payment.booking_id} (${booking?.prog_name || '-'})`,
      });

      return Response.json({ message: 'Pembayaran berhasil dikonfirmasi!' });
    } else {
      await pool.query(
        "UPDATE payments SET status = 'rejected', reject_reason = ? WHERE id = ?",
        [reject_reason || 'Ditolak oleh admin', payment_id]
      );
      if (payment.type === 'lunas') {
        await pool.query("UPDATE bookings SET pelunasan_status = 'unpaid' WHERE id = ?", [payment.booking_id]);
      }
      // DP dari saldo Sahabat ditolak — balikin saldonya (hapus hold yang
      // belum di-ACC), sama kayak booking dibatalkan.
      if (payment.type === 'dp' && booking) {
        const [[pr]] = await pool.query('SELECT publish_type FROM programs WHERE id = ?', [booking.prog_id]);
        if (pr?.publish_type !== 'sahabat_baitullah') await lepasHoldSaldoSahabat(pool, payment.booking_id);
      }

      for (const uid of penerimaNotif) {
        await kirimNotifikasi(pool, {
          user_id: uid,
          tipe: 'pembayaran_rejected',
          judul: 'Pembayaran Ditolak',
          pesan: `${payment.type === 'lunas' ? 'Pelunasan' : 'DP'} booking ${booking?.prog_name || payment.booking_id} ditolak: ${reject_reason || 'Ditolak oleh admin'}`,
          link: '/dashboard/jamaah',
        });
      }

      await catatAudit(pool, {
        actor: auth.user,
        aksi: payment.type === 'lunas' ? 'reject_pelunasan' : 'reject_dp',
        target_type: 'payment',
        target_id: payment_id,
        keterangan: `Booking ${payment.booking_id} (${booking?.prog_name || '-'}): ${reject_reason || 'Ditolak oleh admin'}`,
      });

      return Response.json({ message: 'Pembayaran ditolak.' });
    }
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
