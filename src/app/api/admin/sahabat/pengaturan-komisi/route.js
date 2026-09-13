import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/pengaturan-komisi — versi READ-ONLY & SCOPED dari
// /api/admin/pengaturan, cuma balikin field2 yang relevan buat Sahabat
// Baitullah (dikonfirmasi user 2026-09-07, HOP boleh liat nominal "angka
// fatal" ini walau gak bisa ubah). Endpoint /api/admin/pengaturan yang asli
// TETAP admin/super_admin-only (banyak setting app-wide gak relevan buat
// HOP) — ini pintu masuk baru yang sempit, bukan pelebaran yang lama.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const [[p]] = await pool.query(
      `SELECT sahabat_gen1_nominal, sahabat_gen2_nominal, sahabat_gen3_nominal, sahabat_gen4_nominal, sahabat_gen5_nominal,
              sahabat_tabungan_awal_nominal, sahabat_head_of_program_nominal, head_of_program_user_id
       FROM pengaturan WHERE id = 1`
    );
    return Response.json({ pengaturan: p || {} });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
