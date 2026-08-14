import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { removeBackground } from '@imgly/background-removal-node';

// Template asli (vektor, dari Canva) — dipakai sebagai background halaman PDF
// output, bukan cuma dirasterkan, biar kualitasnya tetap tajam & tetap bisa
// dibongkar/diedit di Canva kalau perlu.
const TEMPLATE_PDF_PATH = path.join(process.cwd(), 'src/lib/id-card/template.pdf');

// Koordinat diukur dari render template @600dpi (1300x2007px) supaya presisi;
// dikonversi ke satuan pt PDF secara proporsional di pxBoxToPdf(). Kalau
// template diganti lagi, ukur ulang dari render 600dpi-nya.
const RASTER_W = 1300;
const RASTER_H = 2007;
const PHOTO_BOX = { left: 170, top: 560, width: 960, height: 890 };
const NAME_BOX = { left: 140, top: 1516, width: 960, height: 90 };
const KODE_BOX = { left: 220, top: 1790, width: 580, height: 60 };
const QR_BOX = { left: 951, top: 1685, width: 263, height: 263 };

function pxBoxToPdf(box, scaleX, scaleY, pageHeightPt) {
  const width = box.width * scaleX;
  const height = box.height * scaleY;
  const x = box.left * scaleX;
  const y = pageHeightPt - box.top * scaleY - height;
  return { x, y, width, height };
}

/**
 * @param {object} opts
 * @param {string} opts.nama
 * @param {string} opts.kodeUnik
 * @param {string|null} opts.fotoAbsolutePath - path absolut ke file foto di disk, atau null
 * @param {string} opts.verifikasiUrl - URL tujuan QR code
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateIdCardPdf({ nama, kodeUnik, fotoAbsolutePath, verifikasiUrl }) {
  const templateBytes = await readFile(TEMPLATE_PDF_PATH);

  const outDoc = await PDFDocument.create();
  const [embeddedTemplate] = await outDoc.embedPdf(templateBytes);
  const pageW = embeddedTemplate.width;
  const pageH = embeddedTemplate.height;
  const page = outDoc.addPage([pageW, pageH]);
  page.drawPage(embeddedTemplate, { x: 0, y: 0, width: pageW, height: pageH });

  const scaleX = pageW / RASTER_W;
  const scaleY = pageH / RASTER_H;

  if (fotoAbsolutePath) {
    // Background dihapus otomatis (AI lokal) biar foto nyatu sama desain.
    // Hasilnya di-cache di sebelah file asli supaya download berikutnya
    // untuk foto yang sama tidak perlu proses ulang.
    const cutoutPath = `${fotoAbsolutePath}.nobg.png`;
    let cutoutBuffer;
    if (existsSync(cutoutPath)) {
      cutoutBuffer = await readFile(cutoutPath);
    } else {
      const blob = await removeBackground(fotoAbsolutePath);
      cutoutBuffer = Buffer.from(await blob.arrayBuffer());
      await writeFile(cutoutPath, cutoutBuffer);
    }

    const fotoBuffer = await sharp(cutoutBuffer)
      .resize(PHOTO_BOX.width, PHOTO_BOX.height, { fit: 'cover', position: sharp.strategy.attention })
      .png()
      .toBuffer();
    const fotoImg = await outDoc.embedPng(fotoBuffer);
    page.drawImage(fotoImg, pxBoxToPdf(PHOTO_BOX, scaleX, scaleY, pageH));
  }

  const qrPad = 16;
  const qrPxSize = QR_BOX.width - qrPad;
  const qrBuffer = await QRCode.toBuffer(verifikasiUrl, {
    margin: 0,
    width: qrPxSize,
    color: { dark: '#0E2F6E', light: '#FFFFFF' },
  });
  const qrImg = await outDoc.embedPng(qrBuffer);
  const qrBox = { left: QR_BOX.left + qrPad / 2, top: QR_BOX.top + qrPad / 2, width: qrPxSize, height: qrPxSize };
  page.drawImage(qrImg, pxBoxToPdf(qrBox, scaleX, scaleY, pageH));

  const font = await outDoc.embedFont(StandardFonts.HelveticaBold);
  function drawCentered(text, box, maxFontSizePx, color) {
    const b = pxBoxToPdf(box, scaleX, scaleY, pageH);
    const maxWidth = b.width * 0.94;
    let fontSize = maxFontSizePx * scaleY;
    let textWidth = font.widthOfTextAtSize(text, fontSize);
    // Nama/kode bisa panjang — kecilkan font sampai muat, biar tidak
    // meluber keluar kartu, alih-alih pakai ukuran tetap.
    if (textWidth > maxWidth) {
      fontSize *= maxWidth / textWidth;
      textWidth = maxWidth;
    }
    page.drawText(text, {
      x: b.x + (b.width - textWidth) / 2,
      y: b.y + b.height / 2 - fontSize * 0.35,
      size: fontSize,
      font,
      color,
    });
  }

  drawCentered(String(nama).toUpperCase(), NAME_BOX, 56, rgb(0.078, 0.094, 0.122));
  drawCentered(kodeUnik, KODE_BOX, 40, rgb(1, 1, 1));

  return Buffer.from(await outDoc.save());
}
