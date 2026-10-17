import pool from '@/lib/db';
import { cekRiwayatUmroh } from '@/lib/riwayatUmroh';

// GET /api/cek-riwayat-umroh?nik=xxx — PUBLIK (dipanggil dari popup cek NIK
// di /register sebelum akun ada, gak ada sesi login) buat cek apakah NIK
// yang baru diketik calon pendaftar pernah tercatat SUDAH BERANGKAT umroh
// bersama JM Travel (dikonfirmasi user 2026-09-06) — dipakai buat gerbang
// "eligible daftar Perwakilan tanpa kode referral". Kalau ketemu, ikut
// balikin nama yang DISAMARKAN (dikonfirmasi user 2026-10-17 — popup NIK
// nampilin nama biar calon pendaftar bisa self-verify "oh iya ini saya",
// bukan nama penuh biar endpoint publik ini gak jadi oracle buat ngintip
// siapa aja yang pernah umroh cuma modal coba-coba NIK; lihat samarkanNama()).
// Query sama dipakai LAGI server-side pas POST /api/auth/register beneran
// nyimpen akun perwakilan (lihat src/lib/riwayatUmroh.js) — endpoint ini
// cuma buat live-feedback UI, bukan satu-satunya penjaga gerbang.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const nik = (searchParams.get('nik') || '').trim();
  try {
    const { pernahUmroh, namaMasked } = await cekRiwayatUmroh(pool, nik);
    return Response.json({ pernahUmroh, nama_masked: namaMasked });
  } catch (error) {
    console.error(error);
    return Response.json({ pernahUmroh: false, nama_masked: null });
  }
}
