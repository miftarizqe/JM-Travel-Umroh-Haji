/**
 * Buku kas bulanan multi-akun. Aturan inti:
 * - Tiap transaksi menyentuh SATU akun (kecuali transfer antar akun, yang
 *   disimpan sebagai 2 baris terpisah dengan transfer_pair_id yang sama:
 *   OUT di akun asal + IN di akun tujuan).
 * - Baris breakdown settlement (settlement_induk_id terisi DAN tipe='out')
 *   TIDAK dihitung ke saldo — uangnya sudah keluar saat transfer awal ke
 *   staff dicatat. Baris breakdown cuma dokumentasi "duit ini dipakai buat
 *   apa" + bon, supaya gak dobel hitung. Kalau ada sisa duit dikembalikan,
 *   itu baris IN normal (biasa, bukan pengecualian).
 */
const KLAUSA_HITUNG_SALDO = `NOT (settlement_induk_id IS NOT NULL AND tipe = 'out')`;

export async function ambilAkunAktif(pool) {
  const [rows] = await pool.query(
    'SELECT * FROM cashflow_akun WHERE aktif = 1 ORDER BY urutan ASC, id ASC'
  );
  return rows;
}

/** Saldo akhir per akun untuk 1 periode = saldo_awal + IN - OUT (yang dihitung). */
export async function hitungSaldoAkhirPeriode(pool, periodeId) {
  const [saldoAwalRows] = await pool.query(
    'SELECT akun_id, saldo_awal FROM cashflow_saldo_awal WHERE periode_id = ?',
    [periodeId]
  );
  // akun_id IS NOT NULL — transaksi "purchasing/realisasi" (bon dari
  // owner, belanja perlengkapan) SENGAJA gak nempel akun manapun (lihat
  // migration-cashflow-akun-opsional.sql), gak boleh ikut ngotorin
  // rekonsiliasi saldo akun manapun.
  const [mutasiRows] = await pool.query(
    `SELECT akun_id, tipe, SUM(nominal) AS total
     FROM cashflow_transaksi
     WHERE periode_id = ? AND akun_id IS NOT NULL AND ${KLAUSA_HITUNG_SALDO}
     GROUP BY akun_id, tipe`,
    [periodeId]
  );

  const map = {};
  for (const r of saldoAwalRows) {
    map[r.akun_id] = { akun_id: r.akun_id, saldo_awal: Number(r.saldo_awal), total_in: 0, total_out: 0 };
  }
  for (const r of mutasiRows) {
    if (!map[r.akun_id]) map[r.akun_id] = { akun_id: r.akun_id, saldo_awal: 0, total_in: 0, total_out: 0 };
    if (r.tipe === 'in') map[r.akun_id].total_in = Number(r.total);
    else map[r.akun_id].total_out = Number(r.total);
  }
  return Object.values(map).map(a => ({ ...a, saldo_akhir: a.saldo_awal + a.total_in - a.total_out }));
}

/**
 * Baris transaksi yang tampil di cetakan/PDF cashflow. cetak_mode diset
 * per-transaksi settlement di halaman edit ("Rincian"/"Totalan") — 1 periode
 * bisa campur: settlement gaji ditampilin gelondongan, settlement lain
 * dipecah rincian.
 * - settlement dgn cetak_mode 'rincian' (default): parent-nya disembunyikan,
 *   anak/rincian belanjanya yang tampil sebagai baris biasa.
 * - settlement dgn cetak_mode 'totalan', ATAU settlement yg belum punya anak
 *   sama sekali: parent-nya yang tampil (1 baris, nominal gelondongan) —
 *   settlement tanpa anak harus tetap tampil, jangan sampai hilang total.
 * Dipakai bareng di preview browser (cetak-cashflow) dan generator PDF
 * server-side, biar dua-duanya gak pernah beda hasil.
 */
export function hitungPrintRows(transaksi) {
  const modeById = {};
  transaksi.forEach(t => { if (t.is_settlement) modeById[t.id] = t.cetak_mode || 'rincian'; });
  const adaAnakById = {};
  transaksi.forEach(t => { if (t.settlement_induk_id) adaAnakById[t.settlement_induk_id] = true; });
  return transaksi.filter(t => {
    if (t.is_settlement) {
      if (!adaAnakById[t.id]) return true;
      return modeById[t.id] === 'totalan';
    }
    if (t.settlement_induk_id) return modeById[t.settlement_induk_id] !== 'totalan';
    return true;
  });
}

/**
 * Ambil periode bulan `bulan` (YYYY-MM), bikin otomatis kalau belum ada —
 * dipakai jalur "purchasing" (transaksi tanpa akun, lihat
 * migration-cashflow-akun-opsional.sql) biar admin gak perlu manual buka
 * periode dulu buat sekadar nyatet bon dari owner. Replikasi logika chaining
 * saldo yang sama kayak POST /api/admin/cashflow/periode (bukan cuma INSERT
 * polos) — kalau NANTI periode ini ternyata juga kepake transaksi ber-akun
 * (mis. admin lain iseng nambah transaksi CIMB di bulan yang sama), saldo
 * awal akun-akunnya tetap ke-chain benar dari bulan sebelumnya, bukan 0.
 */
