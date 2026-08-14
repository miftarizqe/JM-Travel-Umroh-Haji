import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/perlengkapan/ledger?item_id= — riwayat in/out (audit),
// KHUSUS super_admin. item_id opsional (kalau kosong, semua item).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');

    const params = [];
    let where = '';
    if (itemId) { where = 'WHERE l.item_id = ?'; params.push(itemId); }

    const [rows] = await pool.query(
      `SELECT l.*, p.nama AS item_nama, u.name AS input_oleh_nama
       FROM perlengkapan_stok_ledger l
       LEFT JOIN perlengkapan_jamaah p ON p.id = l.item_id
       LEFT JOIN users u ON u.id = l.input_oleh
       ${where}
       ORDER BY l.created_at DESC LIMIT 200`,
      params
    );
    return Response.json({ ledger: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
