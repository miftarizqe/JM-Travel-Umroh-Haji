import jwt from 'jsonwebtoken';

/**
 * Helper autentikasi untuk API route.
 *
 * Masalah yang diselesaikan:
 * Sebelumnya JWT dibuat saat login tapi TIDAK PERNAH diverifikasi di API mana pun,
 * dan middleware sengaja mengecualikan /api. Akibatnya siapa pun (bahkan tanpa login)
 * bisa memanggil API admin langsung: approve pembayaran, cairkan komisi, hapus program.
 */

/** Ambil token dari cookie request. */
function ambilToken(request) {
  // Next.js Request: cookie ada di header
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Verifikasi token, kembalikan payload user.
 * @returns {object|null} { id, role, ... } atau null kalau tidak valid
 */
export function verifikasiToken(request) {
  const token = ambilToken(request);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
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
