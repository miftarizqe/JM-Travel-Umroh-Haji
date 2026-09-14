import pool from '@/lib/db';

class MasterTiketRateRepository {
  async semua({ aktifSaja } = {}) {
    let query = 'SELECT * FROM master_tiket_rate WHERE 1=1';
    if (aktifSaja) query += ' AND aktif = 1';
    query += ' ORDER BY urutan ASC, nama_rute ASC';
    const [rows] = await pool.query(query);
    return rows;
  }

  async simpan({ nama_rute, kota_asal, kota_tujuan, rute, negara_transit_id, periode_mulai, periode_selesai, berlaku_sampai, rate, mata_uang, urutan }) {
    const [result] = await pool.query(
      `INSERT INTO master_tiket_rate (nama_rute, kota_asal, kota_tujuan, rute, negara_transit_id, periode_mulai, periode_selesai, berlaku_sampai, rate, mata_uang, urutan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nama_rute.trim(), kota_asal?.trim() || null, kota_tujuan?.trim() || null, rute || null, rute === 'transit' ? (negara_transit_id || null) : null, periode_mulai || null, periode_selesai || null, berlaku_sampai || null, Number(rate) || 0, mata_uang || 'IDR', Number(urutan) || 0]
    );
    return result.insertId;
  }

  async perbarui(id, { nama_rute, kota_asal, kota_tujuan, rute, negara_transit_id, periode_mulai, periode_selesai, berlaku_sampai, rate, mata_uang, urutan, aktif }) {
    const set = [];
    const params = [];
    if (nama_rute != null) { set.push('nama_rute = ?'); params.push(nama_rute.trim()); }
    if (kota_asal !== undefined) { set.push('kota_asal = ?'); params.push(kota_asal?.trim() || null); }
    if (kota_tujuan !== undefined) { set.push('kota_tujuan = ?'); params.push(kota_tujuan?.trim() || null); }
    if (rute !== undefined) { set.push('rute = ?'); params.push(rute || null); }
    // negara_transit_id cuma masuk akal kalau rute='transit' — dikosongin
    // otomatis kalau rute-nya diubah jadi bukan transit (dikirim bareng
    // rute di body yang sama, lihat simpanHarga() di master-data/page.jsx).
    if (negara_transit_id !== undefined) { set.push('negara_transit_id = ?'); params.push(rute === 'transit' ? (negara_transit_id || null) : null); }
    if (periode_mulai !== undefined) { set.push('periode_mulai = ?'); params.push(periode_mulai || null); }
    if (periode_selesai !== undefined) { set.push('periode_selesai = ?'); params.push(periode_selesai || null); }
    if (berlaku_sampai !== undefined) { set.push('berlaku_sampai = ?'); params.push(berlaku_sampai || null); }
    if (rate != null) { set.push('rate = ?'); params.push(Number(rate) || 0); }
    if (mata_uang != null) { set.push('mata_uang = ?'); params.push(mata_uang); }
    if (urutan != null) { set.push('urutan = ?'); params.push(Number(urutan) || 0); }
    if (aktif != null) { set.push('aktif = ?'); params.push(aktif ? 1 : 0); }
    if (set.length === 0) return { diubah: false };
    params.push(id);
    const [result] = await pool.query(`UPDATE master_tiket_rate SET ${set.join(', ')} WHERE id = ?`, params);
    return { diubah: true, affectedRows: result.affectedRows };
  }

  async hapus(id) {
    const [result] = await pool.query('DELETE FROM master_tiket_rate WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

export const masterTiketRateRepository = new MasterTiketRateRepository();
