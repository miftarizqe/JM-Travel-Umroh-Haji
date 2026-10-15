import pool from '@/lib/db';
import { verifikasiToken, semuaTokenDariHeader, headersCookieSesi, terbitkanUlangToken } from '@/lib/auth';
import { dataUserSesi } from '@/lib/dataUserSesi';

// GET /api/auth/sesi — cek cookie sesi (httpOnly, gak kebaca JS) masih
// berlaku atau enggak. Dipakai useCurrentUser buat nyamain cache data user
// di localStorage sama kondisi sesi BENERAN, dua arah:
// - sesi gak aktif (4 jam habis, logout di tab lain, dst) -> cache dibuang,
//   nama gak nyangkut di navbar (bug 2026-10-14). Cookie yang masih
//   kebawa (mis. tanda tangan gak valid — proxy cuma baca payload, gak
//   verifikasi) sekalian DIHAPUS, biar proxy gak terus nganggep login &
//   ngelempar /login balik ke `/` (user jadi gak bisa login sama sekali).
// - sesi aktif tapi cache hilang/beda akun -> `user` dikirim buat isi ulang
//   (bug 2026-10-15: udah login tapi navbar landing tetap "Masuk/Daftar",
//   klik Masuk mantul ke `/`).
// Selalu 200 biar gak jadi noise 401.
export async function GET(request) {
  const noStore = { 'Cache-Control': 'no-store' };
  const payload = verifikasiToken(request);
  if (!payload) {
    const adaCookie = semuaTokenDariHeader(request.headers.get('cookie')).length > 0;
    const headers = adaCookie ? headersCookieSesi(request, '', 0) : new Headers({ 'Content-Type': 'application/json' });
    headers.set('Cache-Control', 'no-store');
    return new Response(JSON.stringify({ aktif: false, user: null }), { status: 200, headers });
  }
  try {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id = ?', [payload.id]);
    // Sahabat Baitullah ditolak permanen tetap dianggap login (tertahan di
    // halaman status, lihat verifikasiToken) — role lain yang ditolak keluar.
    const ditolakSahabat = u?.status === 'rejected' && u?.role === 'sahabat_baitullah';
    if (!u || u.status === 'nonaktif' || (u.status === 'rejected' && !ditolakSahabat)) {
      const headers = headersCookieSesi(request, '', 0);
      headers.set('Cache-Control', 'no-store');
      return new Response(JSON.stringify({ aktif: false, user: null }), { status: 200, headers });
    }
    const loginAt = Number(payload.login_at || payload.iat || 0);
    // Role ngikut token, bukan DB — switch-role (akun dual-role) cuma
    // nukar role/role_kedua di token, DB-nya tetap.
    const user = dataUserSesi(u, loginAt, { role: payload.role, role_kedua: payload.role_kedua || null });
    // Ditolak/di-ACC ulang admin SESUDAH login -> klaim `ditolak` di token
    // disamain sama DB sekarang juga, biar proxy langsung nahan/ngelepas di
    // navigasi berikutnya tanpa nunggu login ulang.
    if (!!payload.ditolak !== ditolakSahabat) {
      const baru = terbitkanUlangToken(payload, { ditolak: ditolakSahabat || undefined });
      if (baru) {
        const headers = headersCookieSesi(request, baru.token, baru.maxAge);
        headers.set('Cache-Control', 'no-store');
        return new Response(JSON.stringify({ aktif: true, user }), { status: 200, headers });
      }
    }
    return Response.json({ aktif: true, user }, { headers: noStore });
  } catch (e) {
    console.error(e);
    // DB error -> jangan bikin client buang cache gara-gara ini.
    return Response.json({ aktif: true, user: null }, { headers: noStore });
  }
}
