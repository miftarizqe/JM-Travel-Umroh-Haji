// Isi otomatis PDF SK-CIF (nama/NIK/alamat/dll) dengan cara nempel teks di
// atas 1 file PDF template FINAL — lihat pdfOverlay.js buat penjelasan pola
// & cara ukur ulang koordinat kalau template diganti.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter } from './pdfOverlay';

export const SK_CIF_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/sk-cif-template.pdf');

// Halaman 1 — field identitas, ditulis rata kiri persis setelah tanda ":".
const FONT_SIZE_ISIAN = 11;
const P1 = {
  nama:          { x: 246, y: 639, maxWidth: 315 },
  nik:           { x: 246, y: 625, maxWidth: 315 },
  alamat:        { x: 246, y: 611, maxWidth: 315 },
  noRekening:    { x: 246, y: 515, maxWidth: 315 },
  namaRekening:  { x: 246, y: 501, maxWidth: 315 },
};

// Halaman 2 — nama tercetak kecil DI DALAM kurung kolom tanda tangan
// (dikonfirmasi user 2026-09-28: biar jelas siapa yang TTD kalau tulisan
// tangan susah dibaca) — tanda tangan asli tetap ditulis tangan di
// atas/dekat teks ini, bukan digantikan.
const FONT_SIZE_TTD = 10;
const P2_TANDA_TANGAN = {
  pemberiKuasa:  { center: 170, y: 136, maxWidth: 130 }, // ( ) kiri, di atas "Jamaah Sahabat Baitullah"
  penerimaKuasa: { center: 440, y: 136, maxWidth: 130 }, // ( ) kanan, di atas "Direktur Utama"
};

/**
 * Tempel 2 halaman SK-CIF (sudah keisi) ke outDoc yang lagi disusun —
 * dipakai baik buat PDF SK-CIF berdiri sendiri maupun digabung dengan
 * dokumen lain (lihat dokumenSahabatGabungan.js).
 * @param {import('pdf-lib').PDFDocument} outDoc
 * @param {{nama:string, nik:string, alamat:string, noRekening:string, namaWakil:string}} data
 */
export async function tambahHalamanSkCif(outDoc, { nama, nik, alamat, noRekening, namaWakil }) {
  const [p1Embed, p2Embed] = await embedTemplatePages(outDoc, SK_CIF_TEMPLATE_PATH, [0, 1]);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  const page1 = tempelHalamanTemplate(outDoc, p1Embed);
  drawFitKiri(page1, font, nama, P1.nama, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, nik, P1.nik, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, alamat, P1.alamat, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, noRekening, P1.noRekening, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, nama, P1.namaRekening, FONT_SIZE_ISIAN);

  const page2 = tempelHalamanTemplate(outDoc, p2Embed);
  drawFitCenter(page2, font, nama, P2_TANDA_TANGAN.pemberiKuasa, FONT_SIZE_TTD);
  drawFitCenter(page2, font, namaWakil, P2_TANDA_TANGAN.penerimaKuasa, FONT_SIZE_TTD);
}

/** @returns {Promise<Buffer>} PDF SK-CIF berdiri sendiri (2 halaman) */
export async function generateSkCifPdf(data) {
  const outDoc = await PDFDocument.create();
  await tambahHalamanSkCif(outDoc, data);
  return Buffer.from(await outDoc.save());
}
