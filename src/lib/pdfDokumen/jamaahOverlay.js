// Isi otomatis PDF Surat Perjanjian Jamaah Umroh (SPJ) dengan cara nempel
// teks di atas template PDF final — lihat pdfOverlay.js buat penjelasan
// pola & cara ukur ulang koordinat kalau template diganti.
//
// 1 LEMBAR PER JAMAAH (dikonfirmasi user 2026-10-13, lihat komentar di
// admin/cetak-perjanjian/[booking_id]/page.jsx) -- booking dengan >1 jamaah
// aktif digabung jadi 1 PDF multi-lembar lewat mergePdfBuffers di
// jamaahUntukBooking.js, BUKAN di sini. Fungsi ini SELALU 1 jamaah/1 panggilan.
//
// Gak ada rangkap (beda dari SPK-AK/SPKA-Ins) -- 1 template aja. Tanda
// tangan PIHAK PERTAMA (Ahmad Zaky) SUDAH statis di halaman terakhir
// template, TIDAK diisi dari sini. Tanggal penutup "Jakarta, ___" di
// halaman terakhir SENGAJA DIKOSONGIN (dikonfirmasi user 2026-10-18) --
// beda dari SPK-AK/SPKA-Ins yang nge-print tanggal yang sama di situ.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter, drawAlamatWrap } from './pdfOverlay';

const TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/jamaah-template.pdf');

const FONT_SIZE = 11;

// Koordinat diukur presisi via `pdftotext -bbox` (2026-10-18).
const KOORDINAT = {
  jumlahHalaman: 3,
  p1: {
    // atasExtra: placeholder template "Nomor: 0000xx.09/JMT-JSB/2026" BENERAN
    // dicetak, judul "...UMROH" cuma berjarak ~0.4pt dari placeholder-nya --
    // sama persis kasus SPKA-Ins/SPK-AK rangkap, atasExtra pas di tengah
    // window aman biar nutup placeholder tanpa nimpa judul.
    nomor:      { x: 255, y: 683, maxWidth: 250, atasExtra: 5.2 },
    hari:       { x: 140, y: 655, maxWidth: 65 },
    tanggal:    { x: 253, y: 655, maxWidth: 90 },
    nama:       { x: 190, y: 476, maxWidth: 330 },
    nik:        { x: 190, y: 462, maxWidth: 330 },
    alamatBaris1: { x: 190, y: 448, maxWidth: 330 },
    alamatBaris2: { x: 190, y: 434, maxWidth: 330 },
    noPaspor:   { x: 190, y: 421, maxWidth: 330 },
    noTelepon:  { x: 190, y: 407, maxWidth: 330 },
    // PASAL 2 -- Program Pilihan / Total Biaya / Uang Muka (DP).
    programPilihan: { x: 180, y: 131, maxWidth: 340 },
    totalBiaya:     { x: 452, y: 117, maxWidth: 68 },
    // DP sengaja dikosongin kalau booking gak punya DP (Program Sahabat
    // Baitullah Eksklusif checkout langsung lunas, gak ada tahap DP
    // terpisah -- dikonfirmasi user 2026-10-18, lihat jamaahUntukBooking.js).
    dp:             { x: 336, y: 103, maxWidth: 78 },
  },
  p3: {
    // Garis TTD Pihak Kedua (halaman penutup): xMin 348.88-534.88, yMin
    // 752.028 (pdftotext -bbox) -> bottom-up tepi atas garis = 841.8-752.028
    // = 89.772. y=92.5 nempel ~2.7pt di atasnya, center = titik tengah garis.
    namaTtd: { center: 441.88, y: 92.5, maxWidth: 180 },
  },
};

/**
 * @param {object} data
 * @param {string} data.nomor
 * @param {string} data.hari
 * @param {string} data.tanggal
 * @param {string} data.nama
 * @param {string} data.nik
 * @param {string} data.alamatBaris1
 * @param {string} data.alamatBaris2 - opsional
 * @param {string} data.noPaspor
 * @param {string} data.noTelepon
 * @param {string} data.programPilihan
 * @param {string} data.totalBiaya - sudah diformat, mis. "39.500.000"
 * @param {string} [data.dp] - sudah diformat; kosong/undefined kalau booking gak ada DP
 * @param {string} data.namaTtd - dicetak kecil di atas garis tanda tangan Pihak Kedua (jamaah, atau "Nama (diwakili Wali...)" kalau di bawah umur)
 * @returns {Promise<Buffer>}
 */
export async function generateJamaahPdf({
  nomor, hari, tanggal, nama, nik, alamatBaris1, alamatBaris2, noPaspor, noTelepon,
  programPilihan, totalBiaya, dp, namaTtd,
}) {
  const k = KOORDINAT;
  const outDoc = await PDFDocument.create();
  const pageIndices = Array.from({ length: k.jumlahHalaman }, (_, i) => i);
  const embedded = await embedTemplatePages(outDoc, TEMPLATE_PATH, pageIndices);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  embedded.forEach((emb, i) => {
    const page = tempelHalamanTemplate(outDoc, emb);
    if (i === 0) {
      drawFitKiri(page, font, nomor, k.p1.nomor, FONT_SIZE);
      drawFitKiri(page, font, hari, k.p1.hari, FONT_SIZE);
      drawFitKiri(page, font, tanggal, k.p1.tanggal, FONT_SIZE);
      drawFitKiri(page, font, nama, k.p1.nama, FONT_SIZE);
      drawFitKiri(page, font, nik, k.p1.nik, FONT_SIZE);
      drawAlamatWrap(page, font, [alamatBaris1, alamatBaris2].filter(Boolean).join(' '), k.p1.alamatBaris1, FONT_SIZE, 2, 14);
      drawFitKiri(page, font, noPaspor, k.p1.noPaspor, FONT_SIZE);
      drawFitKiri(page, font, noTelepon, k.p1.noTelepon, FONT_SIZE);
      drawFitKiri(page, font, programPilihan, k.p1.programPilihan, FONT_SIZE);
      drawFitKiri(page, font, totalBiaya, k.p1.totalBiaya, FONT_SIZE);
      if (dp) drawFitKiri(page, font, dp, k.p1.dp, FONT_SIZE);
    }
    // Halaman terakhir (penutup): "Jakarta, ___" SENGAJA dikosongin
    // (dikonfirmasi user 2026-10-18), TTD Pihak Pertama statis -- cuma nama
    // Pihak Kedua yang dicetak, di atas garis TTD-nya (dikonfirmasi user
    // 2026-10-18, mirror SPKA-Ins).
    if (i === k.jumlahHalaman - 1) {
      drawFitCenter(page, font, namaTtd, k.p3.namaTtd, FONT_SIZE);
    }
  });

  return Buffer.from(await outDoc.save());
}
