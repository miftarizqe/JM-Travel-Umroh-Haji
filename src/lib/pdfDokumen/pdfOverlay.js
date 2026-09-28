// Helper bersama buat nempel teks di atas template PDF final — dipakai
// skCifOverlay.js & suratPemblokiranOverlay.js (pola sama persis kartu ID
// member, src/lib/id-card/generate.js). Koordinat field per dokumen diukur
// presisi pakai `pdftotext -bbox nama-template.pdf` (poppler-utils):
// yMin/yMax hasil situ diukur dari ATAS halaman, dikonversi ke koordinat
// pdf-lib (dari BAWAH, dipakai drawText) via `pageHeight - yMax + 2`.
import { rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';

export async function embedTemplatePages(outDoc, templatePath, pageIndices) {
  const bytes = await readFile(templatePath);
  return outDoc.embedPdf(bytes, pageIndices);
}

export function tempelHalamanTemplate(outDoc, embedded) {
  const page = outDoc.addPage([embedded.width, embedded.height]);
  page.drawPage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return page;
}

// Timpa area blank ("______"/"( )") pakai kotak putih SEBELUM nulis teks —
// tanpa ini, sisa garis bawah template yang lebih panjang dari nilai yang
// diisi bakal tetep keliatan nyembul di belakang teksnya.
function tutupBlank(page, { left, y, width, size }) {
  page.drawRectangle({ x: left, y: y - 3, width, height: size + 6, color: rgb(1, 1, 1) });
}

// Rata kiri, mulai dari titik x — dipakai buat isian "Label : ______".
export function drawFitKiri(page, font, text, { x, y, maxWidth }, size) {
  if (!text) return;
  let fontSize = size;
  const width = font.widthOfTextAtSize(text, fontSize);
  if (width > maxWidth) fontSize *= maxWidth / width;
  tutupBlank(page, { left: x, y, width: maxWidth, size });
  page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
}

// Rata tengah dalam sebuah box — dipakai buat nama tercetak di kolom TTD
// "( nama )" biar simetris di antara kurung buka & tutup.
export function drawFitCenter(page, font, text, { center, y, maxWidth }, size) {
  if (!text) return;
  let fontSize = size;
  let width = font.widthOfTextAtSize(text, fontSize);
  if (width > maxWidth) { fontSize *= maxWidth / width; width = maxWidth; }
  tutupBlank(page, { left: center - maxWidth / 2, y, width: maxWidth, size });
  page.drawText(text, { x: center - width / 2, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
}
