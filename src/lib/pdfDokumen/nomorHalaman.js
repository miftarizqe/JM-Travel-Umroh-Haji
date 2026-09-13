// Stempel "Halaman N / Total" di pojok kanan bawah TIAP halaman PDF —
// pakai pdf-lib SETELAH react-pdf selesai render (bukan fitur `fixed +
// render` bawaan react-pdf). Dicoba fitur native-nya duluan
// (dikonfirmasi 2026-09-10): jalan normal kalau page break-nya MANUAL
// (`<Text break>`), tapi diam-diam GAK NGE-RENDER APA-APA (gak crash, tapi
// teksnya beneran gak ada di PDF-nya) begitu pagination-nya OTOMATIS dari
// overflow konten — persis skenario semua dokumen di sini (SPKA-Ins dkk
// bisa berapa halaman aja tergantung panjang isi pasal, gak pernah manual
// break). Sudah dites juga di react-pdf 4.9.0 (versi terbaru saat ini),
// bug yang sama masih ada — bukan salah versi. pdf-lib beroperasi di PDF
// yang udah JADI (jumlah halaman udah pasti), jadi gak kena masalah ini
// sama sekali.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function tambahNomorHalaman(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const pages = pdfDoc.getPages();
  const total = pages.length;
  const size = 7.5; // samain UKURAN_PDF.nomor (pdfStyles.js)

  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const teks = `Halaman ${i + 1} / ${total}`;
    const lebarTeks = font.widthOfTextAtSize(teks, size);
    page.drawText(teks, { x: width - 18 - lebarTeks, y: 12, size, font, color: rgb(0.6, 0.6, 0.6) });
  });

  return Buffer.from(await pdfDoc.save());
}
