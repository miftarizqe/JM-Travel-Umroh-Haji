const ROMAWI_BULAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Nomor surat perjanjian kerjasama — format: NN.XXXX/JMT.<jenis>.<romawi>/YYYY
// NN = bulan berjalan (2 digit), XXXX = urutan keseluruhan (counter terpisah
// per jenis, mulai dari 1), romawi = bulan berjalan dalam angka romawi.
//
// Nomor di-generate SEKALI per user lalu dibekukan permanen di
// users.no_perjanjian_kerjasama — supaya cetak ulang surat yang sama gak
// dapat nomor baru (nomor surat resmi gak boleh berubah-ubah).
export async function ambilAtauBuatNomorSurat(pool, userId, jenis) {
  const [rows] = await pool.query('SELECT no_perjanjian_kerjasama FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return null;
  if (rows[0].no_perjanjian_kerjasama) return rows[0].no_perjanjian_kerjasama;

  await pool.query(
    `INSERT INTO nomor_surat_counter (jenis, urutan) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE urutan = urutan + 1`,
    [jenis]
  );
  const [c] = await pool.query('SELECT urutan FROM nomor_surat_counter WHERE jenis = ?', [jenis]);
  const urutan = c[0].urutan;

  const now = new Date();
  const bulan = String(now.getMonth() + 1).padStart(2, '0');
  const romawi = ROMAWI_BULAN[now.getMonth()];
  const tahun = now.getFullYear();
  const nomor = `${bulan}.${String(urutan).padStart(4, '0')}/JMT.${jenis}.${romawi}/${tahun}`;

  await pool.query('UPDATE users SET no_perjanjian_kerjasama = ? WHERE id = ?', [nomor, userId]);
  return nomor;
}
