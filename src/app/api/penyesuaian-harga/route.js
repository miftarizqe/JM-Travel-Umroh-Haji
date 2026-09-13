import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/penyesuaian-harga?booking_id=  — pengajuan 'pending' aktif untuk
// booking ini (kalau ada). Dipakai halaman /penyesuaian-harga (jamaah baca
// harga lama vs baru + alasan sebelum setuju).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    if (!bookingId) return Response.json({ error: 'booking_id wajib diisi' }, { status: 400 });

    const [[booking]] = await pool.query('SELECT id, user_id, ordered_by, prog_name FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });

    const uid = auth.user.id;
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    const boleh = isAdmin || booking.user_id === uid || booking.ordered_by === uid;
    if (!boleh) return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });

    const [[penyesuaian]] = await pool.query(
      "SELECT * FROM booking_penyesuaian_harga WHERE booking_id = ? AND status = 'pending' ORDER BY diajukan_at DESC LIMIT 1",
      [bookingId]
    );

    return Response.json({ penyesuaian: penyesuaian || null, prog_name: booking.prog_name });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
