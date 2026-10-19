// Isi otomatis PDF Surat Perjanjian Kerjasama Perwakilan (SPKA-Ins) dengan
// cara nempel teks di atas template PDF final — lihat pdfOverlay.js buat
// penjelasan pola & cara ukur ulang koordinat kalau template diganti.
//
// 2 RANGKAP FISIK (dikonfirmasi user 2026-10-18, mirror skema rangkap
// SPK-AK di spkAkOverlay.js) — 2 template PDF terpisah, beda cuma di
// footer ("Rangkapan untuk Management" vs "Rangkapan untuk Perwakilan").
// Diverifikasi via pdftotext -bbox: SELURUH posisi field (Nomor, Pihak
// Kedua, rekening ujroh, tanggal penutup) IDENTIK di kedua file — cuma
// footer yang beda — jadi 1 set KOORDINAT dipakai buat keduanya, tinggal
// ganti templatePath.
//
// Tanda tangan PIHAK PERTAMA (Ahmad Zaky Arief Bestary) SUDAH statis di
// template (dicetak), TIDAK diisi dari sini. Materai + TTD PIHAK KEDUA
// (Perwakilan) tetap fisik, tapi nama perwakilan dicetak kecil di atas
// garis TTD-nya (mirror `namaTtd` SPK-AK, dikonfirmasi user 2026-10-18).
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter, drawAlamatWrap } from './pdfOverlay';

const TEMPLATE_PATH = {
  management: path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spka-ins-rangkap-management-template.pdf'),
  perwakilan: path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spka-ins-rangkap-perwakilan-template.pdf'),
};

const FONT_SIZE = 11;

// Koordinat diukur presisi via `pdftotext -bbox` dari kedua file template
// (2026-10-18) — lihat komentar di atas soal kenapa 1 set koordinat cukup
// buat dua-duanya.
const KOORDINAT = {
  jumlahHalaman: 7,
  p1: {
    // atasExtra 5.2 (bukan 6) -- judul "...PERWAKILAN" cuma berjarak ~0.4pt
    // dari placeholder Nomor di bawahnya (diukur pdftotext -bbox), atasExtra
    // 6 kepotong nabrak judul (ketemu pas benerin bug sama di spk_ak rangkap,
    // 2026-10-18). 5.2 pas di tengah window aman [696.33, 696.73] bottom-up.
    nomor:      { x: 255, y: 683, maxWidth: 250, atasExtra: 5.2 },
    // y=655 (BUKAN digeser) -- sempat dicoba +3 (2026-10-18) based on dugaan
    // baseline meleset, TERNYATA diukur ulang baseline-nya udah pas (~0.8pt
    // doang bedanya dari teks statis) -- kesan "ngambang"-nya dari MISMATCH
    // FONT (template pakai TrueType Times New Roman asli, overlay pakai
    // StandardFonts.TimesRoman pdf-lib yang beda metric/x-height), bukan soal
    // posisi y. Geser y JUSTRU bikin baseline meleset ke arah SEBALIKNYA
    // (ketahuan dari pdftotext -bbox). Fix bener butuh embed font yang sama
    // persis (lihat follow-up soal font-embedding) -- revert ke posisi semula
    // dulu sambil nunggu itu.
    hari:       { x: 140, y: 655, maxWidth: 65 },
    tanggal:    { x: 253, y: 655, maxWidth: 90 },
    nama:       { x: 190, y: 476, maxWidth: 330 },
    nik:        { x: 190, y: 462, maxWidth: 330 },
    alamatBaris1: { x: 190, y: 448, maxWidth: 330 },
    alamatBaris2: { x: 190, y: 434, maxWidth: 330 },
    noTelepon:  { x: 190, y: 404, maxWidth: 330 },
  },
  // PASAL 5 ayat 5 — rekening ujroh Perwakilan.
  p3: {
    namaBank:   { x: 225, y: 101, maxWidth: 300 },
    noRekening: { x: 225, y: 87, maxWidth: 300 },
    atasNama:   { x: 225, y: 73, maxWidth: 300 },
  },
  p7: {
    tanggalPenutup: { x: 115, y: 280, maxWidth: 200 },
    // Garis TTD Pihak Kedua: xMin 348.88-534.88, yMin 699.948 (pdftotext
    // -bbox, sama persis di kedua template rangkap) -> bottom-up tepi atas
    // garis = 841.8-699.948 = 141.852. y=144.5 nempel ~2.6pt di atasnya,
    // center = titik tengah garis (348.88+534.88)/2.
    namaTtd: { center: 441.88, y: 144.5, maxWidth: 180 },
  },
};

/**
 * @param {'management'|'perwakilan'} rangkap
 * @param {object} data
 * @param {string} data.nomor
 * @param {string} data.hari - nama hari Indonesia (mis. "Senin")
 * @param {string} data.tanggal - tanggal lengkap Indonesia (mis. "18 Oktober 2026")
 * @param {string} data.nama
 * @param {string} data.nik
 * @param {string} data.alamatBaris1
 * @param {string} data.alamatBaris2 - opsional, baris ke-2 alamat kalau kepanjangan
 * @param {string} data.noTelepon
 * @param {string} data.namaBank
 * @param {string} data.noRekening
 * @param {string} data.atasNama
 * @param {string} data.namaTtd - dicetak kecil di atas garis tanda tangan Pihak Kedua
 * @returns {Promise<Buffer>}
 */
export async function generateSpkaInsRangkapPdf(rangkap, {
  nomor, hari, tanggal, nama, nik, alamatBaris1, alamatBaris2, noTelepon, namaBank, noRekening, atasNama, namaTtd,
}) {
  const templatePath = TEMPLATE_PATH[rangkap];
  if (!templatePath) throw new Error(`Rangkap SPKA-Ins tidak dikenal: "${rangkap}"`);
  const k = KOORDINAT;

  const outDoc = await PDFDocument.create();
  const pageIndices = Array.from({ length: k.jumlahHalaman }, (_, i) => i);
  const embedded = await embedTemplatePages(outDoc, templatePath, pageIndices);
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
      drawFitKiri(page, font, noTelepon, k.p1.noTelepon, FONT_SIZE);
    }
    if (i === 2) {
      drawFitKiri(page, font, namaBank, k.p3.namaBank, FONT_SIZE);
      drawFitKiri(page, font, noRekening, k.p3.noRekening, FONT_SIZE);
      drawFitKiri(page, font, atasNama, k.p3.atasNama, FONT_SIZE);
    }
    if (i === k.jumlahHalaman - 1) {
      drawFitKiri(page, font, tanggal, k.p7.tanggalPenutup, FONT_SIZE);
      drawFitCenter(page, font, namaTtd, k.p7.namaTtd, FONT_SIZE);
    }
  });

  return Buffer.from(await outDoc.save());
}
