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
//
// SPK-AK (Muslim) SEKARANG 2 RANGKAP FISIK (dikonfirmasi user 2026-10-03,
// gantiin skema 1-rangkap 2026-09-29 di atas) — 2 template PDF terpisah,
// beda cuma di sisi mana yang sudah ada tanda tangan+materai Management
// (Mei Ling, statis di template) vs sisi mana yang masih kosong nunggu
// materai+TTD jamaah:
//   - "rangkap jamaah" — materai & TTD JAMAAH yang diisi, rangkap ini
//     ujungnya DISIMPAN Management (lihat footer template "Rangkapan untuk
//     Management JM Travel").
//   - "rangkap management" — materai & TTD MANAGEMENT (Ahmad Zaky) yang
//     masih kosong nunggu diisi admin di kantor, rangkap ini ujungnya
//     DIKEMBALIKAN ke Jamaah (footer "Rangkapan untuk Jamaah Sahabat
//     Baitullah").
// Koordinat Pihak Kedua (identitas, nama TTD) SAMA PERSIS di kedua template
// (diverifikasi via pdftotext -bbox, cuma sisi Pihak Pertama yang beda),
// jadi 1 set KOORDINAT_RANGKAP dipakai buat keduanya, tinggal ganti
// templatePath. SPK-AK Non-Muslim BELUM dapat template 2-rangkap baru
// (nunggu dari user) — tetap pakai skema 1-rangkap lama di bawah.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter } from './pdfOverlay';

const SPK_AK_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spk-ak-template.pdf');
const SPK_AK_NONIS_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spk-ak-nonis-template.pdf');
const SPK_AK_RANGKAP_JAMAAH_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spk-ak-rangkap-jamaah-template.pdf');
const SPK_AK_RANGKAP_MANAGEMENT_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/spk-ak-rangkap-management-template.pdf');

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

// Koordinat buat 2 template rangkap (jamaah & management) — diukur presisi
// via `pdftotext -bbox` dari KEDUA file sekaligus (2026-10-03): identitas
// Pihak Kedua & blok TTD jamaah PERSIS SAMA di keduanya (cuma blok Pihak
// Pertama/materai yang beda posisi, gak ikut diisi dari sini), jadi 1 set
// koordinat ini dipakai buat dua-duanya. Dokumen 6 halaman (bukan 7 lagi —
// konten dipadatkan di template baru). Font 12 Times New Roman (dikonfirmasi
// user 2026-10-03, beda dari FONT_SIZE=11 template SPK-AK lama di atas).
//
// Template diupdate LAGI (2026-10-03 sore) — baris "Alamat" sekarang 2 baris
// (baris 1: jalan/no rumah/RT-RW, baris 2: kelurahan/kecamatan/kota/provinsi)
// biar alamat gak kepotong/numpuk. 1 baris kosong nambah di antara Alamat &
// No. Telepon di halaman 1 (nama/alamatBaris1 TIDAK geser, noTelepon/noPaspor
// geser turun 14pt), dan isi dokumen keseluruhan ikut geser turun ~27-28pt
// mulai halaman 3 (reflow dari baris baru itu). Diukur ulang pakai
// `pdftotext -bbox` lagi, bandingin posisi SEBELUM/SESUDAH tiap anchor teks
// statis (label field, kata "bulan"/"yang", "Jakarta,", garis tanda tangan)
// buat dapetin pergeserannya, BUKAN diukur dari nol.
const FONT_SIZE_RANGKAP = 12;
const KOORDINAT_RANGKAP = {
  jumlahHalaman: 6,
  p1: {
    nomor:     { x: 255, y: 669, maxWidth: 255 },
    hari:      { x: 142, y: 642, maxWidth: 64 },
    tanggal:   { x: 253, y: 642, maxWidth: 88 },
    nama:      { x: 190, y: 468, maxWidth: 334 },
    alamatBaris1: { x: 190, y: 454, maxWidth: 334 },
    alamatBaris2: { x: 190, y: 440, maxWidth: 334 },
    noTelepon: { x: 190, y: 426, maxWidth: 334 },
    noPaspor:  { x: 190, y: 412, maxWidth: 334 },
  },
  // PASAL 4 "Total biaya perjalanan umroh bulan ___ ... sebesar: Rp ___"
  // — halaman 3 (index 2), BARU di template rangkap ini (gak ada di SPK-AK
  // 1-rangkap lama di atas).
  p3: {
    // Blank-nya di ANTARA "bulan" (x≈266) dan "yang" (x≈374) — maxWidth
    // DIBATASI biar kotak penutup-blank gak nimpa teks statis "yang" di
    // belakangnya (bug nyata: maxWidth 128 dulu nimpa "yang" sampai hilang).
    targetBulanTahun: { x: 270, y: 110, maxWidth: 100 },
    nominalTarget:    { x: 190, y: 96, maxWidth: 334 },
  },
  p6: {
    tanggalPenutup: { x: 113, y: 572, maxWidth: 300 },
    namaTtd: { center: 298, y: 235, maxWidth: 180 },
  },
};
const SPK_AK_RANGKAP_TEMPLATE_PATH = {
  jamaah: SPK_AK_RANGKAP_JAMAAH_TEMPLATE_PATH,
  management: SPK_AK_RANGKAP_MANAGEMENT_TEMPLATE_PATH,
};

