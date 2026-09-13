// Business logic WMS Perlengkapan Jamaah — stok + status pengiriman
// PER-JAMAAH (bukan per-booking, karena item gender-spesifik seperti
// ihrom/mukena beda per orang). Tidak ada tabel/PK jamaah individual di
// sistem ini — identitas jamaah = (booking_id, idx array jamaah_data),
// pola flatten yang sama dipakai ambilManifest di
// src/app/api/admin/manifest/route.js.

import { pastikanPeriode } from '@/lib/cashflow';
import { kirimNotifikasi } from '@/lib/notifikasi';

const GENDER_MAP = { 'Laki-Laki': 'laki', 'Perempuan': 'perempuan' };

// Item yang berlaku buat 1 jamaah: 'semua' + item khusus gender-nya dia.
export function itemUntukGender(items, jk) {
  const g = GENDER_MAP[jk] || null;
  return items.filter(it => it.gender_spesifik === 'semua' || (g && it.gender_spesifik === g));
}

// Kit Program Sahabat Baitullah beda branding TOTAL dari program publik
// (dikonfirmasi user 2026-08-29) — bukan tambahan di atas kit umum, jadi
// filternya EXACT MATCH kategori, bukan gabungan.
export function itemUntukKategori(items, kategoriProgram) {
  return items.filter(it => it.kategori_program === (kategoriProgram || 'umum'));
}

export function itemUntukJamaah(items, jk, kategoriProgram) {
  return itemUntukKategori(itemUntukGender(items, jk), kategoriProgram);
}

// Kategori kit yang berlaku buat 1 booking, dari publish_type program-nya.
export async function kategoriProgramUntukBooking(pool, bookingId) {
  const [[row]] = await pool.query(
    `SELECT p.publish_type FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id WHERE b.id = ?`,
    [bookingId]
  );
  return row?.publish_type === 'sahabat_baitullah' ? 'sahabat_baitullah' : 'umum';
}

/**
 * Daftar jamaah yang bookingnya sudah DP-confirmed, digabung status
 * pengiriman perlengkapan masing-masing (default 'belum_diproses' kalau
 * belum ada baris di perlengkapan_pengiriman sama sekali).
 * @param {string} [progName] - filter 1 program, kalau tidak diisi semua program.
 */
export async function daftarJamaahPerluKit(pool, progName) {
  const params = [];
  let where = `WHERE b.dp_status = 'confirmed' AND b.status = 'active'`;
  if (progName) { where += ' AND b.prog_name = ?'; params.push(progName); }

  const [bookings] = await pool.query(
    `SELECT b.id AS booking_id, b.prog_name, b.jamaah_data, b.jumlah_jamaah, u.name AS pemesan_nama, p.publish_type
     FROM bookings b LEFT JOIN users u ON u.id = b.user_id LEFT JOIN programs p ON p.id = b.prog_id
     ${where}
     ORDER BY b.created_at ASC`,
    params
  );
  if (bookings.length === 0) return [];

  const [pengirimanRows] = await pool.query(
    `SELECT booking_id, jamaah_idx, status, disiapkan_at, dikirim_at, diterima_at, catatan
     FROM perlengkapan_pengiriman WHERE booking_id IN (${bookings.map(() => '?').join(',')})`,
    bookings.map(b => b.booking_id)
  );
  const statusMap = new Map(pengirimanRows.map(p => [`${p.booking_id}:${p.jamaah_idx}`, p]));

  const rows = [];
  for (const b of bookings) {
    let jd = b.jamaah_data;
    if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
    const entries = Array.isArray(jd) && jd.length > 0 ? jd : Array.from({ length: b.jumlah_jamaah || 1 }, () => ({}));

    const kategoriProgram = b.publish_type === 'sahabat_baitullah' ? 'sahabat_baitullah' : 'umum';
    entries.forEach((j, idx) => {
      const p = statusMap.get(`${b.booking_id}:${idx}`);
      rows.push({
        booking_id: b.booking_id,
        idx,
        prog_name: b.prog_name,
        kategori_program: kategoriProgram,
        pemesan_nama: b.pemesan_nama || '-',
        nama: j.nama || '(formulir belum diisi)',
        jk: j.jk || null,
        alamat_kirim: j.alamat_kirim || null,
        status: p?.status || 'belum_diproses',
        disiapkan_at: p?.disiapkan_at || null,
        dikirim_at: p?.dikirim_at || null,
        diterima_at: p?.diterima_at || null,
        catatan: p?.catatan || null,
      });
    });
  }
  return rows;
}

