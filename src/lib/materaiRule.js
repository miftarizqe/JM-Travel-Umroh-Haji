// Aturan kapan sebuah dokumen wajib bermaterai (UU Bea Meterai No. 10/2020).
// SPKA-Ins: akta perjanjian kemitraan, selalu bermaterai (sama seperti proses
// fisik sekarang — TTD selalu di atas materai), dan SATU-SATUNYA dokumen yang
// pakai skema 2 rangkap/2 materai (lihat rangkapUntukSpkaIns() di bawah).
// Formulir Pendaftaran: DIKONFIRMASI tidak pernah pakai materai (dikonfirmasi
// user 2026-08-14) — cuma SPKA-Ins yang mengikat secara hukum & bermaterai.
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
  if (dokumen === 'spka_ins') return true;
  if (dokumen === 'invoice') {
    const berfungsiTandaTerima = ctx.jenis === 'kwitansi' || ctx.status === 'paid';
    return berfungsiTandaTerima && Number(ctx.nominal || 0) >= BATAS_MATERAI;
  }
  return false; // jamaah, formulir
}

// Skema rangkap KHUSUS SPKA-Ins — 2 rangkap, masing-masing bermaterai
// SENDIRI (total 2 materai, bukan 1 dipakai 2x). Materai tiap rangkap
// di-TTD/crossing oleh pihak yang TIDAK memegang rangkap itu (konvensi
// hukum: pemegang rangkap menyimpan bukti tanda tangan pihak LAWAN, bukan
// tanda tangan sendiri) — dikonfirmasi user 2026-08-14:
//   - rangkap 'travel' (balik & disimpan JM Travel) -> materai di-TTD PERWAKILAN
//   - rangkap 'luar'   (disimpan perwakilan)         -> materai di-TTD JM TRAVEL
// signerPihak 'jm' otomatis auto-selesai (tidak nunggu pihak eksternal —
// lihat prosesSatuSesiDigital() di route.js) karena JM Travel adalah pihak
// internal yang sama dengan yang memicu pengiriman dokumen ini.
export const RANGKAP_SPKA_INS = [
  { rangkap: 'travel', label: 'Rangkap 1 — Untuk JM Travel', signerPihak: 'perwakilan' },
  { rangkap: 'luar', label: 'Rangkap 2 — Untuk Perwakilan', signerPihak: 'jm' },
];
