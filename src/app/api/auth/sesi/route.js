import { verifikasiToken } from '@/lib/auth';

// GET /api/auth/sesi — cek cookie sesi (httpOnly, gak kebaca JS) masih
// berlaku atau enggak. Dipakai useCurrentUser buat ngebuang cache data user
// di localStorage yang udah basi (sesi 4 jam habis, cookie dihapus, logout
// di tab lain, dst) — biar nama di navbar gak nyangkut padahal server udah
// nganggep belum login (bug 2026-10-14). Selalu 200 biar gak jadi noise 401.
export async function GET(request) {
  const user = verifikasiToken(request);
  return Response.json(
    { aktif: !!user, id: user?.id ?? null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
