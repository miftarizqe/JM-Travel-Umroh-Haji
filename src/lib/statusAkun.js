// status_akun: satu nilai siap-tampil (badge) turunan dari users.status + users.terverifikasi,
// dikirim API supaya frontend tidak menghitung sendiri. Kolom DB TIDAK berubah: status tetap
// mengatur login, terverifikasi tetap mengatur order (lihat cekPemesanBolehOrder).
// Harus sama dengan StatusAkun() di jm-travel-api (internal/account/status_akun.go).
//
//   rejected -> 'ditolak', nonaktif -> 'nonaktif', pending -> 'pending'
//   active/NULL -> 'belum_diverifikasi' kalau belum di-ACC admin, selain itu 'aktif'
//
// Staff (admin/super_admin) gak pernah 'belum_diverifikasi' — mereka gak lewat verifikasi
// admin (sama dengan daftar "Menunggu Verifikasi" di Admin > Pengguna).
export function statusAkun({ role, status, terverifikasi }) {
  const s = status || 'active';
  if (s === 'rejected') return 'ditolak';
  if (s === 'nonaktif') return 'nonaktif';
  if (s === 'pending') return 'pending';
  if (!Number(terverifikasi) && role !== 'admin' && role !== 'super_admin') return 'belum_diverifikasi';
  return 'aktif';
}
