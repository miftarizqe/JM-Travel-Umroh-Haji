import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/admin/sahabat/hirarki — daftar semua AKAR jaringan Sahabat
// Baitullah (sahabat tanpa perekrut) + jumlah total downline masing2,
// dipakai buat /admin/sahabat/hirarki (pintu masuk ke tree per-akar yang
// sudah ada di /dashboard/sahabat/team, sebelumnya cuma bisa dibuka
// 1-per-1 lewat tombol "🌳 Jaringan" di halaman lain, gak ada daftar akarnya).
// BFS 1x buat SEMUA akar sekaligus (bukan N query per akar) — pola sama
// kayak /api/sahabat/team tapi jalan paralel, tiap node ditag ke akar
// asalnya biar count-nya bisa diakumulasi per akar. Cap 20 level, sama.
//
// Akses: admin/super_admin, ATAU akun yang ditunjuk sebagai Head of Program
// (dikonfirmasi user 2026-09-07 — wewenang baru HOP: lihat SELURUH jaringan
// Sahabat Baitullah dari dashboard akunnya sendiri, bukan cuma downline dia).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
  if (!isAdmin) {
    const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
    const isHop = pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(auth.user.id);
    if (!isHop) {
      return Response.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
  }

  try {
    const [akarRows] = await pool.query(
      `SELECT u.id, u.name, u.kode_unik, u.created_at, kp.status AS funnel_status
       FROM users u
       JOIN sahabat_pendaftaran kp ON kp.user_id = u.id
       WHERE u.role = 'sahabat_baitullah' AND u.perekrut_id IS NULL
       ORDER BY u.created_at DESC`
    );

    const counts = new Map(akarRows.map(a => [a.id, 0]));
    let currentLevelRootOf = new Map(akarRows.map(a => [a.id, a.id]));
    let currentLevelIds = akarRows.map(a => a.id);
    let level = 1;
    while (currentLevelIds.length > 0 && level <= 20) {
      const placeholders = currentLevelIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT id, perekrut_id FROM users WHERE perekrut_id IN (${placeholders})`,
        currentLevelIds
      );
      if (rows.length === 0) break;
      const nextLevelRootOf = new Map();
      for (const r of rows) {
        const rootId = currentLevelRootOf.get(r.perekrut_id);
        counts.set(rootId, (counts.get(rootId) || 0) + 1);
        nextLevelRootOf.set(r.id, rootId);
      }
      currentLevelIds = rows.map(r => r.id);
      currentLevelRootOf = nextLevelRootOf;
      level++;
    }

    const akar = akarRows.map(a => ({ ...a, jumlah_downline: counts.get(a.id) || 0 }));
    return Response.json({ akar });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
