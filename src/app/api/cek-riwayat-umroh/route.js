import pool from '@/lib/db';
import { pernahBerangkatUmroh } from '@/lib/riwayatUmroh';

// GET /api/cek-riwayat-umroh?nik=xxx — PUBLIK (dipanggil dari halaman
// /register sebelum akun ada, gak ada sesi login) buat cek apakah NIK yang
// baru diketik calon pendaftar pernah tercatat SUDAH BERANGKAT umroh
// bersama JM Travel (dikonfirmasi user 2026-09-06) — dipakai buat gerbang
// "eligible daftar Perwakilan tanpa kode referral". SENGAJA cuma balikin
// boolean, TIDAK ADA data pribadi/detail booking yang di-expose — endpoint
// publik tanpa login jangan sampai jadi oracle buat ngintip siapa aja yang
// pernah umroh cuma modal coba-coba NIK.
// Query sama dipakai LAGI server-side pas POST /api/auth/register beneran
// nyimpen akun perwakilan (lihat src/lib/riwayatUmroh.js) — endpoint ini
// cuma buat live-feedback UI, bukan satu-satunya penjaga gerbang.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const nik = (searchParams.get('nik') || '').trim();
  try {
    const pernahUmroh = await pernahBerangkatUmroh(pool, nik);
    return Response.json({ pernahUmroh });
  } catch (error) {
    console.error(error);
    return Response.json({ pernahUmroh: false });
  }
}