// Berapa jamaah (per item, memperhitungkan gender & kategori program) yang
// MASIH butuh kit-nya dikirim — dipakai buat cekItemPerluDipesan(). "Masih
// butuh" = status belum 'dikirim'/'diterima', tanpa batas waktu keberangkatan
// (dikonfirmasi user).
export async function hitungKebutuhanPerItem(pool, items) {
  const jamaahList = await daftarJamaahPerluKit(pool);
  const belumDikirim = jamaahList.filter(j => j.status !== 'dikirim' && j.status !== 'diterima');

  const kebutuhan = new Map(items.map(it => [it.id, 0]));
  for (const j of belumDikirim) {
    for (const it of itemUntukJamaah(items, j.jk, j.kategori_program)) {
      kebutuhan.set(it.id, (kebutuhan.get(it.id) || 0) + 1);
    }
  }
  return kebutuhan;
}

// Item yang stoknya perlu dipesan ulang — di bawah ambang minimum ATAU
// kurang dari kebutuhan mendatang (jamaah DP-confirmed yang belum dikirim).
export async function cekItemPerluDipesan(pool) {
  const [items] = await pool.query('SELECT * FROM perlengkapan_jamaah ORDER BY urutan');
  const kebutuhan = await hitungKebutuhanPerItem(pool, items);

  const hasil = [];
  for (const it of items) {
    const butuh = kebutuhan.get(it.id) || 0;
    const alasan = [];
    if (it.stok_saat_ini <= it.stok_minimum) alasan.push('di_bawah_minimum');
    if (it.stok_saat_ini < butuh) alasan.push('kurang_dari_kebutuhan');
    if (alasan.length > 0) hasil.push({ ...it, kebutuhan_mendatang: butuh, alasan });
  }
  return hasil;
}

const URUTAN_STATUS = ['belum_diproses', 'disiapkan', 'dikirim', 'diterima'];

// Item yang berlaku buat 1 jamaah (dipakai UI admin buat nampilin checklist
// sebelum kirim — "contreng satu-satu" atau "pilih semua").
export async function daftarItemUntukJamaah(pool, jk, kategoriProgram) {
  const [items] = await pool.query('SELECT * FROM perlengkapan_jamaah ORDER BY urutan');
  return itemUntukJamaah(items, jk, kategoriProgram);
}

