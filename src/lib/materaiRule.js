// Aturan kapan sebuah dokumen wajib bermaterai (UU Bea Meterai No. 10/2020).
// SPKA-Ins: akta perjanjian kemitraan, selalu bermaterai (sama seperti proses
// fisik sekarang — TTD selalu di atas materai), dan SATU-SATUNYA dokumen yang
// pakai skema 2 rangkap/2 materai (lihat rangkapUntukSpkaIns() di bawah).
// Formulir Pendaftaran: DIKONFIRMASI tidak pernah pakai materai (dikonfirmasi
// user 2026-08-14) — cuma SPKA-Ins yang mengikat secara hukum & bermaterai.
// Invoice/Kwitansi: cuma dokumen yang FUNGSINYA jadi tanda terima uang >=
// Rp5.000.000 yang wajib (BATAS_MATERAI, sama seperti aturan existing di
// src/app/admin/cetak-invoice/[id]/page.jsx).
// Jamaah (Perjanjian Keberangkatan Jamaah): SEKARANG bermaterai wajib juga
// (dibalik dari keputusan awal — dikonfirmasi user 2026-08-20) karena
// perjanjian ini sekarang jadi step wajib tersendiri sebelum pelunasan dan
// harus jadi pegangan hukum yang kuat buat kedua pihak, termasuk memuat
// persetujuan penyesuaian harga (force majeure/kenaikan tiket) kalau ada.
// SPK-AK & SK-CIF (program sahabat/BSI): keduanya perjanjian mengikat
// secara hukum juga, dikonfirmasi user 2026-08-27 — SK-CIF khususnya wajib
// materai fisik asli karena jadi dasar penghubung ke CIF BSI si jemaah.
// surat_pemblokiran (Surat Pernyataan Kuasa Blokir Rekening & Instruksi
// Pemindahbukuan) juga wajib fisik+materai asli — dikirim ke BSI, dokumen
// ke-3 program Sahabat Baitullah (setelah SPK-AK & SK-CIF — Surat Kuasa
// Multi CIF BSI DIHAPUS TOTAL 2026-09-09, cuma SK-CIF yang beneran dipakai
// buat CIF), dikonfirmasi user 2026-09-09.
export const BATAS_MATERAI = 5_000_000;

/**
 * @param {'spka_ins'|'jamaah'|'formulir'|'invoice'|'spk_ak'|'sk_cif'|'surat_pemblokiran'} dokumen
 * @param {{ nominal?: number, jenis?: string, status?: string }} [ctx] - dipakai khusus utk 'invoice'
 */
export function apakahPerluMaterai(dokumen, ctx = {}) {
  if (dokumen === 'spka_ins' || dokumen === 'jamaah' || dokumen === 'spk_ak' || dokumen === 'sk_cif' || dokumen === 'surat_pemblokiran') return true;
  if (dokumen === 'invoice') {
    const berfungsiTandaTerima = ctx.jenis === 'kwitansi' || ctx.status === 'paid';
    return berfungsiTandaTerima && Number(ctx.nominal || 0) >= BATAS_MATERAI;
  }
  return false; // formulir
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
  { rangkap: 'travel', label: 'Rangkap 1 — Untuk JM Travel', signerPihak: 'eksternal' },
  { rangkap: 'luar', label: 'Rangkap 2 — Untuk Perwakilan', signerPihak: 'jm' },
];

// SPK-AK SEKARANG ikut skema 2 rangkap/2 materai persis SPKA-Ins
// (dikonfirmasi user 2026-09-09) — Jamaah Sahabat Baitullah gantiin posisi
// Perwakilan. Signer eksternal-nya SELALU jamaah (Pihak Kedua), BUKAN
// Head of Program (Pihak Ketiga) — Head of Program di dokumen ini cuma
// dicetak sebagai identitas pihak, gak perlu TTD digital terpisah, sama
// kayak Perekrut di SPKA-Ins yang juga gak ikut sesi TTD digital.
export const RANGKAP_SPK_AK = [
  { rangkap: 'travel', label: 'Rangkap 1 — Untuk JM Travel', signerPihak: 'eksternal' },
  { rangkap: 'luar', label: 'Rangkap 2 — Untuk Jamaah Sahabat Baitullah', signerPihak: 'jm' },
];
