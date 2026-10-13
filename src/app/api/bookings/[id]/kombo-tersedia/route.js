import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kombinasiHargaTersedia } from '@/lib/booking';

// GET /api/bookings/[id]/kombo-tersedia — daftar kombo paket/kamar + harga
// yang boleh dipilih buat pax tambahan (lihat POST .../tambah-jamaah).
// Dipisah dari GET /api/bookings/[id] biar gak nambah query ke endpoint
// umum yang dipakai banyak halaman lain.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[booking]] = await pool.query('SELECT id, prog_id, user_id, ordered_by, referral_perw_id FROM bookings WHERE id = ?', [id]);
    if (!booking) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    const boleh = isAdmin || booking.user_id === auth.user.id || booking.ordered_by === auth.user.id;
    if (!boleh) return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });

    const kombo = await kombinasiHargaTersedia(pool, booking);
    return Response.json({ kombo });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