// Update status pengiriman 1 jamaah. Kalau maju ke 'dikirim', catat ledger
// 'out' + kurangi stok_saat_ini — `itemIds` (opsional) = item yang DICONTRENG
// admin di UI (checklist satu-satu ATAU "pilih semua"); kalau tidak diisi,
// default ke SEMUA item yang berlaku ke gender+kategori program jamaah itu.
// Transaksi — stok & status harus konsisten, gak boleh nyangkut separuh.
export async function tandaiPengirimanJamaah(pool, { bookingId, jamaahIdx, jk, kategoriProgram, statusBaru, itemIds, catatan, actorId }) {
  if (!URUTAN_STATUS.includes(statusBaru)) {
    throw Object.assign(new Error('Status tidak valid'), { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT * FROM perlengkapan_pengiriman WHERE booking_id = ? AND jamaah_idx = ? FOR UPDATE',
      [bookingId, jamaahIdx]
    );
    const statusSekarang = existing[0]?.status || 'belum_diproses';
    const idxSekarang = URUTAN_STATUS.indexOf(statusSekarang);
    const idxTujuan = URUTAN_STATUS.indexOf(statusBaru);
    if (idxTujuan <= idxSekarang) {
      throw Object.assign(new Error(`Tidak boleh mundur/mengulang. Status sekarang: ${statusSekarang}.`), { status: 400 });
    }
    if (idxTujuan > idxSekarang + 1) {
      throw Object.assign(new Error(`Tidak boleh melompat step. Selesaikan "${URUTAN_STATUS[idxSekarang + 1]}" dulu.`), { status: 400 });
    }

    const kolomWaktu = { disiapkan: 'disiapkan_at', dikirim: 'dikirim_at', diterima: 'diterima_at' }[statusBaru];
    await conn.query(
      `INSERT INTO perlengkapan_pengiriman (booking_id, jamaah_idx, status, ${kolomWaktu}, catatan, updated_oleh)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), ${kolomWaktu} = CURRENT_TIMESTAMP,
         catatan = VALUES(catatan), updated_oleh = VALUES(updated_oleh)`,
      [bookingId, jamaahIdx, statusBaru, catatan || null, actorId || null]
    );

    if (statusBaru === 'dikirim') {
      const [items] = await conn.query('SELECT * FROM perlengkapan_jamaah ORDER BY urutan');
      const applicable = itemUntukJamaah(items, jk, kategoriProgram);
      // itemIds dari admin WAJIB subset item yang berlaku ke gender jamaah —
      // jangan percaya begitu saja apa yang dikirim client.
      const dipilih = Array.isArray(itemIds) && itemIds.length > 0
        ? applicable.filter(it => itemIds.includes(it.id))
        : applicable;
      if (dipilih.length === 0) {
        throw Object.assign(new Error('Pilih minimal 1 item untuk dikirim'), { status: 400 });
      }
      for (const it of dipilih) {
        await conn.query(
          `INSERT INTO perlengkapan_stok_ledger (item_id, tipe, qty, keterangan, booking_id, jamaah_idx, input_oleh)
           VALUES (?, 'out', 1, 'Pengiriman kit jamaah', ?, ?, ?)`,
          [it.id, bookingId, jamaahIdx, actorId || null]
        );
        await conn.query('UPDATE perlengkapan_jamaah SET stok_saat_ini = stok_saat_ini - 1 WHERE id = ?', [it.id]);
      }
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Item yang benar-benar dikirim ke 1 jamaah — dibaca dari ledger (bukan
// tabel baru, ledger sudah nyimpen booking_id+jamaah_idx per baris 'out').
// Dipakai buat cetak Tanda Terima.
export async function ambilItemDikirimJamaah(pool, { bookingId, jamaahIdx }) {
  const [rows] = await pool.query(
    `SELECT l.qty, l.created_at, p.nama, p.gender_spesifik
     FROM perlengkapan_stok_ledger l JOIN perlengkapan_jamaah p ON p.id = l.item_id
     WHERE l.booking_id = ? AND l.jamaah_idx = ? AND l.tipe = 'out'
     ORDER BY l.created_at ASC`,
    [bookingId, jamaahIdx]
  );
  return rows;
}

// Sweep: booking yang statusnya 'dikirim' >= 7 hari tanpa dikonfirmasi
// jamaah, otomatis dianggap 'diterima'. Dipanggil dari
// src/instrumentation.js — pola sama seperti sweep lain di sistem ini.
export async function jalankanAutoTerimaPerlengkapan(pool) {
  const [rows] = await pool.query(
    `SELECT booking_id, jamaah_idx FROM perlengkapan_pengiriman
     WHERE status = 'dikirim' AND dikirim_at <= DATE_SUB(NOW(), INTERVAL 7 DAY)`
  );
  const diproses = [];
  for (const r of rows) {
    await pool.query(
      `UPDATE perlengkapan_pengiriman SET status = 'diterima', diterima_at = CURRENT_TIMESTAMP,
         catatan = 'Otomatis diterima sistem — 7 hari tanpa konfirmasi jamaah.'
       WHERE booking_id = ? AND jamaah_idx = ?`,
      [r.booking_id, r.jamaah_idx]
    );
    diproses.push(r);
  }
  return diproses;
}

// Sweep: reminder H-2 SEBELUM auto-terima (7 hari) kejadian — 'dikirim'
// antara hari ke-5 dan hari ke-7 sejak dikirim_at, belum pernah direminder.
// Dipanggil dari src/instrumentation.js, sweep TERPISAH dari
// jalankanAutoTerimaPerlengkapan di atas tapi query serupa.
export async function jalankanReminderAutoTerimaPerlengkapan(pool) {
  const [rows] = await pool.query(
    `SELECT pp.booking_id, pp.jamaah_idx, b.user_id, b.ordered_by, b.prog_name
     FROM perlengkapan_pengiriman pp
     LEFT JOIN bookings b ON b.id = pp.booking_id
     WHERE pp.status = 'dikirim' AND pp.reminder_terkirim_at IS NULL
       AND pp.dikirim_at <= DATE_SUB(NOW(), INTERVAL 5 DAY)
       AND pp.dikirim_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`
  );
  const diproses = [];
  for (const r of rows) {
    await kirimNotifikasi(pool, {
      user_id: r.ordered_by || r.user_id,
      tipe: 'perlengkapan_reminder',
      judul: 'Konfirmasi Penerimaan Perlengkapan',
      pesan: `Perlengkapan ${r.prog_name || ''} Anda akan otomatis dianggap diterima dalam 1-2 hari jika belum dikonfirmasi.`,
      link: '/dashboard/jamaah',
    });
    await pool.query(
      'UPDATE perlengkapan_pengiriman SET reminder_terkirim_at = NOW() WHERE booking_id = ? AND jamaah_idx = ?',
      [r.booking_id, r.jamaah_idx]
    );
    diproses.push(r);
  }
  return diproses;
}

// Tambah stok masuk (pembelian/restock) — super_admin only, dipanggil dari
// API route. Ledger 'in' + update cache stok_saat_ini dalam 1 transaksi.
//
// hargaSatuan (opsional) = belanja ini beneran keluar duit — bikin 1 baris
// cashflow_transaksi ('out', kategori "Perlengkapan Jamaah") OTOMATIS,
// biar belanja perlengkapan kehitung di Laba Rugi (dulu WMS ini gak pernah
// nyatet nominal sama sekali, lihat migration-perlengkapan-harga.sql).
// akunId (opsional, TERPISAH dari hargaSatuan — boleh isi harga TANPA
// akun) = ISI kalau duitnya lewat rekening yang direkonsiliasi (Cashflow
// Bulanan asli, wajib ada periode yang udah dibuka), KOSONGKAN kalau ini
// bon dari owner/pihak lain yang gak lewat rekening yang kita track (lihat
// migration-cashflow-akun-opsional.sql) — periode-nya di-bikin OTOMATIS,
// gak perlu admin buka manual dulu.
// programId (opsional) = tag ke 1 program kalau kit ini beli buat program
// spesifik, dipakai laporan Realisasi vs Budget.
export async function tambahStokMasuk(pool, { itemId, qty, hargaSatuan, akunId, programId, keterangan, actorId }) {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw Object.assign(new Error('Qty harus angka bulat positif'), { status: 400 });
  }
  const hargaValid = hargaSatuan != null && hargaSatuan !== '' && Number(hargaSatuan) > 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, nama FROM perlengkapan_jamaah WHERE id = ? FOR UPDATE', [itemId]);
    if (rows.length === 0) throw Object.assign(new Error('Item tidak ditemukan'), { status: 404 });
    const item = rows[0];

    let cashflowTransaksiId = null;
    if (hargaValid) {
      const bulanIni = new Date().toISOString().slice(0, 7);
      let periodeId;
      if (akunId) {
        const [[periode]] = await conn.query('SELECT id, status FROM cashflow_periode WHERE bulan = ?', [bulanIni]);
        if (!periode) {
          throw Object.assign(new Error(`Buka periode cashflow bulan ${bulanIni} dulu sebelum catat belanja ini sebagai pengeluaran akun`), { status: 400 });
        }
        if (periode.status === 'submitted') {
          throw Object.assign(new Error(`Periode cashflow bulan ${bulanIni} sudah dikunci, gak bisa nambah transaksi`), { status: 400 });
        }
        periodeId = periode.id;
      } else {
        periodeId = (await pastikanPeriode(conn, bulanIni, actorId)).id;
      }
      const [[katPerlengkapan]] = await conn.query("SELECT id FROM cashflow_kategori WHERE nama = 'Perlengkapan Jamaah' LIMIT 1");
      const [cfResult] = await conn.query(
        `INSERT INTO cashflow_transaksi (periode_id, tanggal, deskripsi, kategori_id, program_id, akun_id, tipe, nominal, input_oleh)
         VALUES (?, CURDATE(), ?, ?, ?, ?, 'out', ?, ?)`,
        [periodeId, `Belanja Perlengkapan: ${item.nama} x${qty}`, katPerlengkapan?.id || null, programId || null, akunId || null, Number(hargaSatuan) * qty, actorId || null]
      );
      cashflowTransaksiId = cfResult.insertId;
    }

    await conn.query(
      `INSERT INTO perlengkapan_stok_ledger (item_id, tipe, qty, harga_satuan, keterangan, cashflow_transaksi_id, input_oleh)
       VALUES (?, 'in', ?, ?, ?, ?, ?)`,
      [itemId, qty, hargaValid ? Number(hargaSatuan) : null, keterangan || null, cashflowTransaksiId, actorId || null]
    );
    await conn.query('UPDATE perlengkapan_jamaah SET stok_saat_ini = stok_saat_ini + ? WHERE id = ?', [qty, itemId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
