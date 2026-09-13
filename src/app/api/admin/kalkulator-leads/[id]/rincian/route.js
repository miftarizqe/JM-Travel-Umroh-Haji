import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/kalkulator-leads/[id]/rincian — super_admin-only. Balikin
// rincian_snapshot (HPP/Margin/Komisi/Jual per kelompok, snapshot pas
// jamaah hitung, BUKAN direcompute belakangan) buat 1 lead — dipisah dari
// endpoint level-admin (/api/admin/kalkulator-leads) yang sengaja gak
// pernah ngirim data ini sama sekali, konsisten sama akses Costing Program
// & Kalkulator Template (dikonfirmasi user 2026-08-18).
export async function GET(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[lead]] = await pool.query(
      `SELECT l.id, l.rincian_snapshot, l.addon_config, l.harga_jual, l.tanggal_berangkat, l.created_at,
        u.name AS user_nama, u.email AS user_email, u.wa AS user_wa, t.nama AS template_nama
       FROM kalkulator_lead l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN kalkulator_template_publik t ON t.id = l.template_id
       WHERE l.id = ?`,
      [id]
    );
    if (!lead) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
    return Response.json({ lead });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
