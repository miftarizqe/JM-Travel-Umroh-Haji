// Gabungan SK-CIF (2 halaman) + Surat Pemblokiran (1 halaman) jadi SATU
// file PDF — dikonfirmasi user 2026-09-28, samain sama alur fisiknya (dua
// surat ini emang dicetak/ditandatangani/di-materai bareng, lihat tombol
// "Print Kedua Surat" yang sudah ada).
import { PDFDocument } from 'pdf-lib';
import { tambahHalamanSkCif } from './skCifOverlay';
import { tambahHalamanSuratPemblokiran } from './suratPemblokiranOverlay';

/**
 * @param {object} data
 * @param {{nama:string, nik:string, alamat:string, noRekening:string, namaWakil:string}} data.skCif
 * @param {{nama:string, nik:string, alamat:string, noRekening:string, nominalBlokir:string, jangkaWaktuHari:string, tanggalMulai:string}} data.pemblokiran
 * @returns {Promise<Buffer>}
 */
export async function generateDokumenGabunganPdf({ skCif, pemblokiran }) {
  const outDoc = await PDFDocument.create();
  await tambahHalamanSkCif(outDoc, skCif);
  await tambahHalamanSuratPemblokiran(outDoc, pemblokiran);
  return Buffer.from(await outDoc.save());
}
