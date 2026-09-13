// Finalisasi pembayaran booking Program Sahabat Baitullah checkout mandiri —
// dipanggil dari 2 titik confirm yang independen (baris debit saldo di
// komisi_ledger, DAN payments type='lunas' kalau ada sisa transfer pribadi).
// Booking baru dianggap LUNAS begitu KEDUANYA (yang relevan) sudah di-acc
// admin — dikonfirmasi user 2026-08-29, biar gak ada yang kelewat verifikasi.
import { kirimNotifikasi } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { generateOrUpdateKwitansi, generateTandaTerimaUntukPayment } from '@/lib/invoiceKwitansi';

export async function cekDanFinalisasiLunasSahabat(pool, bookingId, actor) {
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

  let paymentId = bayar?.id;
  if (!paymentId) {
    // Saldo nutup penuh, gak ada transfer pribadi sama sekali — sintesis 1
    // baris `payments` (langsung 'confirmed', gak ada bukti buat diverifikasi
    // karena emang gak ada transfer) biar generateTandaTerimaUntukPayment
    // (yang butuh payment.id) tetap punya jejak, konsisten sama booking lain.
    // payments.id itu UUID (DEFAULT uuid()), bukan auto_increment — gak ada
    // insertId yang bisa dipakai, jadi query balik row-nya abis insert.
    const [[u]] = await pool.query('SELECT name FROM users WHERE id = ?', [booking.user_id]);
    await pool.query(
      `INSERT INTO payments (booking_id, user_id, nama, type, amount, kode_unik, status)
       VALUES (?, ?, ?, 'lunas', ?, 0, 'confirmed')`,
      [bookingId, booking.user_id, u?.name || null, booking.total_harga]
    );
    const [[ins]] = await pool.query(
      "SELECT id FROM payments WHERE booking_id = ? AND type = 'lunas' ORDER BY created_at DESC LIMIT 1",
      [bookingId]
    );
    paymentId = ins.id;
  }

  try {
    await generateTandaTerimaUntukPayment(pool, paymentId, actor.id);
  } catch (e) {
    console.error('Gagal auto-generate tanda terima (sahabat mandiri):', e);
  }
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
