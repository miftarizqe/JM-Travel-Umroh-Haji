// Batas ukuran upload yang berlaku di SEMUA tempat upload (client & server):
// gambar maks 3MB, PDF maks 5MB. Dipakai bareng supaya angka & pesannya
// gak beda-beda lagi per endpoint. Pure JS — aman di-import dari client.
export const MAKS_GAMBAR = 3 * 1024 * 1024; // 3MB
export const MAKS_PDF = 5 * 1024 * 1024; // 5MB

function jenisFile(file) {
  const tipe = (file?.type || '').toLowerCase();
  const nama = (file?.name || '').toLowerCase();
  if (tipe === 'application/pdf' || nama.endsWith('.pdf')) return 'pdf';
  if (tipe.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/.test(nama)) return 'gambar';
  return null;
}

// Balikin pesan error kalau file melebihi batas, null kalau aman. File selain
// gambar/PDF gak dibatasi di sini (endpoint-nya validasi tipe sendiri).
export function pesanUkuranFile(file) {
  const jenis = jenisFile(file);
  if (jenis === 'gambar' && file.size > MAKS_GAMBAR) {
    return `Ukuran gambar maksimal 3MB${file.name ? ` (${file.name})` : ''}`;
  }
  if (jenis === 'pdf' && file.size > MAKS_PDF) {
    return `Ukuran PDF maksimal 5MB${file.name ? ` (${file.name})` : ''}`;
  }
  return null;
}
