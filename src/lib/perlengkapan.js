// Business logic WMS Perlengkapan Jamaah — stok + status pengiriman
// PER-JAMAAH (bukan per-booking, karena item gender-spesifik seperti
// ihrom/mukena beda per orang). Tidak ada tabel/PK jamaah individual di
// sistem ini — identitas jamaah = (booking_id, idx array jamaah_data),
// pola flatten yang sama dipakai ambilManifest di
// src/app/api/admin/manifest/route.js.

const GENDER_MAP = { 'Laki-Laki': 'laki', 'Perempuan': 'perempuan' };

// Item yang berlaku buat 1 jamaah: 'semua' + item khusus gender-nya dia.
export function itemUntukGender(items, jk) {
  const g = GENDER_MAP[jk] || null;
  return items.filter(it => it.gender_spesifik === 'semua' || (g && it.gender_spesifik === g));
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
    `SELECT b.id AS booking_id, b.prog_name, b.jamaah_data, b.jumlah_jamaah, u.name AS pemesan_nama
     FROM bookings b LEFT JOIN users u ON u.id = b.user_id
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

    entries.forEach((j, idx) => {
      const p = statusMap.get(`${b.booking_id}:${idx}`);
      rows.push({
        booking_id: b.booking_id,
        idx,
        prog_name: b.prog_name,
        pemesan_nama: b.pemesan_nama || '-',
        nama: j.nama || '(formulir belum diisi)',
        jk: j.jk || null,
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

// Berapa jamaah (per item, memperhitungkan gender) yang MASIH butuh kit-nya
// dikirim — dipakai buat cekItemPerluDipesan(). "Masih butuh" = status belum
// 'dikirim'/'diterima', tanpa batas waktu keberangkatan (dikonfirmasi user).
export async function hitungKebutuhanPerItem(pool, items) {
  const jamaahList = await daftarJamaahPerluKit(pool);
  const belumDikirim = jamaahList.filter(j => j.status !== 'dikirim' && j.status !== 'diterima');

  const kebutuhan = new Map(items.map(it => [it.id, 0]));
  for (const j of belumDikirim) {
    for (const it of itemUntukGender(items, j.jk)) {
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

// Update status pengiriman 1 jamaah. Kalau maju ke 'dikirim', catat ledger
// 'out' + kurangi stok_saat_ini utk tiap item yang berlaku ke gender jamaah
// itu (transaksi — stok & status harus konsisten, gak boleh nyangkut separuh).
export async function tandaiPengirimanJamaah(pool, { bookingId, jamaahIdx, jk, statusBaru, catatan, actorId }) {
  const URUTAN_STATUS = ['belum_diproses', 'disiapkan', 'dikirim', 'diterima'];
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
      const applicable = itemUntukGender(items, jk);
      for (const it of applicable) {
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

// Tambah stok masuk (pembelian/restock) — super_admin only, dipanggil dari
// API route. Ledger 'in' + update cache stok_saat_ini dalam 1 transaksi.
export async function tambahStokMasuk(pool, { itemId, qty, keterangan, actorId }) {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw Object.assign(new Error('Qty harus angka bulat positif'), { status: 400 });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id FROM perlengkapan_jamaah WHERE id = ? FOR UPDATE', [itemId]);
    if (rows.length === 0) throw Object.assign(new Error('Item tidak ditemukan'), { status: 404 });
    await conn.query(
      `INSERT INTO perlengkapan_stok_ledger (item_id, tipe, qty, keterangan, input_oleh) VALUES (?, 'in', ?, ?, ?)`,
      [itemId, qty, keterangan || null, actorId || null]
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
