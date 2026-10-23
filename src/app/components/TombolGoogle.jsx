'use client';
import { PESAN_PERWAKILAN_COMING_SOON } from '@/lib/fiturSementara';

/**
 * Tombol "Masuk/Daftar dengan Google" — cuma link ke /api/auth/google (backend yang
 * ngurus OAuth). `kembali` = halaman tujuan setelah selesai (path lokal).
 */
export default function TombolGoogle({ label = 'Masuk dengan Google', kembali, onClick }) {
  const href = kembali ? `/api/auth/google?kembali=${encodeURIComponent(kembali)}` : '/api/auth/google';
  return (
    <a
      href={href}
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 hover:border-[#1A4FA0] bg-white text-gray-700 font-semibold py-3 rounded-full transition-colors text-sm"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
      </svg>
      {label}
    </a>
  );
}

// Teks untuk ?google_error=<kode> dari /api/auth/google/callback (kode, bukan teks bebas,
// biar link buatan orang gak bisa nampilin pesan sembarangan).
const PESAN_ERROR_GOOGLE = {
  belum_aktif: 'Login dengan Google belum diaktifkan. Silakan masuk dengan email/WA & password.',
  terlalu_sering: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
  dibatalkan: 'Login dengan Google dibatalkan.',
  kedaluwarsa: 'Proses login Google kedaluwarsa. Silakan coba lagi.',
  gagal: 'Login dengan Google gagal. Silakan coba lagi.',
  email_belum_verifikasi: 'Email akun Google Anda belum terverifikasi.',
  khusus_password: 'Akun admin hanya bisa masuk dengan email & password.',
  tertaut_lain: 'Email ini sudah ditautkan ke akun Google lain. Masuk dengan password, atau pakai akun Google yang benar.',
  nonaktif: 'Akun Anda dinonaktifkan. Hubungi admin JM Travel.',
  ditolak: 'Pendaftaran Anda ditolak. Hubungi admin JM Travel.',
  perwakilan_ditunda: PESAN_PERWAKILAN_COMING_SOON,
};

export function pesanErrorGoogle(kode) {
  if (!kode) return '';
  return PESAN_ERROR_GOOGLE[kode] || PESAN_ERROR_GOOGLE.gagal;
}
