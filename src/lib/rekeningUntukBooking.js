import pool from '@/lib/db';

// Rekening sumber dana buat pencairan komisi — ditentukan dari TIPE
// PROGRAM booking-nya (dikonfirmasi user 2026-10-17), BUKAN dari role
// penerima komisinya. Booking program Sahabat Baitullah -> rekening
// Sahabat Baitullah, booking program REGULER -> rekening Alkhalid (utama).
// `bookingId` NULL (baris komisi_ledger yang gak nempel ke booking apa pun,
// mis. tabungan_awal_sahabat/setoran_mandiri_sahabat/koreksi_saldo_sahabat)
// -> balikin `fallback` apa adanya, gak ada program buat dicek.
export async function rekeningUntukBooking(conn, bookingId, fallback = 'alkhalid') {
  if (!bookingId) return fallback;
  const [[row]] = await (conn || pool).query(
    `SELECT p.publish_type FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id WHERE b.id = ?`,
    [bookingId]
  );
  return row?.publish_type === 'sahabat_baitullah' ? 'sahabat_baitullah' : 'alkhalid';
}
