import { NextResponse } from 'next/server';
import { semuaTokenDariHeader, headerHapusTokenLama, headerCookieToken } from '@/lib/auth';

// Halaman yang butuh login
const protectedRoutes = [
  '/dashboard',
  '/checkout',
  '/form-jamaah',
  '/pelunasan',
  '/admin',
  '/upgrade-paket',
  '/upload-foto',
  '/pks',
  '/daftar-agen',
  '/daftar-perwakilan',
  '/status-pendaftaran',
  '/profil',
  '/perwakilan',
  '/agen/harga', // BUKAN '/agen' — '/agen/[kode]' itu halaman publik (referral)
  '/voucher',
  '/ajukan-custom-harga',
  '/ganti-password-wajib',
  '/perbaiki-data-akun',
];

/**
 * Token dianggap SAH hanya jika ada isinya dan berbentuk JWT.
 *
 * BUG LAMA: cookie "token=undefined" (akibat frontend menulis
 * `token=${data.token}` padahal data.token undefined) tetap dianggap ada.
 * Akibatnya:
 *   - middleware mengira user sudah login -> /login dilempar ke /
 *   - API menolak karena token tidak valid
 *   - user terkunci: tidak bisa login, tidak bisa apa-apa
 */
function tokenSah(token) {
  if (!token) return false;
  const t = String(token).trim();
  if (t === '' || t === 'undefined' || t === 'null') return false;
  // JWT selalu punya 3 bagian dipisah titik
  return t.split('.').length === 3;
}

// Sesi 24 jam sejak login (dikonfirmasi user 2026-10-12, aturan sama dengan
// DURASI_SESI_DETIK di src/lib/auth.js). Proxy cuma BACA payload (gak
// verifikasi tanda tangan — itu tugas API); cukup buat nentuin sesi udah
// habis & cookie-nya dibuang, biar user gak nyangkut "kelihatan login"
// padahal semua API udah nolak.
const DURASI_SESI_DETIK = 24 * 60 * 60;
function sesiHabis(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    const loginAt = Number(payload.login_at || payload.iat || 0);
    return Math.floor(Date.now() / 1000) >= loginAt + DURASI_SESI_DETIK;
  } catch {
    return true;
  }
}

function loginAtToken(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return Number(payload.iat || payload.login_at || 0);
  } catch {
    return 0;
  }
}

/**
 * Buang SEMUA cookie `token` di browser: varian Path/Domain lama + cookie
 * resmi. Pakai headers.append (bukan res.cookies.set) karena res.cookies
 * cuma bisa nyimpen satu Set-Cookie per nama.
 */
function hapusSemuaToken(res, request) {
  for (const h of headerHapusTokenLama(request)) res.headers.append('Set-Cookie', h);
  res.headers.append('Set-Cookie', headerCookieToken('', 0));
  return res;
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  // Bisa ada >1 cookie `token` (varian Path/Domain lama yang gak ketimpa
  // login baru). Pilih token sah yang sesinya masih jalan & paling baru —
  // jangan asal ambil yang pertama (itu biasanya yang lama).
  const semua = semuaTokenDariHeader(request.headers.get('cookie'));
  const berbentukJwt = semua.filter(tokenSah);
  const aktif = berbentukJwt
    .filter(t => !sesiHabis(t))
    .sort((a, b) => loginAtToken(b) - loginAtToken(a));
  const raw = aktif[0] || berbentukJwt[0] || semua[0];

  // Sesi lewat 24 jam -> buang cookie; halaman privat diarahkan ke login
  // dengan keterangan sesi habis.
  if (!aktif.length && berbentukJwt.length) {
    const isProtectedHabis = protectedRoutes.some(route => pathname.startsWith(route));
    let res;
    if (isProtectedHabis) {
      const url = new URL('/login', request.url);
      url.searchParams.set('sesi', 'habis');
      url.searchParams.set('from', pathname);
      res = NextResponse.redirect(url);
    } else {
      res = NextResponse.next();
    }
    return hapusSemuaToken(res, request);
  }

  const login = tokenSah(raw);

  // Cookie rusak -> hapus, jangan sampai mengunci user
  if (raw && !login) {
    const res = (pathname === '/login' || pathname === '/register')
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/login', request.url));
    return hapusSemuaToken(res, request);
  }

  // Ada token aktif tapi juga ada cookie `token` lain yang nyangkut ->
  // bersihkan varian lama (cookie resmi Path=/ dibiarkan).
  const adaSisaLama = semua.length > 1;

  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));

  // Halaman privat tanpa login -> ke login
  if (isProtected && !login) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  let res = NextResponse.next();
  // Sudah login tapi buka /login atau /register -> ke beranda
  if (login && (pathname === '/login' || pathname === '/register')) {
    res = NextResponse.redirect(new URL('/', request.url));
  }
  if (adaSisaLama) {
    for (const h of headerHapusTokenLama(request)) res.headers.append('Set-Cookie', h);
  }
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\..*).*)'],
};
