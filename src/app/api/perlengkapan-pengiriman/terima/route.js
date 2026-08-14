import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { tandaiPengirimanJamaah } from '@/lib/perlengkapan';

// POST /api/perlengkapan-pengiriman/terima  body: { booking_id, jamaah_idx }
// Self-service jamaah — konfirmasi sendiri perlengkapannya sudah diterima
// (tombol di dashboard jamaah, muncul begitu status='dikirim'). Kalau 7 hari
// gak diklik, otomatis dianggap diterima juga (lihat
// jalankanAutoTerimaPerlengkapan di src/lib/perlengkapan.js).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { booking_id, jamaah_idx } = await request.json();
    if (!booking_id || jamaah_idx == null) {
      return Response.json({ error: 'booking_id dan jamaah_idx wajib diisi' }, { status: 400 });
    }

    const [[b]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [booking_id]);
    if (!b || (b.user_id !== auth.user.id && b.ordered_by !== auth.user.id)) {
      return Response.json({ error: 'Anda tidak berwenang atas booking ini' }, { status: 403 });
    }

    await tandaiPengirimanJamaah(pool, {
      bookingId: booking_id, jamaahIdx: jamaah_idx, statusBaru: 'diterima', actorId: auth.user.id,
    });
    return Response.json({ message: 'Terima kasih sudah konfirmasi!' });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}
