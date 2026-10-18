// Flag on/off buat fitur yang lagi di-pause sementara (dikonfirmasi user
// 2026-09-27) — program Perwakilan belum jalan, cuma Sahabat Baitullah dulu
// yang launch. Matiin pause = ganti flag ini ke false, gak perlu bongkar
// kode di banyak tempat satu-satu. Dipakai di: pendaftaran baru (register &
// daftar-perwakilan), login akun perwakilan existing, switch-role ke mode
// perwakilan, dan tampilan (landing page, halaman register, upgrade-perwakilan).
export const PERWAKILAN_COMING_SOON = true;
export const PESAN_PERWAKILAN_COMING_SOON = 'Program Perwakilan belum dibuka saat ini — segera hadir. Hubungi admin JM Travel untuk info lebih lanjut.';
