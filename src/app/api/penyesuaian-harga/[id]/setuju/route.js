import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// POST /api/penyesuaian-harga/[id]/setuju — jamaah setuju penyesuaian harga.
// Harga baru LANGSUNG berlaku (update bookings.total_harga) begitu disetujui
// — tidak ada step "terapkan" admin terpisah, persetujuan jamaah ITU SENDIRI
// yang jadi pemicu (dan bagian dari catatan legal Perjanjian Jamaah).
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  const conn = await pool.getConnection();
  try {
    const { id } = await params;
    const [[penyesuaian]] = await conn.query('SELECT * FROM booking_penyesuaian_harga WHERE id = ?', [id]);
    if (!penyesuaian) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (penyesuaian.status !== 'pending') return Response.json({ error: 'Pengajuan ini sudah diproses' }, { status: 400 });

    const [[booking]] = await conn.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [penyesuaian.booking_id]);
    if (!booking) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });

    const uid = auth.user.id;
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    const boleh = isAdmin || booking.user_id === uid || booking.ordered_by === uid;
    if (!boleh) return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });

    await conn.beginTransaction();
    await conn.query(
      "UPDATE booking_penyesuaian_harga SET status = 'disetujui', disetujui_at = NOW() WHERE id = ?",
      [id]
    );
    await conn.query('UPDATE bookings SET total_harga = ? WHERE id = ?', [penyesuaian.harga_baru, penyesuaian.booking_id]);
    await conn.commit();

    return Response.json({ message: 'Penyesuaian harga disetujui.' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}
