import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/pengajuan-dana — daftar semua pengajuan (ringkas, tanpa item)
// super_admin only — soal keuangan gak boleh disentuh admin biasa sama sekali,
// termasuk drafting-nya (bukan cuma keputusan approve/tolak).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT p.*, u1.name AS created_by_nama, u2.name AS diajukan_oleh_nama, u3.name AS diputuskan_oleh_nama,
              COALESCE((SELECT SUM(i.nominal) FROM pengajuan_dana_item i WHERE i.pengajuan_id = p.id), 0) AS total
       FROM pengajuan_dana p
       LEFT JOIN users u1 ON u1.id = p.created_by
       LEFT JOIN users u2 ON u2.id = p.diajukan_oleh
       LEFT JOIN users u3 ON u3.id = p.diputuskan_oleh
       ORDER BY p.bulan DESC, p.created_at DESC`
    );
    return Response.json({ pengajuan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST { bulan } — bikin draft baru buat 1 bulan (belum ada item, admin isi
// manual + bisa tarik reimburse pending lewat PUT /[id] belakangan).
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { bulan } = await request.json();
    if (!/^\d{4}-\d{2}$/.test(bulan || '')) {
      return Response.json({ error: 'Format bulan harus YYYY-MM' }, { status: 400 });
    }
    const [result] = await pool.query(
      'INSERT INTO pengajuan_dana (bulan, created_by) VALUES (?, ?)',
      [bulan, auth.user.id]
    );
    return Response.json({ message: 'Draft pengajuan dibuat!', id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
