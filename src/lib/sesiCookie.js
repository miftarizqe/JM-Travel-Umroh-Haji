// Helper cookie sesi `token` untuk src/proxy.js (halaman), TANPA verifikasi JWT — itu tugas
// backend (jm-travel-api, src/lib/auth.js). Disalin dari sana: kalau aturan cookie berubah
// (nama, Path lama, flag Secure), ubah di KEDUA repo.

/**
 * Ambil SEMUA nilai cookie `token` dari header request.
 *
 * Browser bisa nyimpen >1 cookie bernama `token` kalau Path/Domain-nya beda
 * (mis. cookie lama yang dulu ditulis frontend lewat document.cookie dari
 * halaman /admin/... -> Path=/admin). Set-Cookie dari server (Path=/) gak
 * menimpanya, dan browser ngirim yang Path-nya lebih spesifik DULUAN —
 * dulu kita cuma ambil yang pertama, jadi token lama yang udah gak berlaku
 * selalu menang dan login baru seolah "gak nyimpen".
 */
export function semuaTokenDariHeader(cookieHeader) {
  const hasil = [];
  const re = /(?:^|;\s*)token=([^;]*)/g;
  let m;
  while ((m = re.exec(cookieHeader || '')) !== null) {
    try {
      hasil.push(decodeURIComponent(m[1]));
    } catch {
      hasil.push(m[1]);
    }
  }
  return hasil.filter(Boolean);
}

/**
 * Flag Secure pada cookie token. Default: aktif di production (wajib HTTPS).
 * COOKIE_SECURE=false mematikannya untuk uji lewat HTTP (mis. akses via IP
 * VPS sebelum domain + SSL siap). Tanpa itu, di HTTP browser membuang cookie
 * dan user dilempar balik ke /login setelah "login berhasil".
 */
function cookieSecure() {
  const v = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return process.env.NODE_ENV === 'production';
}

/** Nilai header Set-Cookie untuk token sesi (maxAge 0 = hapus cookie). */
export function headerCookieToken(token, maxAge) {
  const secure = cookieSecure() ? ' Secure;' : '';
  return `token=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax;${secure}`;
}

// Path tempat cookie `token` lama mungkin pernah ditulis (document.cookie
// tanpa Path ngikut folder halaman saat itu).
const PATH_TOKEN_LAMA = [
  '/', '/login', '/api', '/api/auth', '/dashboard', '/admin', '/perwakilan', '/profil',
];

/**
 * Header Set-Cookie buat MENGHAPUS cookie `token` lama yang Path/Domain-nya
 * beda dari cookie resmi (host-only, Path=/). Cookie cuma bisa dihapus kalau
 * nama+Path+Domain-nya sama persis, jadi semua kombinasi yang mungkin dikirim.
 * Cookie resmi (host-only, Path=/) TIDAK ikut — itu ditimpa/dihapus sendiri
 * lewat headerCookieToken.
 *
 * @param {Request} request - dipakai buat baca host (varian Domain=...)
 * @returns {string[]}
 */
export function headerHapusTokenLama(request) {
  const secure = cookieSecure() ? ' Secure;' : '';
  const host = String(request?.headers?.get('host') || '').split(':')[0].toLowerCase();

  // Domain=host, Domain=parent.tld, ... (bukan IP/localhost)
  const domains = [];
  if (host && host.includes('.') && !/^[\d.]+$/.test(host)) {
    const bagian = host.split('.');
    for (let i = 0; i <= bagian.length - 2; i++) domains.push(bagian.slice(i).join('.'));
  }

  const hasil = [];
  for (const p of PATH_TOKEN_LAMA) {
    const varian = [null, ...domains];
    for (const d of varian) {
      if (p === '/' && d === null) continue; // cookie resmi
      const dom = d ? ` Domain=${d};` : '';
      hasil.push(`token=; Path=${p};${dom} Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax;${secure}`);
    }
  }
  return hasil;
}
