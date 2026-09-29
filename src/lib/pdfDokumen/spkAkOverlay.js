// Isi otomatis PDF SPK-AK / SPK-AK Non-Muslim (identitas jamaah/agen +
// nomor surat + tanggal) dengan cara nempel teks di atas 1 file PDF
// template FINAL per dokumen — lihat pdfOverlay.js buat penjelasan pola &
// cara ukur ulang koordinat kalau template diganti.
//
// Beda dari SK-CIF: dokumen ini 7 halaman (bukan 1-2), dan tanda tangan
// Pihak Pertama (Ahmad Zaky + Mei Ling) SUDAH statis di halaman terakhir
// template — TIDAK diisi dari sini (dikonfirmasi user 2026-09-29). Yang
// diisi otomatis cuma identitas Pihak Kedua (Jamaah/Agen) di halaman 1 +
// nama Pihak Kedua tercetak kecil di atas garis tanda tangannya sendiri di
// halaman terakhir (tanda tangan aslinya tetap lewat sesi TTD digital
// beneran, bukan digantikan).
//
// Tanggal "Pada hari ini, ..." DIISI OTOMATIS (beda dari SK-CIF yang
// dikosongin) — dikonfirmasi user, karena proses ini digital (gak ada tahap
// cetak+tulis-tangan buat ngisinya nanti).
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter } from './pdfOverlay';

const SPK_AK_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spk-ak-template.pdf');
const SPK_AK_NONIS_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spk-ak-nonis-template.pdf');

const FONT_SIZE = 11;
const FONT_SIZE_TTD = 10;

// Koordinat diukur presisi dari 2 PDF final BERBEDA (JAMAAH utk Muslim, AGEN
// utk Non-Muslim) via `pdftotext -bbox` — walau strukturnya mirip, isi
// teksnya beda panjang jadi posisinya TIDAK SAMA, diukur terpisah masing2.
// Kalau salah satu template diedit ulang, ukur ulang HANYA bagian itu.
const KOORDINAT = {
  spk_ak: {
    templatePath: SPK_AK_TEMPLATE_PATH,
    jumlahHalaman: 7,
    p1: {
      nomor:     { x: 256, y: 661, maxWidth: 128 },
      hari:      { x: 142, y: 610, maxWidth: 58 },
      tanggal:   { x: 242, y: 610, maxWidth: 104 },
      // nama/alamat dikasih ruang lebih lega (sampai dekat margin kanan
      // halaman) — nama panjang/alamat panjang jangan sampai kekecilan
      // fontnya cuma gara2 lebar kolom placeholder aslinya sempit.
      nama:      { x: 151, y: 396, maxWidth: 350 },
      alamat:    { x: 151, y: 379, maxWidth: 350 },
      noTelepon: { x: 151, y: 362, maxWidth: 137 },
      noPaspor:  { x: 151, y: 344, maxWidth: 137 },
    },
    p7: {
      tanggalPenutup: { x: 113, y: 454, maxWidth: 134 },
      namaTtd: { center: 298, y: 71, maxWidth: 180 },
    },
  },
  spk_ak_nonis: {
    templatePath: SPK_AK_NONIS_TEMPLATE_PATH,
    jumlahHalaman: 7,
    p1: {
      nomor:     { x: 254, y: 668, maxWidth: 133 },
      hari:      { x: 140, y: 625, maxWidth: 61 },
      tanggal:   { x: 240, y: 625, maxWidth: 108 },
      nama:      { x: 151, y: 451, maxWidth: 350 },
      alamat:    { x: 151, y: 437, maxWidth: 350 },
      noTelepon: { x: 151, y: 422, maxWidth: 142 },
      noPaspor:  { x: 151, y: 407, maxWidth: 142 },
    },
    p7: {
      tanggalPenutup: { x: 118, y: 566, maxWidth: 138 },
      namaTtd: { center: 298, y: 206, maxWidth: 180 },
    },
  },
};

/**
 * @param {object} data
 * @param {'spk_ak'|'spk_ak_nonis'} data.dokumen
 * @param {string} data.nomor
 * @param {string} data.nama
 * @param {string} data.alamat
 * @param {string} data.noTelepon
 * @param {string} data.noPaspor
 * @param {string} data.namaTtd - dicetak kecil di atas garis tanda tangan Pihak Kedua
 * @param {string} data.hari - nama hari Indonesia (mis. "Senin")
 * @param {string} data.tanggal - tanggal lengkap Indonesia (mis. "29 September 2026")
 * @returns {Promise<Buffer>}
 */
export async function generateSpkAkPdf({ dokumen, nomor, nama, alamat, noTelepon, noPaspor, namaTtd, hari, tanggal }) {
  const k = KOORDINAT[dokumen];
  if (!k) throw new Error(`Koordinat SPK-AK belum diukur buat dokumen "${dokumen}"`);

  const outDoc = await PDFDocument.create();
  const pageIndices = Array.from({ length: k.jumlahHalaman }, (_, i) => i);
  const embedded = await embedTemplatePages(outDoc, k.templatePath, pageIndices);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  embedded.forEach((emb, i) => {
    const page = tempelHalamanTemplate(outDoc, emb);
    if (i === 0) {
      drawFitKiri(page, font, nomor, k.p1.nomor, FONT_SIZE);
      drawFitKiri(page, font, hari, k.p1.hari, FONT_SIZE);
      drawFitKiri(page, font, tanggal, k.p1.tanggal, FONT_SIZE);
      drawFitKiri(page, font, nama, k.p1.nama, FONT_SIZE);
      drawFitKiri(page, font, alamat, k.p1.alamat, FONT_SIZE);
      drawFitKiri(page, font, noTelepon, k.p1.noTelepon, FONT_SIZE);
      drawFitKiri(page, font, noPaspor, k.p1.noPaspor, FONT_SIZE);
    }
    if (i === k.jumlahHalaman - 1) {
      drawFitKiri(page, font, tanggal, k.p7.tanggalPenutup, FONT_SIZE);
      drawFitCenter(page, font, namaTtd, k.p7.namaTtd, FONT_SIZE_TTD);
    }
  });

  return Buffer.from(await outDoc.save());
}
