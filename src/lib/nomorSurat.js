const ROMAWI_BULAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Nomor surat perjanjian kerjasama — format: NN.XXXX/JMT.<jenis>.<romawi>/YYYY
// NN = bulan berjalan (2 digit), XXXX = urutan keseluruhan (counter terpisah
// per jenis, mulai dari 1), romawi = bulan berjalan dalam angka romawi.
//
// Nomor di-generate SEKALI per user lalu dibekukan permanen di kolom
// `kolom` (default users.no_perjanjian_kerjasama, dipakai SPKA-Ins) —
// supaya cetak ulang surat yang sama gak dapat nomor baru (nomor surat
// resmi gak boleh berubah-ubah). Dokumen lain yang butuh nomor sendiri
// (SPK-AK, SK-CIF) HARUS pakai kolom terpisah (no_spk_ak/no_sk_cif) —
// kalau reuse kolom default, pemanggilan ke-2 buat user yang sama akan
// diam-diam balikin nomor dokumen pertama.
export async function ambilAtauBuatNomorSurat(pool, userId, jenis, kolom = 'no_perjanjian_kerjasama') {
  const [rows] = await pool.query(`SELECT ${kolom} AS nomor FROM users WHERE id = ?`, [userId]);
  if (rows.length === 0) return null;
  if (rows[0].nomor) return rows[0].nomor;

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

  await pool.query(`UPDATE users SET ${kolom} = ? WHERE id = ?`, [nomor, userId]);
  return nomor;
}
