import pool from '@/lib/db';

class MasterHotelPeriodeRepository {
  async simpan({ master_hotel_id, periode_mulai, periode_selesai, berlaku_sampai, rate_double, rate_triple, rate_quad, mata_uang, urutan }) {
    const [result] = await pool.query(
      `INSERT INTO master_hotel_periode (master_hotel_id, periode_mulai, periode_selesai, berlaku_sampai, rate_double, rate_triple, rate_quad, mata_uang, urutan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [master_hotel_id, periode_mulai || null, periode_selesai || null, berlaku_sampai || null, Number(rate_double) || 0, Number(rate_triple) || 0, Number(rate_quad) || 0, mata_uang || 'SAR', Number(urutan) || 0]
    );
    return result.insertId;
  }

  async perbarui(id, { periode_mulai, periode_selesai, berlaku_sampai, rate_double, rate_triple, rate_quad, mata_uang, urutan }) {
    const set = [];
    const params = [];
    if (periode_mulai !== undefined) { set.push('periode_mulai = ?'); params.push(periode_mulai || null); }
    if (periode_selesai !== undefined) { set.push('periode_selesai = ?'); params.push(periode_selesai || null); }
    if (berlaku_sampai !== undefined) { set.push('berlaku_sampai = ?'); params.push(berlaku_sampai || null); }
    if (rate_double != null) { set.push('rate_double = ?'); params.push(Number(rate_double) || 0); }
    if (rate_triple != null) { set.push('rate_triple = ?'); params.push(Number(rate_triple) || 0); }
    if (rate_quad != null) { set.push('rate_quad = ?'); params.push(Number(rate_quad) || 0); }
    if (mata_uang != null) { set.push('mata_uang = ?'); params.push(mata_uang); }
    if (urutan != null) { set.push('urutan = ?'); params.push(Number(urutan) || 0); }
    if (set.length === 0) return { diubah: false };
    params.push(id);
    const [result] = await pool.query(`UPDATE master_hotel_periode SET ${set.join(', ')} WHERE id = ?`, params);
    return { diubah: true, affectedRows: result.affectedRows };
  }

  async hapus(id) {
    const [result] = await pool.query('DELETE FROM master_hotel_periode WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

export const masterHotelPeriodeRepository = new MasterHotelPeriodeRepository();
