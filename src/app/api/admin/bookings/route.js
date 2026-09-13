import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/bookings — SEMUA booking lintas program, buat halaman
// "Daftar Booking" admin (list + cari/filter, klik baris buka detail via
// modal yang sama dipakai di tab lain — lihat openBookingDetail di
// admin/page.jsx). Sengaja mirip query di api/admin/program-jamaah, cuma
// TANPA filter prog_id (itu punya sendiri buat dipakai dari halaman Program).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [bookings] = await pool.query(
      `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah,
              b.dp_status, b.pelunasan_status, b.status, b.form_filled, b.form_total,
              b.total_harga, b.dp_amount, b.created_at,
              EXISTS (
                SELECT 1 FROM pembatalan pb
                WHERE pb.booking_id = b.id AND pb.status IN ('menunggu','disetujui')
              ) AS ada_pembatalan_aktif,
              u.name AS pemesan_nama, u.email AS pemesan_email, u.wa AS pemesan_wa
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC`
    );
    const result = bookings.map(b => ({ ...b, ada_pembatalan_aktif: !!b.ada_pembatalan_aktif }));
    return Response.json({ bookings: result });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
