import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';

// GET /api/notifications?user_id=xxx&limit=20 — daftar notifikasi milik user, terbaru dulu
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, userId);
    if (auth.error) return auth.error;

    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    );
    const [[{ jumlah }]] = await pool.query(
      'SELECT COUNT(*) AS jumlah FROM notifications WHERE user_id = ? AND dibaca = 0',
      [userId]
    );

    return Response.json({ notifications, unread_count: jumlah });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/notifications  body: { user_id, id? }
// id diisi -> tandai satu notifikasi terbaca. id kosong -> tandai SEMUA milik user terbaca.
export async function PATCH(request) {
  try {
    const { user_id, id } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, user_id);
    if (auth.error) return auth.error;

    if (id) {
      await pool.query('UPDATE notifications SET dibaca = 1 WHERE id = ? AND user_id = ?', [id, user_id]);
    } else {
      await pool.query('UPDATE notifications SET dibaca = 1 WHERE user_id = ?', [user_id]);
    }

    return Response.json({ message: 'Notifikasi ditandai terbaca.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
