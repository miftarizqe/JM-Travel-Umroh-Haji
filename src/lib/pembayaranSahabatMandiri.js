// Finalisasi pembayaran booking Program Sahabat Baitullah checkout mandiri —
// dibayar dari saldo tabungan umroh (+ Transfer Langsung buat sisanya kalau
// saldo kurang, dibuka lagi 2026-10-16 — sebelumnya dicabut 2026-09-29). Booking
// dianggap LUNAS begitu baris debit `pemakaian_saldo_sahabat` di
// komisi_ledger di-acc admin. `bayar` (payments type='lunas') cuma ada
// kalau saldo kurang & jamaah pilih Transfer Langsung buat sisanya
// (dibuka lagi, dikonfirmasi user 2026-10-16) — lunas setelah KEDUANYA di-acc.
import { kirimNotifikasi } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { generateOrUpdateKwitansi, generateTandaTerimaUntukPayment } from '@/lib/invoiceKwitansi';
import { potongKuotaSeatDp } from '@/lib/booking';
import { formLengkap, perjanjianSelesai } from '@/lib/bookingStage';

// Gerbang ACC admin booking Program Sahabat Baitullah (dikonfirmasi user
// 2026-10-16): pembayaran saldo/transfer langsungnya BARU boleh di-ACC
// (= booking jadi lunas) setelah formulir jamaah lengkap & SPJ disetujui —
// aturan pembatalan/refund ada di SPJ, booking lunas tanpa SPJ gak punya
// pegangan. Sama posisinya kayak program reguler yang gak bisa pelunasan
// sebelum setuju SPJ (gerbang di POST /api/payments). Saldo jamaah tetap
// aman, udah ke-hold sejak checkout — ini cuma nahan status "resmi lunas".
// Return null kalau boleh di-ACC (atau bukan booking program eksklusif),
// selain itu kalimat alasan buat ditampilin ke admin.
export async function alasanBelumBisaAccSahabat(pool, bookingId) {
  const [[b]] = await pool.query(
    `SELECT b.form_filled, b.form_total, b.setuju_pks, b.perjanjian_scan_path, p.publish_type,
            (SELECT ds.fase FROM dokumen_signature ds WHERE ds.dokumen = 'jamaah' AND ds.ref_id = b.id LIMIT 1) AS sig_fase
     FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id WHERE b.id = ?`,
    [bookingId]
  );
  if (!b || b.publish_type !== 'sahabat_baitullah') return null;
  const belum = [];
  if (!formLengkap(b)) belum.push(`formulir jamaah belum lengkap (${b.form_filled || 0}/${b.form_total || 0})`);
  if (!perjanjianSelesai({ ...b, perjanjian_sig: b.sig_fase ? { fase: b.sig_fase } : null })) belum.push('Surat Perjanjian Jamaah (SPJ) belum disetujui');
  return belum.length ? `Booking ${bookingId} belum bisa dikonfirmasi: ${belum.join(' & ')}.` : null;
}

