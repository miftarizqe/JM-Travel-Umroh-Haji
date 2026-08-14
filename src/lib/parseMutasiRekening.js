import { PDFParse } from 'pdf-parse';
import path from 'path';
import { pathToFileURL } from 'url';

// Next.js/Turbopack ngebundling kode server ke .next/dev/server/chunks/, jadi
// auto-detect lokasi pdf.worker.mjs bawaan pdf-parse (yang normalnya jalan
// kalau dipanggil dari Node biasa) jadi salah nunjuk & error "Setting up fake
// worker failed". Set manual ke path asli di node_modules (pakai
// process.cwd(), BUKAN import.meta.url, biar gak ikut ke-mangle bundler).
PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), 'node_modules', 'pdf-parse', 'dist', 'worker', 'pdf.worker.mjs')).href);

// Dikalibrasi ke contoh nyata: OCTO by CIMB Niaga "Statement of Account"
// (CASA_Statement_*.pdf). Struktur teks hasil ekstraksi PDF-nya per transaksi
// itu MULTI-BARIS, bukan satu baris rapi per kolom:
//   01 Jul 2026              <- tanggal (baris sendiri)
//   03:10:54                 <- jam (baris sendiri, diabaikan)
//   DEBIT CARD CHARGES       <- deskripsi (1 baris atau lebih)
//   Debit Card Charges for
//   557692******6139
//   -5,000.00 101,360.23     <- nominal transaksi + saldo berjalan (baris ini
//                                menutup 1 record; kadang nominal+saldo ini
//                                nempel di baris deskripsi terakhir kalau
//                                deskripsinya cuma 1 baris pendek)
// Nominal pakai format INTERNASIONAL (koma=ribuan, titik=desimal), BUKAN
// format Indonesia — tanda minus di depan angka = debit (out), tanpa minus =
// kredit (in). Ini beda bank/beda export bisa beda format lagi, makanya
// parseAngka() di bawah deteksi otomatis dari posisi pemisah terakhir.

const BULAN_ID = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

const RE_TANGGAL_BARIS = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/;
const RE_JAM_BARIS = /^\d{1,2}:\d{2}:\d{2}$/;
// Nominal transaksi (boleh minus) + spasi + saldo berjalan, di UJUNG baris
const RE_AKHIR_RECORD = /(-?[\d.,]*\d)\s+([\d.,]*\d)\s*$/;

function parseTanggal(hari, namaBulan, tahun) {
  const bln = BULAN_ID[namaBulan.slice(0, 3).toLowerCase()];
  if (!bln) return null;
  return `${tahun}-${String(bln).padStart(2, '0')}-${hari.padStart(2, '0')}`;
}

// Deteksi otomatis format angka (Indonesia: titik=ribuan,koma=desimal VS
// internasional: koma=ribuan,titik=desimal) dari posisi pemisah TERAKHIR
// dalam string — pemisah yang muncul paling akhir selalu yang desimal.
function parseAngka(str) {
  if (str == null) return 0;
  let s = String(str).trim();
  if (!s || s === '-') return 0;
  const negatif = s.startsWith('-');
  s = s.replace(/^-/, '');
  const idxTitik = s.lastIndexOf('.');
  const idxKoma = s.lastIndexOf(',');
  let angka;
  if (idxKoma > idxTitik) {
    // format ID: 1.234.567,00
    angka = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  } else if (idxTitik > idxKoma) {
    // format internasional: 1,234,567.00
    angka = parseFloat(s.replace(/,/g, ''));
  } else {
    angka = parseFloat(s.replace(/[.,]/g, ''));
  }
  return Math.round((negatif ? -1 : 1) * (angka || 0));
}

// Parser utama: baca record multi-baris (lihat komentar di atas file).
function ubahTeksJadiBaris(teks) {
  const baris = [];
  let tanggalAktif = null;
  let deskripsiBuffer = [];

  function batalkanRecord() {
    tanggalAktif = null;
    deskripsiBuffer = [];
  }

  for (const lineMentah of teks.split('\n')) {
    const line = lineMentah.trim();
    if (!line) continue;

    const cocokTanggal = line.match(RE_TANGGAL_BARIS);
    if (cocokTanggal) {
      const t = parseTanggal(cocokTanggal[1], cocokTanggal[2], cocokTanggal[3]);
      if (t) { tanggalAktif = t; deskripsiBuffer = []; continue; }
    }

    if (!tanggalAktif) continue; // belum ketemu tanggal baris pembuka record, abaikan (header/footer/dll)
    if (RE_JAM_BARIS.test(line)) continue; // baris jam, gak perlu

    const cocokAkhir = line.match(RE_AKHIR_RECORD);
    if (cocokAkhir) {
      const teksSebelum = line.slice(0, cocokAkhir.index).trim();
      if (teksSebelum) deskripsiBuffer.push(teksSebelum);
      const nominalTransaksi = parseAngka(cocokAkhir[1]);
      if (nominalTransaksi !== 0) {
        const deskripsi = deskripsiBuffer.join(' ').replace(/\s+/g, ' ').trim();
        baris.push({
          tanggal: tanggalAktif,
          deskripsi: deskripsi || '(tanpa keterangan)',
          tipe: nominalTransaksi < 0 ? 'out' : 'in',
          nominal: Math.abs(nominalTransaksi),
          yakin: true,
        });
      }
      batalkanRecord();
      continue;
    }

    deskripsiBuffer.push(line);
    // Jaga-jaga kalau parsing "nyasar" (baris akhir record gak pernah ketemu,
    // mis. format PDF beda dari yang dikalibrasi) — jangan sampai numpuk teks
    // tanpa henti, buang record ini dan mulai lagi dari tanggal berikutnya.
    if (deskripsiBuffer.length > 15) batalkanRecord();
  }

  return baris;
}

/**
 * @param {Buffer} buffer - isi file PDF rekening koran
 * @returns {Promise<{ baris: Array, kosong: boolean }>}
 */
export async function parseMutasiRekening(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const hasilTeks = await parser.getText();
    const teks = (hasilTeks?.text || '').trim();
    if (!teks) return { baris: [], kosong: true };

    const baris = ubahTeksJadiBaris(teks);
    return { baris, kosong: false };
  } finally {
    await parser.destroy();
  }
}
