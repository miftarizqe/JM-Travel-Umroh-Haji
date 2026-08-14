// Adapter Peruri (satu-satunya penyedia e-meterai resmi di Indonesia) —
// BELUM diimplementasi. Titik plug-in eksplisit: begitu akun bisnis Peruri
// aktif (butuh NPWP perusahaan terverifikasi + kontrak e-meterai), isi
// fungsi ini sesuai dokumentasi API Peruri, lalu set env MATERAI_PROVIDER=peruri.
export async function beli({ dokumen, refId, pdfBuffer }) {
  throw new Error(
    'Provider materai "peruri" belum terhubung — set MATERAI_PROVIDER=mock, ' +
    'atau lengkapi integrasi di sini begitu akun bisnis Peruri sudah aktif.'
  );
}
