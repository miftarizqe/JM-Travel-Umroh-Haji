// Isi otomatis PDF Surat Pernyataan Kuasa Blokir Rekening — sama persis
// pola skCifOverlay.js, lihat pdfOverlay.js buat penjelasan & cara ukur
// ulang koordinat kalau template diganti. 1 halaman doang (beda dari SK-CIF
// yang 2 halaman).
//
// Kolom TTD kanan ("Petugas Bank Syariah Indonesia") SENGAJA gak diisi
// otomatis — itu diisi petugas bank sendiri pas surat diproses di cabang,
// bukan data yang kita punya.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter } from './pdfOverlay';

export const SURAT_PEMBLOKIRAN_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/surat-pemblokiran-template.pdf');

// Template direvisi (2026-10-03) — Alamat sekarang 2 baris (baris 1: jalan/
// no rumah/RT-RW, baris 2: kelurahan/kecamatan/kota/provinsi), semua field
// di bawahnya geser turun 14pt. Diukur ulang via pdftotext -bbox. Baris
// "_______,________________" di atas TTD sekarang diisi tanggal juga
// (dikonfirmasi user 2026-10-03, sebelumnya selalu kosong).
const FONT_SIZE_ISIAN = 11;
const P1 = {
  nama:            { x: 210, y: 639, maxWidth: 350 },
  nik:             { x: 210, y: 625, maxWidth: 350 },
  alamatBaris1:    { x: 210, y: 611, maxWidth: 350 },
  alamatBaris2:    { x: 210, y: 597, maxWidth: 350 },
  noRekening:      { x: 210, y: 542, maxWidth: 350 },
  namaRekening:    { x: 210, y: 529, maxWidth: 350 },
  // Poin 1: "...BLOKIR SALDO rekening saya sejumlah Rp_____________,-"
  nominalBlokir1:  { x: 399, y: 474, maxWidth: 80 },
  // Poin 1 lanjutan: "Selama jangka waktu __________ hari, terhitung dari tanggal________________dengan tujuan"
  jangkaWaktuHari: { x: 166, y: 460, maxWidth: 66, indent: 4 },
  tanggalMulai:    { x: 358, y: 460, maxWidth: 98, indent: 4 },
  // Poin 2: "...sejumlah dana/uang sebesar Rp____________,- ada di rekening..." — nominal SAMA dengan poin 1.
  nominalBlokir2:  { x: 166, y: 405, maxWidth: 71 },
  tanggalTtd:      { x: 62, y: 197, maxWidth: 250 },
};

const FONT_SIZE_TTD = 10;
const P1_TANDA_TANGAN = {
  // ( ) kiri, di atas "Jamaah Sahabat Baitullah" — kanan (Petugas BSI) SENGAJA dikosongkan, lihat komentar atas file.
  pemberiPernyataan: { center: 139, y: 67, maxWidth: 130 },
};

/**
 * @param {import('pdf-lib').PDFDocument} outDoc
 * @param {{nama:string, nik:string, alamatBaris1:string, alamatBaris2:string, noRekening:string, nominalBlokir:string, jangkaWaktuHari:string, tanggalMulai:string, tanggalTtd:string}} data
 */
export async function tambahHalamanSuratPemblokiran(outDoc, { nama, nik, alamatBaris1, alamatBaris2, noRekening, nominalBlokir, jangkaWaktuHari, tanggalMulai, tanggalTtd }) {
  const [embed] = await embedTemplatePages(outDoc, SURAT_PEMBLOKIRAN_TEMPLATE_PATH, [0]);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  const page = tempelHalamanTemplate(outDoc, embed);
  drawFitKiri(page, font, nama, P1.nama, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, nik, P1.nik, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, alamatBaris1, P1.alamatBaris1, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, alamatBaris2, P1.alamatBaris2, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, noRekening, P1.noRekening, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, nama, P1.namaRekening, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, nominalBlokir, P1.nominalBlokir1, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, jangkaWaktuHari, P1.jangkaWaktuHari, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, tanggalMulai, P1.tanggalMulai, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, nominalBlokir, P1.nominalBlokir2, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, tanggalTtd, P1.tanggalTtd, FONT_SIZE_ISIAN);
  drawFitCenter(page, font, nama, P1_TANDA_TANGAN.pemberiPernyataan, FONT_SIZE_TTD);
}

/** @returns {Promise<Buffer>} PDF Surat Pemblokiran berdiri sendiri (1 halaman) */
export async function generateSuratPemblokiranPdf(data) {
  const outDoc = await PDFDocument.create();
  await tambahHalamanSuratPemblokiran(outDoc, data);
  return Buffer.from(await outDoc.save());
}
