// Urutan langkah pendaftaran perwakilan SETELAH formulir data diisi:
// TTD digital formulir -> setuju PKS -> pilih metode pendaftaran -> status
// tracker. Dipakai di beberapa halaman (daftar-perwakilan, metode) buat
// nentuin "kalau applicant keluar di tengah jalan lalu balik lagi, harus
// diarahkan ke langkah mana" — daripada masing-masing halaman nebak sendiri.
// `cek` = response GET /api/status-pendaftaran.
export function langkahBerikutnyaPerwakilan(cek) {
  if (!cek?.pendaftaran) return null; // belum pernah isi formulir sama sekali
  if (!cek.prasyarat?.formulir_ttd_selesai) {
    return cek.formulir_signature_id ? `/tanda-tangan/${cek.formulir_signature_id}` : '/daftar-perwakilan';
  }
  if (!cek.prasyarat?.pks_disetujui) return '/pks?jenis=perwakilan';
  if (!cek.prasyarat?.metode_dipilih) return '/daftar-perwakilan/metode';
  return '/status-pendaftaran';
}
