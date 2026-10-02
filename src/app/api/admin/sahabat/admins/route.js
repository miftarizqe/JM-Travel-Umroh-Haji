import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/admins — daftar akun Head of Program untuk tampilan
// "Akun Head of Program" di /admin/sahabat/pengaturan-komisi. Sejak
// 2026-10-03 HoP = management (role 'hop', di bawah admin), BUKAN anggota
// Sahabat Baitullah lagi.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      "SELECT id, name, kode_unik FROM users WHERE role = 'hop' AND status = 'active' ORDER BY name ASC"
    );
    return Response.json({ admins: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
