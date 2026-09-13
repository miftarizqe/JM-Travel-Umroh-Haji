import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/sahabat/hop-status — cek APAKAH akun yang login sekarang adalah
// Head of Program (dikonfirmasi user 2026-09-07). Dipakai halaman-halaman
// admin/sahabat/* buat nentuin apakah akun non-admin ini boleh MASUK (LIHAT
// doang, gak ada tombol aksi) — lihat useIsHop() di src/lib/useIsHop.js.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
    const isHop = !!(pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(auth.user.id));
    return Response.json({ isHop });
  } catch (error) {
    console.error(error);
    return Response.json({ isHop: false });
  }
}
