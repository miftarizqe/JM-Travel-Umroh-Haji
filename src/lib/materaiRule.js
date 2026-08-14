// Aturan kapan sebuah dokumen wajib bermaterai (UU Bea Meterai No. 10/2020).
// SPKA-Ins & Formulir Pendaftaran: akta perjanjian kemitraan, selalu bermaterai
// (sama seperti proses fisik sekarang — TTD selalu di atas materai untuk PKS).
// Invoice/Kwitansi: cuma dokumen yang FUNGSINYA jadi tanda terima uang >=
// Rp5.000.000 yang wajib (BATAS_MATERAI, sama seperti aturan existing di
// src/app/admin/cetak-invoice/[id]/page.jsx).
// Jamaah: syarat keberangkatan, bukan akta bernilai uang — proses fisik
// sekarang juga tidak pernah pakai materai untuk ini.
export const BATAS_MATERAI = 5_000_000;

/**
 * @param {'spka_ins'|'jamaah'|'formulir'|'invoice'} dokumen
 * @param {{ nominal?: number, jenis?: string, status?: string }} [ctx] - dipakai khusus utk 'invoice'
 */
export function apakahPerluMaterai(dokumen, ctx = {}) {
  if (dokumen === 'spka_ins' || dokumen === 'formulir') return true;
  if (dokumen === 'invoice') {
    const berfungsiTandaTerima = ctx.jenis === 'kwitansi' || ctx.status === 'paid';
    return berfungsiTandaTerima && Number(ctx.nominal || 0) >= BATAS_MATERAI;
  }
  return false; // jamaah
}
