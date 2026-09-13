import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/admins — daftar akun buat picker "Head of Program"
// di /admin/sahabat/pengaturan-komisi. DULU cuma akun admin/super_admin
// (dikonfirmasi user waktu itu — "HOP wajib akun staff"), SEKARANG dibalik
// total (dikonfirmasi user 2026-09-07): HOP wajib 1 orang Jamaah Sahabat
// Baitullah aktif beneran (role='sahabat_baitullah'), BUKAN staff — biar
// HOP punya wewenang baru lihat SELURUH jaringan lewat dashboard akunnya
// sendiri (lihat /api/sahabat/team & /api/admin/sahabat/hirarki, dua-duanya
// sekarang ngecek head_of_program_user_id juga, gak cuma role admin).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      "SELECT id, name, kode_unik FROM users WHERE role = 'sahabat_baitullah' AND status = 'active' ORDER BY name ASC"
    );
    return Response.json({ admins: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
