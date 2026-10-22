import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/riwayat-transaksi — SEMUA Invoice/Kwitansi/Tanda Terima Uang
// milik akun yang login, APAPUN sumbernya: nempel booking (user_id ATAU
// ordered_by, booking dipesanin orang lain) MAUPUN bookingless self-service
// (dibuat_oleh, mis. Kwitansi setoran pendaftaran Sahabat Baitullah) — 1
// sumber dipakai bareng SEMUA role (jamaah/perwakilan/sahabat_baitullah/dst,
// dikonfirmasi user 2026-10-22, sebelumnya dokumen cuma bisa diakses
// per-booking lewat /api/bookings/[id]/dokumen, gak ada tempat liat SEMUA
// dokumen sekaligus). Cuma yang SUDAH terkirim yang ditampilkan — sama
// gerbang akses persis GET /api/admin/invoice-kwitansi/[id], dokumen draft
// masih di tangan admin.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT ik.id, ik.nomor, ik.jenis, ik.nama, ik.nominal, ik.tanggal, ik.judul,
              ik.terkirim_at, ik.booking_id, ik.status,
              b.prog_name
       FROM invoice_kwitansi ik
       LEFT JOIN bookings b ON b.id = ik.booking_id
       WHERE ik.terkirim = 1
         AND (
           (ik.booking_id IS NOT NULL AND (b.user_id = ? OR b.ordered_by = ?))
           OR (ik.booking_id IS NULL AND ik.dibuat_oleh = ?)
         )
       ORDER BY ik.terkirim_at DESC, ik.tanggal DESC`,
      [auth.user.id, auth.user.id, auth.user.id]
    );
    return Response.json({ dokumen: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
