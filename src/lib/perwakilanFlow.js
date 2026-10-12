// Urutan langkah pendaftaran perwakilan SETELAH formulir data diisi:
// setuju PKS -> pilih metode pendaftaran (kantor/paket) -> status tracker.
// Dipakai di beberapa halaman (daftar-perwakilan, metode) buat nentuin
// "kalau applicant keluar di tengah jalan lalu balik lagi, harus diarahkan
// ke langkah mana" — daripada masing-masing halaman nebak sendiri.
// `cek` = response GET /api/status-pendaftaran.
//
// TTD digital formulir (step terpisah via /tanda-tangan/[id]) DICABUT
// (dikonfirmasi user 2026-10-12) — proses sekarang semuanya fisik (print
// sendiri/datang ke kantor), bukan esign. "Formulir selesai" sekarang cukup
// ditandai submit formulir itu sendiri (cek.pendaftaran ada), tanda tangan
// fisiknya nempel di dokumen SPK-PWK yang dicetak pas kantor/paket.
export function langkahBerikutnyaPerwakilan(cek) {
  if (!cek?.pendaftaran) return null; // belum pernah isi formulir sama sekali
  if (!cek.prasyarat?.pks_disetujui) return '/pks?jenis=perwakilan';
  if (!cek.prasyarat?.metode_dipilih) return '/daftar-perwakilan/metode';
  return '/status-pendaftaran';
}
