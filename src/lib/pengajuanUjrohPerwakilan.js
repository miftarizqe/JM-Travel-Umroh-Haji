// Nama tampilan pengajuan ujroh perwakilan — per PROGRAM, bukan per periode
// tanggal (beda dari Sahabat Baitullah, lihat src/lib/pengajuanUjroh.js).
export function namaPengajuanPerwakilan(p) {
  return `Pencairan Ujroh Perwakilan — ${p.prog_name || 'Program tidak diketahui'}`;
}
