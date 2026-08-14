const ROMAWI_BULAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Nomor invoice/kwitansi — format sama gaya nomor perjanjian/proposal
// (NN.XXXX/JMT.<jenis>.<romawi>/YYYY), SELALU bikin nomor baru tiap dipanggil
// (bukan dicek-lalu-dibekukan ke 1 entity kayak ambilAtauBuatNomorSurat di
// nomorSurat.js) — satu invoice/kwitansi = satu dokumen berdiri sendiri.
// Dipanggil SEKALI aja per baris invoice_kwitansi yang baru dibuat, lalu
// hasilnya disimpan permanen di kolom `nomor` — jangan panggil ulang buat
// dokumen yang sudah ada (nomor resmi gak boleh berubah).
async function generateNomor(pool, jenisCounter) {
  await pool.query(
    `INSERT INTO nomor_surat_counter (jenis, urutan) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE urutan = urutan + 1`,
    [jenisCounter]
  );
  const [c] = await pool.query('SELECT urutan FROM nomor_surat_counter WHERE jenis = ?', [jenisCounter]);
  const urutan = c[0].urutan;

  const now = new Date();
  const bulan = String(now.getMonth() + 1).padStart(2, '0');
  const romawi = ROMAWI_BULAN[now.getMonth()];
  const tahun = now.getFullYear();
  return `${bulan}.${String(urutan).padStart(4, '0')}/JMT.${jenisCounter}.${romawi}/${tahun}`;
}

// Invoice DP & Invoice Pelunasan SENGAJA berbagi 1 seri nomor (counter 'INV')
// — beda cuma di label/keterangan dokumennya, bukan di penomoran.
export async function generateNomorInvoice(pool) {
  return generateNomor(pool, 'INV');
}

// Kwitansi Pembayaran punya seri nomor sendiri (counter 'KWT') — fungsinya
// beda dari Invoice (bukti lunas TOTAL, bukan tagihan atau bukti per-transaksi).
export async function generateNomorKwitansi(pool) {
  return generateNomor(pool, 'KWT');
}

// Tanda Terima Uang punya seri nomor sendiri (counter 'TTU') — 1 dokumen per
// PEMBAYARAN yang diterima (DP, cicilan, pelunasan), beda dari Kwitansi yang
// cuma terbit sekali pas lunas total.
export async function generateNomorTandaTerima(pool) {
  return generateNomor(pool, 'TTU');
}
