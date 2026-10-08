import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/perwakilan/sidebar-badges
// Badge angka merah di sidebar perwakilan (dikonfirmasi user 2026-10-08,
// extend dari fitur sama punya admin -- lihat /api/admin/sidebar-badges).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  if (!['perwakilan'].includes(auth.user.role)) {
    return Response.json({ error: 'Akses ditolak' }, { status: 403 });
  }

  const badges = {};
  try {
    // Pendaftaran akun sendiri masih kurang syarat (metode TTD belum
    // dipilih, PKS belum disetujui, atau formulir TTD fisik/digital belum
    // selesai) -- kebalikan kriteria badge admin '/admin/perwakilan' (yang
    // ngitung sahabat yang SUDAH lengkap siap di-ACC).
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM users u
       JOIN agen_pendaftaran ap ON ap.id = (
         SELECT id FROM agen_pendaftaran WHERE user_id = u.id AND role_diajukan = 'perwakilan'
         ORDER BY id DESC LIMIT 1)
       WHERE u.id = ? AND u.status = 'pending'
         AND (
           ap.metode IS NULL OR NOT u.setuju_pks
           OR (SELECT fase FROM dokumen_signature WHERE dokumen = 'formulir' AND ref_id = u.id
               ORDER BY id DESC LIMIT 1) IS NULL
           OR (SELECT fase FROM dokumen_signature WHERE dokumen = 'formulir' AND ref_id = u.id
               ORDER BY id DESC LIMIT 1) <> 'selesai'
         )`,
      [auth.user.id]
    );
    if (row.n > 0) badges['/dashboard/perwakilan'] = Number(row.n);
  } catch (err) {
    console.error('sidebar-badges perwakilan:', err.message);
  }

  return Response.json({ badges });
}
