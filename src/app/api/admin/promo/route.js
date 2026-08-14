import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/promo — riwayat semua banner (admin)
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query('SELECT * FROM promo_banner ORDER BY created_at DESC');
    return Response.json({ rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/promo — buat banner baru. Nonaktifin semua banner lama
// dulu, biar cuma ada 1 yang aktif kapan pun (yang paling baru).
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { judul, deskripsi, flyer_path, kode_voucher, link, link_label } = await request.json();
    if (!judul || !judul.trim()) {
      return Response.json({ error: 'Judul/isi promo wajib diisi' }, { status: 400 });
    }
    await pool.query('UPDATE promo_banner SET aktif = 0');
    await pool.query(
      `INSERT INTO promo_banner (judul, deskripsi, flyer_path, kode_voucher, link, link_label, aktif)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [judul.trim(), deskripsi || null, flyer_path || null, kode_voucher || null, link || null, link_label || null]
    );
    return Response.json({ message: 'Banner promo dipasang!' }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/promo  body: { id, aktif } — nyala/matiin banner tertentu
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, aktif } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    if (aktif) await pool.query('UPDATE promo_banner SET aktif = 0');
    await pool.query('UPDATE promo_banner SET aktif = ? WHERE id = ?', [aktif ? 1 : 0, id]);
    return Response.json({ message: 'Status banner diperbarui' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/promo?id=xxx
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    await pool.query('DELETE FROM promo_banner WHERE id = ?', [id]);
    return Response.json({ message: 'Banner dihapus' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
