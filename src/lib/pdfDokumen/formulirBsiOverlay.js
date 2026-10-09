// Isi otomatis PDF "Formulir Pendaftaran Rekening BSI" — form intake yang
// JM Travel kirim ke BSI buat minta dibukain rekening manual (dikonfirmasi
// user 2026-10-03, bagian dari alur "bantuan BSI manual" — lihat
// src/app/api/sahabat/bantuan-bsi-manual/route.js). 1 halaman, gak ada
// nomor surat resmi (bukan dokumen legal bermaterai, cuma data intake).
// Lihat pdfOverlay.js buat penjelasan pola & cara ukur ulang koordinat
// kalau template diganti.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { embedTemplatePages, tempelHalamanTemplate, drawFitKiri, drawFitCenter, drawAlamatWrap } from './pdfOverlay';

export const FORMULIR_BSI_TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/pdfDokumen/templates/formulir-bsi-template.pdf');

const FONT_SIZE_ISIAN = 11;
const P1 = {
  namaLengkap:          { x: 230, y: 632, maxWidth: 300 },
  nomorKtp:             { x: 230, y: 604, maxWidth: 300 },
  tempatTanggalLahir:   { x: 230, y: 577, maxWidth: 300 },
  jenisKelamin:         { x: 230, y: 549, maxWidth: 300 },
  namaIbuKandung:       { x: 230, y: 521, maxWidth: 300 },
  alamatKtpBaris1:      { x: 230, y: 494, maxWidth: 300 },
  alamatKtpBaris2:      { x: 230, y: 480, maxWidth: 300 },
  alamatDomisiliBaris1: { x: 230, y: 439, maxWidth: 300 },
  alamatDomisiliBaris2: { x: 230, y: 425, maxWidth: 300 },
  noWhatsapp:           { x: 230, y: 383, maxWidth: 300 },
  email:                { x: 230, y: 356, maxWidth: 300 },
  pekerjaan:            { x: 230, y: 328, maxWidth: 300 },
};
const P1_TANDA_TANGAN = {
  namaTtd: { center: 444, y: 91, maxWidth: 180 },
};

/**
 * @param {import('pdf-lib').PDFDocument} outDoc
 * @param {{namaLengkap:string, nomorKtp:string, tempatTanggalLahir:string, jenisKelamin:string, namaIbuKandung:string,
 *          alamatKtpBaris1:string, alamatKtpBaris2:string, alamatDomisiliBaris1:string, alamatDomisiliBaris2:string,
 *          noWhatsapp:string, email:string, pekerjaan:string, namaTtd:string}} data
 */
export async function tambahHalamanFormulirBsi(outDoc, data) {
  const [embed] = await embedTemplatePages(outDoc, FORMULIR_BSI_TEMPLATE_PATH, [0]);
  const font = await outDoc.embedFont(StandardFonts.TimesRoman);

  const page = tempelHalamanTemplate(outDoc, embed);
  drawFitKiri(page, font, data.namaLengkap, P1.namaLengkap, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, data.nomorKtp, P1.nomorKtp, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, data.tempatTanggalLahir, P1.tempatTanggalLahir, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, data.jenisKelamin, P1.jenisKelamin, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, data.namaIbuKandung, P1.namaIbuKandung, FONT_SIZE_ISIAN);
  // Direflow ke MAKS 3 baris berdasar lebar asli (dikonfirmasi user
  // 2026-10-09) -- ~55pt kosong di bawah tiap blok alamat sebelum field
  // berikutnya, aman buat 3 baris @14pt. Alamat Domisili SEBELUMNYA gak ada
  // komponen terpisah (1 string utuh, lihat buatPdfFormulirBsiUntukUser) jadi
  // sering ke-shrink drastis drawFitKiri buat muat di 1 baris -- sekarang
  // ikut direflow sama seperti Alamat KTP.
  drawAlamatWrap(page, font, [data.alamatKtpBaris1, data.alamatKtpBaris2].filter(Boolean).join(' '), P1.alamatKtpBaris1, FONT_SIZE_ISIAN, 3, 14);
  drawAlamatWrap(page, font, [data.alamatDomisiliBaris1, data.alamatDomisiliBaris2].filter(Boolean).join(' '), P1.alamatDomisiliBaris1, FONT_SIZE_ISIAN, 3, 14);
  drawFitKiri(page, font, data.noWhatsapp, P1.noWhatsapp, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, data.email, P1.email, FONT_SIZE_ISIAN);
  drawFitKiri(page, font, data.pekerjaan, P1.pekerjaan, FONT_SIZE_ISIAN);
  drawFitCenter(page, font, data.namaTtd, P1_TANDA_TANGAN.namaTtd, FONT_SIZE_ISIAN);
}

/** @returns {Promise<Buffer>} PDF Formulir BSI berdiri sendiri (1 halaman) */
export async function generateFormulirBsiPdf(data) {
  const outDoc = await PDFDocument.create();
  await tambahHalamanFormulirBsi(outDoc, data);
  return Buffer.from(await outDoc.save());
}
