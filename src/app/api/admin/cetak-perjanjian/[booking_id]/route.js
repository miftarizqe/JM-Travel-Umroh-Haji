import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';

// GET /api/admin/cetak-perjanjian/[booking_id] — nomor surat resmi
// Perjanjian Jamaah (SPJ). ADMIN ONLY.
//
// Nomor digenerate & dibekukan DI SINI, endpoint yang cuma dipanggil saat
// halaman cetak beneran dibuka — sengaja dipisah dari /api/bookings/[id]
// (dipakai di banyak tempat lain, termasuk cetak formulir) supaya buka
// detail booking biasa gak ikut "membakar" nomor surat baru. Pola sama
// persis /api/admin/cetak-pks/[user_id] buat SPKA-Ins. Per-BOOKING (bukan
// per-akun) karena 1 jamaah bisa booking berkali-kali, masing-masing butuh
// nomor sendiri (dikonfirmasi user 2026-10-12). Tanggal dokumen ini sudah
// beku dari dulu (bookings.created_at), gak butuh ambilAtauBuatTanggalBeku.
export async function GET(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { booking_id } = await params;
    const [[booking]] = await pool.query('SELECT id FROM bookings WHERE id = ?', [booking_id]);
    if (!booking) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });

    const nomor = await ambilAtauBuatNomorSurat(pool, booking.id, 'SPJ', 'no_perjanjian_jamaah', 'bookings');
    return Response.json({ nomor });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
