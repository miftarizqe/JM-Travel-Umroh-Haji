// Nomor surat perjanjian kerjasama — format: XXXXXX.NN/JMT-<jenis>/YYYY
// XXXXXX = urutan keseluruhan (6 digit, counter terpisah per jenis, mulai
// dari 1), NN = bulan berjalan (2 digit). Format lama (NN.XXXX/JMT.<jenis>.
// <romawi>/YYYY) DIUBAH (dikonfirmasi user 2026-10-12) — nomor yang udah
// kebeku di kolom users (format lama) TIDAK diubah retroaktif, cuma nomor
// BARU yang pakai format ini.
//
// Nomor di-generate SEKALI per baris lalu dibekukan permanen di kolom
// `kolom` (default users.no_perjanjian_kerjasama, dipakai SPKA-Ins) —
// supaya cetak ulang surat yang sama gak dapat nomor baru (nomor surat
// resmi gak boleh berubah-ubah). Dokumen lain yang butuh nomor sendiri
// (SPK-AK, SK-CIF, Perjanjian Jamaah) HARUS pakai kolom terpisah
// (no_spk_ak/no_sk_cif/no_perjanjian_jamaah) — kalau reuse kolom default,
// pemanggilan ke-2 buat baris yang sama akan diam-diam balikin nomor
// dokumen pertama. `tabel` default 'users' (perwakilan/sahabat, per-akun)
// — Perjanjian Jamaah per-BOOKING (1 jamaah bisa booking berkali-kali,
// masing-masing butuh nomor sendiri), jadi pakai tabel='bookings'.
export async function ambilAtauBuatNomorSurat(pool, rowId, jenis, kolom = 'no_perjanjian_kerjasama', tabel = 'users') {
  const [rows] = await pool.query(`SELECT ${kolom} AS nomor FROM ${tabel} WHERE id = ?`, [rowId]);
  if (rows.length === 0) return null;
  if (rows[0].nomor) return rows[0].nomor;

  const now = new Date();
  const bulanAngka = now.getMonth() + 1;
  const tahun = now.getFullYear();

  // Coba pakai nomor bekas dulu (pendaftaran lain ditolak BULAN INI, nomornya
  // dirilis lewat releaseNomorSuratJikaBulanSama) sebelum nambah counter baru
  // -- dikonfirmasi user 2026-10-03, biar gap minim tapi urutan tetap searah
  // tanggal (nomor lama cuma dipakai ulang selama masih bulan yang sama).
  const [[released]] = await pool.query(
    'SELECT id, nomor FROM nomor_surat_released WHERE jenis = ? AND bulan = ? AND tahun = ? ORDER BY urutan ASC LIMIT 1',
    [jenis, bulanAngka, tahun]
  );
  let nomor;
  if (released) {
    await pool.query('DELETE FROM nomor_surat_released WHERE id = ?', [released.id]);
    nomor = released.nomor;
  } else {
    await pool.query(
      `INSERT INTO nomor_surat_counter (jenis, urutan) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE urutan = urutan + 1`,
      [jenis]
    );
    const [c] = await pool.query('SELECT urutan FROM nomor_surat_counter WHERE jenis = ?', [jenis]);
    const urutan = c[0].urutan;
    const bulan = String(bulanAngka).padStart(2, '0');
    nomor = `${String(urutan).padStart(6, '0')}.${bulan}/JMT-${jenis}/${tahun}`;
  }

  await pool.query(`UPDATE ${tabel} SET ${kolom} = ? WHERE id = ?`, [nomor, rowId]);
  return nomor;
}

// Dipanggil saat pendaftaran DITOLAK -- nomor yang udah kebakar (dibaca
// jamaah sebelum admin tolak) dilepas biar jamaah LAIN yang daftar bulan
// yang sama bisa kepake nomor itu (lihat ambilAtauBuatNomorSurat). Beda
// bulan -> dibiarin, jadi gap permanen (lumrah, auditable lewat
// pendaftaran_status_log) -- reuse lintas bulan bikin nomor kecil bertanggal
// lebih baru dari nomor besar, berisiko keliatan aneh buat audit.
export async function releaseNomorSuratJikaBulanSama(pool, userId, kolom, jenis) {
  const [[row]] = await pool.query(`SELECT ${kolom} AS nomor FROM users WHERE id = ?`, [userId]);
  const nomor = row?.nomor;
  if (!nomor) return;

  // Cuma cocok format BARU (XXXXXX.NN/JMT-<jenis>/YYYY) -- nomor format
  // lama (dibekukan sebelum 2026-10-12) gak match, fungsi ini return lebih
  // awal & nomornya gak dilepas (jadi gap permanen, sama kayak kasus beda
  // bulan di bawah -- udah diterima sebagai perilaku wajar).
  const cocok = nomor.match(/^(\d{6})\.(\d{2})\/JMT-.+\/(\d{4})$/);
  if (!cocok) return;
  const [, urutanStr, bulanStr, tahunStr] = cocok;

  const now = new Date();
  const bulanSekarang = String(now.getMonth() + 1).padStart(2, '0');
  const tahunSekarang = String(now.getFullYear());
  if (bulanStr !== bulanSekarang || tahunStr !== tahunSekarang) return;

  await pool.query(
    'INSERT INTO nomor_surat_released (jenis, bulan, tahun, urutan, nomor) VALUES (?, ?, ?, ?, ?)',
    [jenis, Number(bulanStr), Number(tahunStr), Number(urutanStr), nomor]
  );
  await pool.query(`UPDATE users SET ${kolom} = NULL WHERE id = ?`, [userId]);
}

// Tanggal TTD dibekukan PERMANEN bareng nomor (dikonfirmasi user 2026-10-12)
// -- sebelumnya dihitung ulang `new Date()` setiap dokumen SPK-AK dibuka/
// dicetak ulang (/pks buat centang setuju, atau cetak manual admin), bikin
// tanggal di surat ikut maju walau nomornya udah beku dari kapan. Kolom
// tanggal dikasih TERPISAH & eksplisit dari pemanggil (bukan ditebak dari
// nama kolom nomor) biar jelas gak ada collision. Dipanggil BARENGAN
// ambilAtauBuatNomorSurat di tempat yang sama -- siapa pun yang DULUAN
// nyentuh dokumennya (baca di /pks ATAU admin kirim TTD digital) yang
// mbekuin tanggalnya, bukan cuma nomornya doang.
export async function ambilAtauBuatTanggalBeku(pool, rowId, kolomTanggal, tabel = 'users') {
  const [rows] = await pool.query(`SELECT ${kolomTanggal} AS tanggal FROM ${tabel} WHERE id = ?`, [rowId]);
  if (rows.length === 0) return null;
  if (rows[0].tanggal) return new Date(rows[0].tanggal);

  const sekarang = new Date();
  await pool.query(`UPDATE ${tabel} SET ${kolomTanggal} = ? WHERE id = ?`, [sekarang, rowId]);
  return sekarang;
}
