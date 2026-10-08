import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/sahabat/setoran-mandiri-pengajuan — daftar pengajuan
// setoran mandiri yang masih 'diajukan' (menunggu verifikasi admin).
export async function GET(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.user_id, u.name AS user_name, u.kode_unik, u.no_rekening_tabungan_umroh,
              p.nominal, p.bukti_path, p.bukti_nama, p.created_at
       FROM sahabat_setoran_mandiri_pengajuan p
       JOIN users u ON u.id = p.user_id COLLATE utf8mb4_unicode_ci
       WHERE p.status = 'diajukan'
       ORDER BY p.created_at ASC`
    );
    return Response.json({ pengajuan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
