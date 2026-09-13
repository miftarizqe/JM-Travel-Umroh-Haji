import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { apakahDalamJaringan } from '@/lib/jaringan';

// GET /api/sahabat/downline/[user_id] — drill-down rekursif jaringan
// sahabat (siapa merekrut siapa), TANPA closing/komisi (sahabat gak
// punya itu, beda dari /api/downline/closings punya perwakilan). Otorisasi
// reuse apakahDalamJaringan() yang sudah role-agnostic (jalan-jalan di
// users.perekrut_id) — gak perlu versi khusus sahabat.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { user_id } = await params;
    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin && auth.user.id !== user_id) {
      const dalamJaringan = await apakahDalamJaringan(pool, auth.user.id, user_id);
      if (!dalamJaringan) {
        // Head of Program (dikonfirmasi user 2026-09-07) — boleh liat
        // jaringan SIAPAPUN, gak cuma yang dia beneran punya hubungan
        // upline/downline-nya.
        const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
        const isHop = pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(auth.user.id);
        if (!isHop) return Response.json({ error: 'Anda tidak berwenang melihat jaringan ini' }, { status: 403 });
      }
    }

    const [rows] = await pool.query('SELECT id, name, kode_unik, role, status FROM users WHERE id = ?', [user_id]);
    if (rows.length === 0) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    const target = rows[0];

    const [rekrutan] = await pool.query(
      `SELECT u.id, u.name, u.role, u.kode_unik, u.status, u.created_at,
              kp.status AS funnel_status
       FROM users u
       LEFT JOIN sahabat_pendaftaran kp ON kp.user_id = u.id
       WHERE u.perekrut_id = ?
       ORDER BY u.created_at DESC`,
      [user_id]
    );

    return Response.json({ target, rekrutan });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
