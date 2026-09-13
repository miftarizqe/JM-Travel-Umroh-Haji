function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Nama tampilan pengajuan ujroh — dipakai di list, detail, & halaman cetak,
// gantiin "Pengajuan #ID" polos (dikonfirmasi user 2026-09-02, biar
// dokumennya jelas program & periodenya tanpa perlu buka detail dulu).
// Nomor ID TETAP disertakan di belakang (kecil) buat referensi unik kalau
// ada beberapa pengajuan dengan nama depan yang sama.
export function namaPengajuan(p) {
  return `Pengajuan Pencairan Ujroh Sahabat Baitullah — Periode ${fmtTanggal(p.periode_mulai)} – ${fmtTanggal(p.periode_selesai)}`;
}