export async function pastikanPeriode(pool, bulan, actorId) {
  const [[existing]] = await pool.query('SELECT * FROM cashflow_periode WHERE bulan = ?', [bulan]);
  if (existing) return existing;

  const akunAktif = await ambilAkunAktif(pool);
  const sebelumnya = await ambilPeriodeSebelumnya(pool, bulan);
  let saldoPerAkun = {};
  if (sebelumnya) {
    const saldoAkhirSebelumnya = await hitungSaldoAkhirPeriode(pool, sebelumnya.id);
    saldoAkhirSebelumnya.forEach(s => { saldoPerAkun[s.akun_id] = s.saldo_akhir; });
  }

  const [result] = await pool.query('INSERT INTO cashflow_periode (bulan, created_by) VALUES (?, ?)', [bulan, actorId || null]);
  for (const akun of akunAktif) {
    await pool.query(
      'INSERT INTO cashflow_saldo_awal (periode_id, akun_id, saldo_awal) VALUES (?, ?, ?)',
      [result.insertId, akun.id, saldoPerAkun[akun.id] || 0]
    );
  }
  const [[created]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [result.insertId]);
  return created;
}

/**
 * Setelah periode dikunci (submit), saldo_akhir final-nya harus jadi
 * saldo_awal periode berikutnya. Tapi periode berikutnya bisa saja sudah
 * kepalang dibuat duluan (tombol "Buat Cashflow Bulan Ini", atau auto-create
 * lewat pastikanPeriode saat ada bon/transaksi purchasing yang tanggalnya
 * sudah masuk bulan itu) — snapshot saldo_awal-nya waktu itu diambil dari
 * saldo_akhir periode ini yang MASIH draft, jadi basi begitu ada transaksi
 * susulan sebelum akhirnya dikunci. Fungsi ini nyegerin ulang saldo_awal
 * periode berikutnya (dan berantai ke periode-periode draft setelahnya lagi,
 * kalau ada) pakai saldo_akhir final yang baru dikunci. Periode yang statusnya
 * sudah 'submitted' gak disentuh — itu sudah beku sesuai desain, dan urutan
 * submit yang dipaksa linier (lihat POST .../submit) menjamin gak ada periode
 * submitted setelah periode draft.
 */
export async function sinkronSaldoAwalBerantai(pool, periodeId) {
  let current = periodeId;
  for (;;) {
    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [current]);
    if (!periode) break;
    const [[berikutnya]] = await pool.query(
      `SELECT * FROM cashflow_periode WHERE bulan > ? ORDER BY bulan ASC LIMIT 1`,
      [periode.bulan]
    );
    if (!berikutnya || berikutnya.status !== 'draft') break;

    const saldoAkhir = await hitungSaldoAkhirPeriode(pool, periode.id);
    for (const s of saldoAkhir) {
      await pool.query(
        `INSERT INTO cashflow_saldo_awal (periode_id, akun_id, saldo_awal) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE saldo_awal = VALUES(saldo_awal)`,
        [berikutnya.id, s.akun_id, s.saldo_akhir]
      );
    }
    current = berikutnya.id;
  }
}

/** Periode terakhir (bulan mana pun, draft atau submitted) sebelum `bulan` (YYYY-MM). */
export async function ambilPeriodeSebelumnya(pool, bulan) {
  const [rows] = await pool.query(
    'SELECT * FROM cashflow_periode WHERE bulan < ? ORDER BY bulan DESC LIMIT 1',
    [bulan]
  );
  return rows[0] || null;
}

/**
 * Semua baris settlement (transfer ke staff) yang belum dirincikan tuntas,
 * lintas bulan — termasuk yang bulannya sudah dikunci, karena uangnya tetap
 * belum jelas pertanggungjawabannya biarpun bulannya sudah ditutup.
 */
export async function ambilSettlementBelumSelesai(pool) {
  const [rows] = await pool.query(
    `SELECT t.id, t.periode_id, t.tanggal, t.deskripsi, t.nominal, t.penerima_settlement,
            a.nama AS akun_nama, p.bulan, p.status AS periode_status,
            COALESCE(anak.total_anak, 0) AS total_anak
     FROM cashflow_transaksi t
     JOIN cashflow_periode p ON p.id = t.periode_id
     JOIN cashflow_akun a ON a.id = t.akun_id
     LEFT JOIN (
       SELECT settlement_induk_id, SUM(nominal) AS total_anak
       FROM cashflow_transaksi WHERE settlement_induk_id IS NOT NULL GROUP BY settlement_induk_id
     ) anak ON anak.settlement_induk_id = t.id
     WHERE t.is_settlement = 1
     HAVING (t.nominal - total_anak) > 0
     ORDER BY t.tanggal ASC`
  );
  return rows.map(r => ({ ...r, sisa: Number(r.nominal) - Number(r.total_anak) }));
}
