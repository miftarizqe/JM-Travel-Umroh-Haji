// Tambah halaman baru di AKHIR sebuah PDF berisi sertifikat/keterangan
// (materai digital ATAU tanda tangan elektronik). Ini pola yang sama dipakai
// provider e-meterai/e-signature asli di Indonesia (Peruri, Privy, dst) —
// bukti ditempel di halaman lampiran terpisah, bukan dipaksa presisi di
// posisi placeholder dokumen asli (yang koordinatnya gak bisa dihitung
// pasti dari hasil layout otomatis react-pdf).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

const A4 = [595.28, 841.89];

export async function tambahLampiranSertifikat(pdfBuffer, { judul, baris, verifikasiUrl }) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const page = pdfDoc.addPage(A4);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 780;
  page.drawText(judul, { x: 50, y, size: 14, font: fontBold, color: rgb(0.06, 0.18, 0.43) });
  y -= 12;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.06, 0.18, 0.43) });
  y -= 26;

  for (const [label, value] of baris) {
    page.drawText(label, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(String(value ?? '-'), { x: 200, y, size: 10, font: fontBold });
    y -= 18;
  }

  if (verifikasiUrl) {
    y -= 20;
    const qrBuffer = await QRCode.toBuffer(verifikasiUrl, { margin: 0, width: 120, color: { dark: '#0E2F6E', light: '#FFFFFF' } });
    const qrImg = await pdfDoc.embedPng(qrBuffer);
    page.drawImage(qrImg, { x: 50, y: y - 120, width: 120, height: 120 });
    page.drawText('Pindai untuk verifikasi', { x: 50, y: y - 134, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }

  return Buffer.from(await pdfDoc.save());
}
