import pool from './db';
import { verifikasiToken } from './auth';

// Head of Program (dikonfirmasi user 2026-09-07) — boleh LIHAT semua yang
// admin bisa lihat di bagian Sahabat Baitullah (Pendaftaran/Database/
// Riwayat Closing/Pencairan/Materi/Pengaturan Komisi), TAPI GAK BOLEH
// ACTION apa pun kayak admin. Makanya helper ini CUMA dipakai gantiin
// wajibRole(['admin'])/wajibSuperAdmin di endpoint GET/read-only. Endpoint
// yang nulis/aksi (POST/PUT/PATCH/DELETE) TETAP pakai wajibRole/wajibSuperAdmin
// biasa apa adanya — JANGAN pernah diganti helper ini, itu satu-satunya
// pagar yang bikin HOP beneran gak bisa action walau tau endpoint-nya.
export async function wajibAdminAtauHopSahabat(request) {
  const user = verifikasiToken(request);
  if (!user) {
    return { error: Response.json({ error: 'Tidak terautentikasi. Silakan login terlebih dahulu.' }, { status: 401 }) };
  }
  if (['admin', 'super_admin'].includes(user.role)) return { user };

  const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
  const isHop = pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(user.id);
  if (isHop) return { user };

  return { error: Response.json({ error: 'Akses ditolak.' }, { status: 403 }) };
}
