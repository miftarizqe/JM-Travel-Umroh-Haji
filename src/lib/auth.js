import jwt from 'jsonwebtoken';

/**
 * Helper autentikasi untuk API route.
 *
 * Masalah yang diselesaikan:
 * Sebelumnya JWT dibuat saat login tapi TIDAK PERNAH diverifikasi di API mana pun,
 * dan middleware sengaja mengecualikan /api. Akibatnya siapa pun (bahkan tanpa login)
 * bisa memanggil API admin langsung: approve pembayaran, cairkan komisi, hapus program.
 */

/**
 * Sesi login berlaku 4 jam sejak LOGIN (dikonfirmasi user 2026-10-13, sebelumnya 24 jam) —
 * bukan sejak token terakhir diterbitkan: ganti role (/api/auth/switch-role)
 * nerbitin token baru tapi bawa `login_at` yang sama, jadi gak memperpanjang
 * sesi. Dicek di sini (semua API), di src/proxy.js (halaman), dan di
 * useCurrentUser (cache data user di browser).
 */
export const DURASI_SESI_DETIK = 4 * 60 * 60;

/** Detik (epoch) kapan sesi token ini berakhir. Token lama tanpa login_at pakai iat. */
export function sesiBerakhirPada(payload) {
  const loginAt = Number(payload?.login_at || payload?.iat || 0);
  return loginAt + DURASI_SESI_DETIK;
}

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
 * Verifikasi token, kembalikan payload user.
 * Kalau ada beberapa cookie `token`, pakai yang sah & paling baru.
 * @returns {object|null} { id, role, ... } atau null kalau tidak valid
 */
/**
 * Sahabat Baitullah yang DITOLAK PERMANEN admin tetap boleh login
 * (dikonfirmasi user 2026-10-15, dulu login-nya diblok total), tapi
 * tertahan di /status-pendaftaran-sahabat (proxy) — token-nya bawa klaim
 * `ditolak: true` & cuma boleh dipakai ke API di daftar ini. API lain
 * nganggep gak login.
 */
const API_BOLEH_SAAT_DITOLAK = ['/api/auth', '/api/notifications', '/api/pengaturan', '/api/metode-pembayaran'];

function bolehSaatDitolak(request) {
  let path = '';
  let method = 'GET';
  try {
    path = new URL(request.url).pathname;
    method = String(request.method || 'GET').toUpperCase();
  } catch {
    return false;
  }
  // Halaman status cuma butuh baca status; aksi (PATCH) jamaah gak boleh.
  if (path === '/api/status-pendaftaran-sahabat') return method === 'GET';
  return API_BOLEH_SAAT_DITOLAK.some(p => path === p || path.startsWith(`${p}/`));
}

/**
 * Terbitkan ulang token sesi yang sama (login_at & batas 4 jam TETAP, gak
 * memperpanjang sesi) dengan klaim tambahan — pola sama dengan
 * /api/auth/switch-role. Null kalau sesinya udah habis.
 */
export function terbitkanUlangToken(payload, tambahan = {}) {
  const berakhir = sesiBerakhirPada(payload);
  const sisaDetik = berakhir - Math.floor(Date.now() / 1000);
  if (sisaDetik <= 0) return null;
  const isi = { ...payload };
  delete isi.iat;
  delete isi.exp;
  const loginAt = Number(payload.login_at || payload.iat);
  const token = jwt.sign({ ...isi, ...tambahan, login_at: loginAt, exp: berakhir }, ambilJwtSecret());
  return { token, maxAge: sisaDetik };
}

export function verifikasiToken(request) {
  const payload = verifikasiTokenMentah(request);
  if (payload?.ditolak && !bolehSaatDitolak(request)) return null;
  return payload;
}

function verifikasiTokenMentah(request) {
  const tokens = semuaTokenDariHeader(request.headers.get('cookie'));
  const sekarang = Math.floor(Date.now() / 1000);
  let terbaik = null;
  for (const token of tokens) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // Token terbitan sebelum aturan ini (masa berlaku lebih lama) ikut
      // ditolak begitu lewat 4 jam dari login.
      if (sekarang >= sesiBerakhirPada(payload)) continue;
      if (!terbaik || Number(payload.iat || 0) > Number(terbaik.iat || 0)) terbaik = payload;
    } catch {
      // token rusak / tanda tangan salah -> coba yang lain
    }
  }
  return terbaik;
}

/**
 * Pastikan pemanggil sudah login.
 * Pakai di API yang butuh user apa pun.
 *
 * @returns {{ user: object } | { error: Response }}
 */
