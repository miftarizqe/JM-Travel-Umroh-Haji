// Isi otomatis PDF SK-CIF (nama/NIK/alamat/dll) dengan cara nempel teks di
// atas 1 file PDF template FINAL — lihat pdfOverlay.js buat penjelasan pola
// & cara ukur ulang koordinat kalau template diganti.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter, drawAlamatWrap } from './pdfOverlay';

export const SK_CIF_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/sk-cif-template.pdf');

// Halaman 1 — field identitas, ditulis rata kiri persis setelah tanda ":".
// Template direvisi (2026-10-03) — Alamat sekarang 2 baris (baris 1: jalan/
// no rumah/RT-RW, baris 2: kelurahan/kecamatan/kota/provinsi), field di
// bawahnya (noRekening, namaRekening) geser turun 14pt karena baris baru
// itu. Diukur ulang via pdftotext -bbox, bandingin posisi SEBELUM/SESUDAH.
const FONT_SIZE_ISIAN = 11;
const P1 = {
  nama:          { x: 246, y: 639, maxWidth: 315 },
  nik:           { x: 246, y: 625, maxWidth: 315 },
  alamatBaris1:  { x: 246, y: 611, maxWidth: 315 },
  alamatBaris2:  { x: 246, y: 597, maxWidth: 315 },
  noRekening:    { x: 246, y: 501, maxWidth: 315 },
  namaRekening:  { x: 246, y: 487, maxWidth: 315 },
};

// Halaman 2 — nama tercetak kecil DI DALAM kurung kolom tanda tangan
// (dikonfirmasi user 2026-09-28: biar jelas siapa yang TTD kalau tulisan
// tangan susah dibaca) — tanda tangan asli tetap ditulis tangan di
// atas/dekat teks ini, bukan digantikan. Baris "________,________________"
// di atas TTD sekarang diisi tanggal juga (dikonfirmasi user 2026-10-03,
// sebelumnya selalu kosong). Koordinat halaman 2 ikut geser turun ~27.6pt
// dari revisi alamat 2-baris di halaman 1 (reflow paragraf, bukan cuma 14pt).
const FONT_SIZE_TTD = 10;
const P2_TANDA_TANGAN = {
  pemberiKuasa:  { center: 170, y: 108, maxWidth: 130 }, // ( ) kiri, di atas "Jamaah Sahabat Baitullah"
  penerimaKuasa: { center: 440, y: 108, maxWidth: 130 }, // ( ) kanan, di atas "Direktur Utama"
};
const P2_TANGGAL = { x: 90, y: 240, maxWidth: 300 };

/**
 * Tempel 2 halaman SK-CIF (sudah keisi) ke outDoc yang lagi disusun —
 * dipakai baik buat PDF SK-CIF berdiri sendiri maupun digabung dengan
 * dokumen lain (lihat dokumenSahabatGabungan.js).
 * @param {import('pdf-lib').PDFDocument} outDoc
 * @param {{nama:string, nik:string, alamatBaris1:string, alamatBaris2:string, noRekening:string, namaRekening:string, namaWakil:string, tanggalTtd:string}} data
 */
export async function tambahHalamanSkCif(outDoc, { nama, nik, alamatBaris1, alamatBaris2, noRekening, namaRekening, namaWakil, tanggalTtd }) {
  const [p1Embed, p2Embed] = await embedTemplatePages(outDoc, SK_CIF_TEMPLATE_PATH, [0, 1]);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  const page1 = tempelHalamanTemplate(outDoc, p1Embed);
  drawFitKiri(page1, font, nama, P1.nama, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, nik, P1.nik, FONT_SIZE_ISIAN);
  // Direflow ke MAKS 3 baris berdasar lebar asli (dikonfirmasi user
  // 2026-10-09), bukan lagi split tetap per kelompok komponen -- baris ke-3
  // (y - 28) aman, diukur pdftotext -bbox ada ~41pt kosong sebelum paragraf
  // "untuk selanjutnya disebut Pemberi Kuasa" di bawahnya (pas 3 baris @14pt).
  drawAlamatWrap(page1, font, [alamatBaris1, alamatBaris2].filter(Boolean).join(' '), P1.alamatBaris1, FONT_SIZE_ISIAN, 3, 14);
  drawFitKiri(page1, font, noRekening, P1.noRekening, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, namaRekening ?? nama, P1.namaRekening, FONT_SIZE_ISIAN);

  const page2 = tempelHalamanTemplate(outDoc, p2Embed);
  drawFitKiri(page2, font, tanggalTtd, P2_TANGGAL, FONT_SIZE_ISIAN);
  drawFitCenter(page2, font, nama, P2_TANDA_TANGAN.pemberiKuasa, FONT_SIZE_TTD);
  drawFitCenter(page2, font, namaWakil, P2_TANDA_TANGAN.penerimaKuasa, FONT_SIZE_TTD);
}

/** @returns {Promise<Buffer>} PDF SK-CIF berdiri sendiri (2 halaman) */
export async function generateSkCifPdf(data) {
  const outDoc = await PDFDocument.create();
  await tambahHalamanSkCif(outDoc, data);
  return Buffer.from(await outDoc.save());
}