/**
 * @param {'jamaah'|'management'} rangkap
 * @param {object} data
 * @param {string} data.nomor
 * @param {string} data.nama
 * @param {string} data.alamatBaris1 - jalan/no rumah/RT-RW (mis. "Jl. Contoh No. 5, RT 001/RW 002")
 * @param {string} data.alamatBaris2 - kelurahan/kecamatan/kota/provinsi (mis. "Kel. A, Kec. B, Kota C, Provinsi D.")
 * @param {string} data.noTelepon
 * @param {string} data.noPaspor
 * @param {string} data.namaTtd - dicetak kecil di atas garis tanda tangan Pihak Kedua
 * @param {string} data.hari - nama hari Indonesia (mis. "Senin")
 * @param {string} data.tanggal - tanggal lengkap Indonesia (mis. "3 Oktober 2026")
 * @param {string} data.targetBulanTahun - bulan+tahun target program (mis. "Januari 2027")
 * @param {string} data.nominalTarget - nominal target program, sudah diformat (mis. "39.500.000")
 * @returns {Promise<Buffer>}
 */
export async function generateSpkAkRangkapPdf(rangkap, { nomor, nama, alamatBaris1, alamatBaris2, noTelepon, noPaspor, namaTtd, hari, tanggal, targetBulanTahun, nominalTarget }) {
  const templatePath = SPK_AK_RANGKAP_TEMPLATE_PATH[rangkap];
  if (!templatePath) throw new Error(`Rangkap SPK-AK tidak dikenal: "${rangkap}"`);
  const k = KOORDINAT_RANGKAP;

  const outDoc = await PDFDocument.create();
  const pageIndices = Array.from({ length: k.jumlahHalaman }, (_, i) => i);
  const embedded = await embedTemplatePages(outDoc, templatePath, pageIndices);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  embedded.forEach((emb, i) => {
    const page = tempelHalamanTemplate(outDoc, emb);
    if (i === 0) {
      drawFitKiri(page, font, nomor, k.p1.nomor, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, hari, k.p1.hari, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, tanggal, k.p1.tanggal, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, nama, k.p1.nama, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, alamatBaris1, k.p1.alamatBaris1, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, alamatBaris2, k.p1.alamatBaris2, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, noTelepon, k.p1.noTelepon, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, noPaspor, k.p1.noPaspor, FONT_SIZE_RANGKAP);
    }
    if (i === 2) {
      drawFitKiri(page, font, targetBulanTahun, k.p3.targetBulanTahun, FONT_SIZE_RANGKAP);
      drawFitKiri(page, font, nominalTarget, k.p3.nominalTarget, FONT_SIZE_RANGKAP);
    }
    if (i === k.jumlahHalaman - 1) {
      drawFitKiri(page, font, tanggal, k.p6.tanggalPenutup, FONT_SIZE_RANGKAP);
      drawFitCenter(page, font, namaTtd, k.p6.namaTtd, FONT_SIZE_RANGKAP);
    }
  });

  return Buffer.from(await outDoc.save());
}

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
