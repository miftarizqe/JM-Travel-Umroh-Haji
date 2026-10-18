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
// Inti generate 1 nomor baru buat `jenis` tertentu — dipakai bareng oleh
// ambilAtauBuatNomorSurat (kolom di tabel users/bookings) & oleh dokumen
// yang nomornya disimpan di tabel terpisah (mis. Perjanjian Jamaah per-
// jamaah, lihat ambilAtauBuatNomorSuratJamaah) karena targetnya bukan 1
// kolom di baris utama (jamaah_data cuma JSON, entry-nya gak punya kolom
// sendiri buat ditempelin nomor).
async function generateNomorBaru(pool, jenis) {
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
  if (released) {
    await pool.query('DELETE FROM nomor_surat_released WHERE id = ?', [released.id]);
    return released.nomor;
  }
  await pool.query(
    `INSERT INTO nomor_surat_counter (jenis, urutan) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE urutan = urutan + 1`,
    [jenis]
  );
  const [c] = await pool.query('SELECT urutan FROM nomor_surat_counter WHERE jenis = ?', [jenis]);
  const urutan = c[0].urutan;
  const bulan = String(bulanAngka).padStart(2, '0');
  return `${String(urutan).padStart(6, '0')}.${bulan}/JMT-${jenis}/${tahun}`;
}

export async function ambilAtauBuatNomorSurat(pool, rowId, jenis, kolom = 'no_perjanjian_kerjasama', tabel = 'users') {
  const [rows] = await pool.query(`SELECT ${kolom} AS nomor FROM ${tabel} WHERE id = ?`, [rowId]);
  if (rows.length === 0) return null;
  if (rows[0].nomor) return rows[0].nomor;

  const nomor = await generateNomorBaru(pool, jenis);
  await pool.query(`UPDATE ${tabel} SET ${kolom} = ? WHERE id = ?`, [nomor, rowId]);
  return nomor;
}

// 1 jamaah = 1 perjanjian = 1 nomor sendiri (dikonfirmasi user 2026-10-18,
// gantiin skema lama 1 nomor dipakai bareng semua jamaah dalam 1 booking).
// Disimpan di tabel perjanjian_jamaah_nomor (booking_id, jamaah_idx) --
// BUKAN kolom bookings.no_perjanjian_jamaah (itu nomor lama format
// per-booking, dibiarkan apa adanya buat booking yang udah kebeku sebelum
// perubahan ini, gak di-backfill retroaktif). `jamaahIdx` = index entry di
// jamaah_data (array JSON), stabil selama entry gak dihapus/di-reorder.
export async function ambilAtauBuatNomorSuratJamaah(pool, bookingId, jamaahIdx, jenis = 'SPJ') {
  const [[existing]] = await pool.query(
    'SELECT nomor FROM perjanjian_jamaah_nomor WHERE booking_id = ? AND jamaah_idx = ?',
    [bookingId, jamaahIdx]
  );
  if (existing) return existing.nomor;

  const nomor = await generateNomorBaru(pool, jenis);
  await pool.query(
    'INSERT INTO perjanjian_jamaah_nomor (booking_id, jamaah_idx, nomor) VALUES (?, ?, ?)',
    [bookingId, jamaahIdx, nomor]
  );
  return nomor;
}

// Dipanggil saat pendaftaran DITOLAK (atau booking DIBATALKAN) -- nomor
// yang udah kebakar (dibaca/dicetak sebelum ditolak/dibatalkan) dilepas
// biar orang/booking LAIN bulan yang sama bisa kepake nomor itu (lihat
// ambilAtauBuatNomorSurat). Beda bulan -> dibiarin, jadi gap permanen
// (lumrah, auditable) -- reuse lintas bulan bikin nomor kecil bertanggal
// lebih baru dari nomor besar, berisiko keliatan aneh buat audit.
// `tabel` default 'users', Perjanjian Jamaah pakai 'bookings'.
// `kolomTanggal` opsional -- kalau dokumennya juga punya kolom tanggal
// beku berpasangan (lihat ambilAtauBuatTanggalBeku, cth SPKA-Ins), ikut
// dikosongkan juga biar generate ulang nanti dapat tanggal baru yang
// match sama nomor barunya, bukan nyangkut ke tanggal lama.
export async function releaseNomorSuratJikaBulanSama(pool, rowId, kolom, jenis, tabel = 'users', kolomTanggal = null) {
  const [[row]] = await pool.query(`SELECT ${kolom} AS nomor FROM ${tabel} WHERE id = ?`, [rowId]);
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
  const setClause = kolomTanggal ? `${kolom} = NULL, ${kolomTanggal} = NULL` : `${kolom} = NULL`;
  await pool.query(`UPDATE ${tabel} SET ${setClause} WHERE id = ?`, [rowId]);
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

  // Prioritaskan tanggal SETUJU beneran (setuju_pks_at) daripada tanggal pas
  // dokumen ini PERTAMA KALI di-generate/dibaca — dua momen itu bisa beda
  // hari kalau PDF-nya baru ke-generate belakangan (dikonfirmasi user
  // 2026-10-17: SPK-AK Afif Masduki setuju 9 Oktober, tapi PDF-nya baru
  // kebuka/digenerate 17 Oktober, dokumennya harus tetap kebaca 9 Oktober).
  // Fallback ke now() kalau setuju_pks_at belum keisi (dokumen digenerate
  // sebelum ada yang setuju sama sekali) -- perilaku lama, gak berubah.
  const [[row]] = await pool.query(`SELECT setuju_pks_at FROM ${tabel} WHERE id = ?`, [rowId]);
  const sekarang = row?.setuju_pks_at ? new Date(row.setuju_pks_at) : new Date();
  await pool.query(`UPDATE ${tabel} SET ${kolomTanggal} = ? WHERE id = ?`, [sekarang, rowId]);
  return sekarang;
}
