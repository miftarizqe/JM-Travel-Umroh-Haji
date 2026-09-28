// Isi otomatis PDF SK-CIF (nama/NIK/alamat/dll) dengan cara nempel teks di
// atas 1 file PDF template FINAL — pola sama persis kayak kartu ID member
// (src/lib/id-card/generate.js), TANPA API Google apa pun (dicabut
// 2026-09-28 setelah kejegal Google Cloud org policy yang ngeblokir
// pembuatan service account key).
//
// Template PDF-nya (templates/sk-cif-template.pdf) DIANGGAP GAK PERNAH
// BERUBAH LAGI (dikonfirmasi user) — kalau isi/layout template diedit ulang
// (mis. via Word lalu di-export PDF lagi), koordinat di bawah HARUS diukur
// ulang, gak otomatis ikut nyesuain. Cara ukur ulang: jalankan
// `pdftotext -bbox templates/sk-cif-template.pdf` (poppler-utils), koordinat
// yMin/yMax yang dikeluarkan itu diukur dari ATAS halaman — dikonversi ke
// koordinat pdf-lib (dari BAWAH halaman, dipakai drawText) via
// `pageHeight - yMax + 2`.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import path from 'path';
import { readFile } from 'fs/promises';

const TEMPLATE_PDF_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/sk-cif-template.pdf');

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
// atas/dekat teks ini, bukan digantikan. Posisi center = titik tengah
// horizontal antara kurung buka & tutup di template.
const FONT_SIZE_TTD = 10;
const P2_TANDA_TANGAN = {
  pemberiKuasa:  { center: 170, y: 136, maxWidth: 130 }, // ( ) kiri, di atas "Jamaah Sahabat Baitullah"
  penerimaKuasa: { center: 440, y: 136, maxWidth: 130 }, // ( ) kanan, di atas "Direktur Utama"
};

function drawFitKiri(page, font, text, { x, y, maxWidth }, size) {
  if (!text) return;
  let fontSize = size;
  const width = font.widthOfTextAtSize(text, fontSize);
  if (width > maxWidth) fontSize *= maxWidth / width;
  page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
}

function drawFitCenter(page, font, text, { center, y, maxWidth }, size) {
  if (!text) return;
  let fontSize = size;
  let width = font.widthOfTextAtSize(text, fontSize);
  if (width > maxWidth) { fontSize *= maxWidth / width; width = maxWidth; }
  page.drawText(text, { x: center - width / 2, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
}

/**
 * @param {object} data
 * @param {string} data.nama
 * @param {string} data.nik
 * @param {string} data.alamat
 * @param {string} data.noRekening
 * @param {string} data.namaWakil - nama Penerima Kuasa (Direktur Utama), dicetak di kolom TTD kanan
 * @returns {Promise<Buffer>}
 */
export async function generateSkCifPdf({ nama, nik, alamat, noRekening, namaWakil }) {
  const templateBytes = await readFile(TEMPLATE_PDF_PATH);
  const outDoc = await PDFDocument.create();
  const [p1Embed, p2Embed] = await outDoc.embedPdf(templateBytes, [0, 1]);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  const page1 = outDoc.addPage([p1Embed.width, p1Embed.height]);
  page1.drawPage(p1Embed, { x: 0, y: 0, width: p1Embed.width, height: p1Embed.height });
  drawFitKiri(page1, font, nama, P1.nama, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, nik, P1.nik, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, alamat, P1.alamat, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, noRekening, P1.noRekening, FONT_SIZE_ISIAN);
  drawFitKiri(page1, font, nama, P1.namaRekening, FONT_SIZE_ISIAN);

  const page2 = outDoc.addPage([p2Embed.width, p2Embed.height]);
  page2.drawPage(p2Embed, { x: 0, y: 0, width: p2Embed.width, height: p2Embed.height });
  drawFitCenter(page2, font, nama, P2_TANDA_TANGAN.pemberiKuasa, FONT_SIZE_TTD);
  drawFitCenter(page2, font, namaWakil, P2_TANDA_TANGAN.penerimaKuasa, FONT_SIZE_TTD);

  return Buffer.from(await outDoc.save());
}
