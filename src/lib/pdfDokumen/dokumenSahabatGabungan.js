// Gabungan SK-CIF (2 halaman) + Surat Pemblokiran (1 halaman) jadi SATU
// file PDF — dikonfirmasi user 2026-09-28, samain sama alur fisiknya (dua
// surat ini emang dicetak/ditandatangani/di-materai bareng, lihat tombol
// "Print Kedua Surat" yang sudah ada).
import { PDFDocument } from 'pdf-lib';
import { tambahHalamanSkCif } from './skCifOverlay';
import { tambahHalamanSuratPemblokiran } from './suratPemblokiranOverlay';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';
import { formatAlamatDuaBaris } from './alamatDuaBaris';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function tglIndo(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

const errStatus = (message, status) => Object.assign(new Error(message), { status });

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

// PDF SK-CIF + Surat Pemblokiran resmi (identitas terisi) milik 1 anggota
// Sahabat Baitullah — diekstrak dari /api/sahabat/dokumen-legal/pdf-otomatis
// (dikonfirmasi user 2026-10-02) biar bisa dipakai ULANG juga oleh
// /api/sahabat/dokumen-legal/unduh-lengkap (gabungan SPK-AK + SK-CIF +
// Surat Pemblokiran jadi 1 file, lihat mergePdfBuffers di bawah), sama pola
// dengan buatPdfSpkAkUntukUser di spkAkUntukUser.js.
export async function buatPdfSkCifPemblokiranUntukUser(pool, userId) {
  const [[user]] = await pool.query(
    `SELECT id, name, nik, alamat, alamat_ktp, role, no_rekening_tabungan_umroh,
            nominal_blokir_tabungan, jangka_waktu_blokir_hari, tanggal_mulai_blokir,
            alamat_ktp_jalan, alamat_ktp_no_rumah, alamat_ktp_rt, alamat_ktp_rw,
            alamat_ktp_kelurahan, alamat_ktp_kecamatan, alamat_ktp_kota, alamat_ktp_provinsi, alamat_ktp_negara
     FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) throw errStatus('Akun tidak ditemukan', 404);
  if (user.role !== 'sahabat_baitullah') throw errStatus('Hanya berlaku untuk akun sahabat', 400);
  if (!user.no_rekening_tabungan_umroh) throw errStatus('Isi nomor rekening tabungan umroh terlebih dahulu', 400);
  if (!user.nominal_blokir_tabungan || !user.jangka_waktu_blokir_hari || !user.tanggal_mulai_blokir) {
    throw errStatus('Isi nominal, jangka waktu, dan tanggal mulai blokir terlebih dahulu', 400);
  }
  const { alamatBaris1, alamatBaris2 } = formatAlamatDuaBaris(user);
  // Baris "_______,________________" di atas TTD -- sebelumnya selalu kosong
  // (dikonfirmasi user 2026-10-03, sekarang diisi tanggal cetak).
  const tanggalTtd = `Jakarta, ${tglIndo(new Date())}`;

  // Freeze pasal/signer (idempotent) tetap dijalankan biar konsisten sama
  // GET /api/sahabat/sk-cif — nama Penerima Kuasa yang dicetak di sini
  // ngikut versi yang sama yang udah/bakal dibekukan buat user ini.
  await pastikanSnapshot(pool, user.id, 'sk_cif');
  const { signer } = await ambilPasalUntukCetak('sk_cif', user.id);

  return generateDokumenGabunganPdf({
    skCif: {
      nama: user.name,
      nik: user.nik || '-',
      alamatBaris1, alamatBaris2,
      noRekening: user.no_rekening_tabungan_umroh || '-',
      namaWakil: signer?.nama || '-',
      tanggalTtd,
    },
    pemblokiran: {
      nama: user.name,
      nik: user.nik || '-',
      alamatBaris1, alamatBaris2,
      noRekening: user.no_rekening_tabungan_umroh || '-',
      nominalBlokir: Number(user.nominal_blokir_tabungan).toLocaleString('id-ID'),
      jangkaWaktuHari: String(user.jangka_waktu_blokir_hari),
      tanggalMulai: tglIndo(new Date(user.tanggal_mulai_blokir)),
      tanggalTtd,
    },
  });
}

// Satuin beberapa buffer PDF yang sudah jadi (masing-masing hasil generator
// lain, mis. SPK-AK + SK-CIF/Pemblokiran) jadi SATU file PDF berurutan —
// dipakai /api/sahabat/dokumen-legal/unduh-lengkap biar ketiga dokumen bisa
// dibaca/diunduh dari 1 tempat (dikonfirmasi user 2026-10-02).
export async function mergePdfBuffers(buffers) {
  const outDoc = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await outDoc.copyPages(src, src.getPageIndices());
    pages.forEach(p => outDoc.addPage(p));
  }
  return Buffer.from(await outDoc.save());
}
