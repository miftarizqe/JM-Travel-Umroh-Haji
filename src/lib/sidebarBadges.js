// Kabarin Layout.jsx "badge sidebar mungkin berubah, refetch SEKARANG" —
// gak nunggu interval 60 detik atau pindah halaman (dikonfirmasi user
// 2026-10-16, sebelumnya badge ketinggalan sampai admin manual refresh
// browser). Dipanggil dari fungsi reload (muat()/loadAll()) tiap halaman
// admin yang punya badge terkait — lihat
// src/app/api/admin/sidebar-badges/route.js buat daftar lengkap path ->
// kriteria — BUKAN di tiap tombol aksi satu-satu, biar otomatis ke-cover
// semua mutasi di halaman itu tanpa perlu diinget manual tiap nambah aksi
// baru.
export function refreshSidebarBadges() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('jmtravel:sidebar-badges-refresh'));
}