export async function cekDanFinalisasiLunasSahabat(pool, bookingId, actor) {
  // Hold saldo di booking program REGULER itu bayar DP (lihat
  // /api/bookings/batch bayar_dp_dari_saldo), bukan lunas penuh — jangan
  // sampai ACC-nya bikin booking reguler ke-set 'paid'.
  const [[progInfo]] = await pool.query(
    'SELECT p.publish_type FROM bookings b JOIN programs p ON p.id = b.prog_id WHERE b.id = ?',
    [bookingId]
  );
  if (progInfo && progInfo.publish_type !== 'sahabat_baitullah') {
    return konfirmasiDpDariSaldoSahabat(pool, bookingId, actor);
  }

  const [[debit]] = await pool.query(
    "SELECT dikonfirmasi_at FROM komisi_ledger WHERE booking_id = ? AND jenis = 'pemakaian_saldo_sahabat'",
    [bookingId]
  );
  const saldoOk = !debit || debit.dikonfirmasi_at != null;

  const [[bayar]] = await pool.query(
    "SELECT id, status FROM payments WHERE booking_id = ? AND type = 'lunas' ORDER BY id DESC LIMIT 1",
    [bookingId]
  );
  const topupOk = !bayar || bayar.status === 'confirmed';

  if (!saldoOk || !topupOk) return false;

  const [[booking]] = await pool.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking || booking.pelunasan_status === 'paid') return false;

  await pool.query("UPDATE bookings SET pelunasan_status = 'paid' WHERE id = ?", [bookingId]);

  if (!bayar?.id) {
    // Saldo nutup penuh, gak ada transfer pribadi sama sekali — sintesis 1
    // baris `payments` (langsung 'confirmed', gak ada bukti buat diverifikasi
    // karena emang gak ada transfer) biar booking ini tetap punya jejak
    // pelunasan di tabel payments, konsisten sama booking lain (dipakai
    // list Konfirmasi Pembayaran admin, dll) — TTU-nya sendiri sengaja
    // udah gak dibuat lagi buat payment ini (lihat komentar di bawah).
    const [[u]] = await pool.query('SELECT name FROM users WHERE id = ?', [booking.user_id]);
    await pool.query(
      `INSERT INTO payments (booking_id, user_id, nama, type, amount, kode_unik, status)
       VALUES (?, ?, ?, 'lunas', ?, 0, 'confirmed')`,
      [bookingId, booking.user_id, u?.name || null, booking.total_harga]
    );
  }

  // TTU SENGAJA DISKIP buat pelunasan (dikonfirmasi user 2026-10-14) --
  // Kwitansi di bawah ini SELALU ikut kebuat bareng buat payment type='lunas'
  // yang sama persis, TTU jadi dokumen kembar yang gak pernah perlu
  // dikirim sendiri (sama alasan kayak PATCH /api/payments).
  try {
    await generateOrUpdateKwitansi(pool, bookingId, actor.id);
    // generateOrUpdateKwitansi jumlahin payments type dp+lunas confirmed —
    // formula itu gak "liat" bagian yang dibayar dari SALDO (bukan baris
    // payments sama sekali), jadi nominalnya keitung kurang kalau ada
    // campuran saldo+topup. Koreksi manual ke total_harga booking yang
    // sebenarnya di sini.
    await pool.query(
      `UPDATE invoice_kwitansi SET nominal = ?, nominal_dp = 0, nominal_pelunasan = ?
       WHERE booking_id = ? AND jenis = 'kwitansi'`,
      [booking.total_harga, booking.total_harga, bookingId]
    );
  } catch (e) {
    console.error('Gagal auto-generate kwitansi (sahabat mandiri):', e);
  }
  try {
    await pool.query(
      "UPDATE invoice_kwitansi SET status = 'paid' WHERE booking_id = ? AND jenis = 'invoice' AND status != 'paid'",
      [bookingId]
    );
  } catch (e) {
    console.error('Gagal auto-settle invoice (sahabat mandiri):', e);
  }

  await kirimNotifikasi(pool, {
    user_id: booking.user_id,
    tipe: 'pelunasan_confirmed',
    judul: 'Pelunasan Dikonfirmasi',
    pesan: `Booking ${booking.prog_name || bookingId} sudah lunas (saldo tabungan${bayar ? ' + transfer pribadi' : ''}).`,
    link: '/dashboard/jamaah',
  });

  await catatAudit(pool, {
    actor,
    aksi: 'finalisasi_lunas_sahabat_mandiri',
    target_type: 'booking',
    target_id: bookingId,
    keterangan: `Booking ${bookingId} (${booking.prog_name || '-'}) lunas via saldo tabungan${bayar ? ' + transfer pribadi' : ' penuh'}.`,
  });

  return true;
}

// DP booking program reguler yang dibayar dari saldo Sahabat Baitullah —
// begitu baris hold `pemakaian_saldo_sahabat`-nya di-ACC admin (tab komisi),
// DP-nya ikut dikonfirmasi otomatis (kebalikannya: approve DP di tab
// Payments nandain hold-nya confirmed, lihat PATCH /api/payments). Idempotent.
export async function konfirmasiDpDariSaldoSahabat(pool, bookingId, actor) {
  const [[debit]] = await pool.query(
    "SELECT dikonfirmasi_at FROM komisi_ledger WHERE booking_id = ? AND jenis = 'pemakaian_saldo_sahabat'",
    [bookingId]
  );
  if (!debit?.dikonfirmasi_at) return false;

  const [[dp]] = await pool.query(
    "SELECT id FROM payments WHERE booking_id = ? AND type = 'dp' AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [bookingId]
  );
  if (!dp) return false;

  // Kuota kursi dipotong DI SINI (dikonfirmasi user 2026-10-13) -- paling
  // duluan, sebelum payment/booking ditandai confirmed, biar kalau program
  // ini ternyata udah penuh duluan (banyak booking sama-sama ngantri DP
  // dari saldo), ACC-nya gagal bersih, gak ada mutasi setengah jalan.
  await potongKuotaSeatDp(pool, bookingId);

  await pool.query("UPDATE payments SET status = 'confirmed' WHERE id = ?", [dp.id]);
  await pool.query("UPDATE bookings SET dp_status = 'confirmed' WHERE id = ?", [bookingId]);
  try {
    await generateTandaTerimaUntukPayment(pool, dp.id, actor.id);
  } catch (e) {
    console.error('Gagal auto-generate tanda terima (DP dari saldo sahabat):', e);
  }

  const [[booking]] = await pool.query('SELECT user_id, ordered_by, prog_name FROM bookings WHERE id = ?', [bookingId]);
  for (const uid of [booking?.user_id, booking?.ordered_by].filter((id, i, arr) => id && arr.indexOf(id) === i)) {
    await kirimNotifikasi(pool, {
      user_id: uid,
      tipe: 'dp_confirmed',
      judul: 'DP Dikonfirmasi',
      pesan: `DP booking ${booking?.prog_name || bookingId} (dari saldo tabungan umroh) sudah dikonfirmasi admin.`,
      link: '/dashboard/jamaah',
    });
  }
  await catatAudit(pool, {
    actor,
    aksi: 'approve_dp_saldo_sahabat',
    target_type: 'booking',
    target_id: bookingId,
    keterangan: `DP booking ${bookingId} (${booking?.prog_name || '-'}) dikonfirmasi via saldo tabungan Sahabat.`,
  });
  return true;
}