export function wajibLogin(request) {
  const user = verifikasiToken(request);
  if (!user) {
    return {
      error: Response.json(
        { error: 'Tidak terautentikasi. Silakan login terlebih dahulu.' },
        { status: 401 }
      ),
    };
  }
  return { user };
}

/**
 * super_admin adalah SUPERSET dari admin (bisa semua yang admin bisa,
 * ditambah laporan keuangan perusahaan yang sensitif) — bukan role
 * terpisah yang butuh dicek satu-satu. Supaya SEMUA pemanggil
 * `wajibRole(request, ['admin'])` yang sudah ada di puluhan endpoint
 * otomatis menerima super_admin juga TANPA perlu diubah satu-satu,
 * pengecekannya ditaruh di SINI, titik tunggal.
 */
function cocokRole(userRole, rolesDiizinkan) {
  if (rolesDiizinkan.length === 0) return true;
  if (rolesDiizinkan.includes(userRole)) return true;
  if (userRole === 'super_admin' && rolesDiizinkan.includes('admin')) return true;
  return false;
}

/**
 * Pastikan pemanggil punya salah satu role yang diizinkan.
 *
 * Contoh:
 *   const auth = wajibRole(request, ['admin']);
 *   if (auth.error) return auth.error;
 *   // auth.user aman dipakai
 *
 * @param {Request} request
 * @param {string[]} rolesDiizinkan
 * @returns {{ user: object } | { error: Response }}
 */
export function wajibRole(request, rolesDiizinkan = []) {
  const user = verifikasiToken(request);
  if (!user) {
    return {
      error: Response.json(
        { error: 'Tidak terautentikasi. Silakan login terlebih dahulu.' },
        { status: 401 }
      ),
    };
  }
  // Head of Program (role 'hop') TIDAK ikut lolos di sini (dikonfirmasi user
  // 2026-10-05): HoP cuma boleh lihat data Sahabat Baitullah, lewat
  // wajibAdminAtauHopSahabat (src/lib/hopAuth.js) di endpoint Sahabat —
  // bukan baca semua endpoint admin (jamaah, perwakilan, booking, dst).
  if (!cocokRole(user.role, rolesDiizinkan)) {
    return {
      error: Response.json(
        { error: 'Akses ditolak. Anda tidak berhak melakukan tindakan ini.' },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * Pastikan pemanggil super_admin — dipakai khusus buat data sensitif
 * (laporan keuangan perusahaan, pengeluaran/gaji) yang gak boleh
 * dilihat admin operasional biasa, cuma segelintir orang terpercaya.
 * Beda dari wajibRole(['admin']) — di sini admin BIASA sengaja ditolak.
 *
 * @param {Request} request
 * @returns {{ user: object } | { error: Response }}
 */
export function wajibSuperAdmin(request) {
  const user = verifikasiToken(request);
  if (!user) {
    return {
      error: Response.json(
        { error: 'Tidak terautentikasi. Silakan login terlebih dahulu.' },
        { status: 401 }
      ),
    };
  }
  if (user.role !== 'super_admin') {
    return {
      error: Response.json(
        { error: 'Akses ditolak. Halaman ini khusus super admin.' },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * Pastikan pemanggil adalah pemilik data, atau admin.
 * Berguna untuk API yang mengambil data milik user tertentu.
 *
 * @param {Request} request
 * @param {string} pemilikId - id user pemilik data
 */
export function wajibPemilikAtauAdmin(request, pemilikId) {
  const user = verifikasiToken(request);
  if (!user) {
    return {
      error: Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 }),
    };
  }
  if (user.role !== 'admin' && user.role !== 'super_admin' && String(user.id) !== String(pemilikId)) {
    return {
      error: Response.json(
        { error: 'Akses ditolak. Anda hanya bisa mengakses data milik sendiri.' },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * JWT_SECRET wajib ada. Tanpa ini jwt.sign melempar error generik dan login
 * selalu 500 tanpa petunjuk; di sini error-nya menyebut penyebab aslinya.
 */
export function ambilJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error('JWT_SECRET belum diset di environment server');
  }
  return secret;
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

/**
 * Bikin Headers berisi Content-Type JSON + Set-Cookie: hapus semua varian
 * cookie lama DULU, baru set cookie resmi (urutan penting — browser memproses
 * Set-Cookie berurutan).
 */
export function headersCookieSesi(request, token, maxAge) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const h of headerHapusTokenLama(request)) headers.append('Set-Cookie', h);
  headers.append('Set-Cookie', headerCookieToken(token, maxAge));
  return headers;
}
