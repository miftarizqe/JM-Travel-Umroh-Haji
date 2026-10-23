// Flag on/off buat fitur yang lagi di-pause sementara (dikonfirmasi user
// 2026-09-27) — program Perwakilan belum jalan, cuma Sahabat Baitullah dulu
// yang launch. Matiin pause = ganti flag ini ke false, gak perlu bongkar
// kode di banyak tempat satu-satu. Dipakai di: pendaftaran baru (register &
// daftar-perwakilan), login akun perwakilan existing, switch-role ke mode
// perwakilan, dan tampilan (landing page, halaman register, upgrade-perwakilan).
// Dibuka per lingkungan lewat build arg NEXT_PUBLIC_PERWAKILAN_DIBUKA=1
// (dikonfirmasi user 2026-10-22: dev dibuka buat testing, prod tetap
// tertutup) -- pasangannya PERWAKILAN_DIBUKA di backend jm-travel-api.
export const PERWAKILAN_COMING_SOON = process.env.NEXT_PUBLIC_PERWAKILAN_DIBUKA !== '1';
export const PESAN_PERWAKILAN_COMING_SOON = 'Program Perwakilan belum dibuka saat ini — segera hadir. Hubungi admin JM Travel untuk info lebih lanjut.';
