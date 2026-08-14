const ROMAWI_BULAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Nomor proposal corporate — format sama gaya sama nomor perjanjian kerjasama
// (NN.XXXX/JMT.PROP.<romawi>/YYYY), tapi BEDA sifat: di sini SELALU bikin
// nomor baru tiap proposal dibuat (bukan dicek-lalu-dibekukan ke 1 user
// kayak ambilAtauBuatNomorSurat di nomorSurat.js), karena satu proposal =
// satu dokumen berdiri sendiri, bukan melekat permanen ke satu akun.
export async function generateNomorProposal(pool) {
  await pool.query(
    `INSERT INTO nomor_surat_counter (jenis, urutan) VALUES ('PROP', 1)
     ON DUPLICATE KEY UPDATE urutan = urutan + 1`
  );
  const [c] = await pool.query("SELECT urutan FROM nomor_surat_counter WHERE jenis = 'PROP'");
  const urutan = c[0].urutan;

  const now = new Date();
  const bulan = String(now.getMonth() + 1).padStart(2, '0');
  const romawi = ROMAWI_BULAN[now.getMonth()];
  const tahun = now.getFullYear();
  return `${bulan}.${String(urutan).padStart(4, '0')}/JMT.PROP.${romawi}/${tahun}`;
}
