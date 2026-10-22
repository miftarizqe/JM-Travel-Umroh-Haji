// Halaman yang butuh login — dipakai bareng src/proxy.js (redirect ke
// /login) & useCurrentUser (sesi habis di halaman publik kayak landing page
// cukup jadi mode tamu, gak dilempar ke /login).
export const RUTE_TERLINDUNGI = [
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
  // Ketinggalan dari daftar lama (ketemu 2026-10-15): halaman-halaman ini
  // butuh user login tapi gak dijaga proxy, jadi begitu sesi 4 jam habis
  // user nyangkut di "Loading..." selamanya, bukan dilempar ke /login.
  '/daftar-sahabat',
  '/bayar-dp',
  '/bayar-pelunasan',
  '/tambah-jamaah',
  '/batalkan-program',
  '/upgrade-perwakilan',
  '/tanda-tangan',
  '/riwayat-transaksi',
];

export function isRuteTerlindungi(pathname) {
  return RUTE_TERLINDUNGI.some(route => String(pathname || '').startsWith(route));
}
