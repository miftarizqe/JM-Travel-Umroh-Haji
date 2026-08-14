import { NextResponse } from 'next/server';

// Halaman yang butuh login
const protectedRoutes = [
  '/dashboard',
  '/checkout',
  '/form-jamaah',
  '/pelunasan',
  '/admin',
  '/order-jamaah',
  '/upgrade-paket',
  '/verifikasi',
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

export function proxy(request) {
  const raw = request.cookies.get('token')?.value;
  const login = tokenSah(raw);
  const { pathname } = request.nextUrl;

  // Cookie rusak -> hapus, jangan sampai mengunci user
  if (raw && !login) {
    const res = (pathname === '/login' || pathname === '/register')
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/login', request.url));
    res.cookies.set('token', '', { path: '/', maxAge: 0 });
    return res;
  }

  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));

  // Halaman privat tanpa login -> ke login
  if (isProtected && !login) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // Sudah login tapi buka /login atau /register -> ke beranda
  if (login && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\..*).*)'],
};
