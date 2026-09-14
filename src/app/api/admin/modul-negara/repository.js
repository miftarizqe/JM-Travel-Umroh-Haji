import pool from '@/lib/db';

class ModulNegaraRepository {
  async semua({ semua } = {}) {
    const where = semua ? ' WHERE 1=1' : ' WHERE aktif = 1';
    const [modul] = await pool.query(`SELECT * FROM modul_negara ${where} ORDER BY urutan ASC, id ASC`);
    return modul;
  }

  async tiersUntukModul(modulIds) {
    const [tiers] = await pool.query(
      'SELECT * FROM modul_negara_tier WHERE modul_negara_id IN (?) ORDER BY urutan ASC, id ASC',
      [modulIds]
    );
    return tiers;
  }

  async addonsUntukModul(modulIds) {
    const [addons] = await pool.query(
      'SELECT * FROM modul_negara_addon WHERE modul_negara_id IN (?) ORDER BY urutan ASC, id ASC',
      [modulIds]
    );
    return addons;
  }

  async simpan({ nama, mata_uang, pakai_periode, pakai_hotel_star, info_hotel, pakai_city_tour_opsi, urutan, itinerary_per_hari, include_exclude, tl_gratis_min_pax }) {
    const [result] = await pool.query(
      'INSERT INTO modul_negara (nama, mata_uang, pakai_periode, pakai_hotel_star, info_hotel, pakai_city_tour_opsi, urutan, itinerary_per_hari, include_exclude, tl_gratis_min_pax) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nama.trim(), mata_uang || 'USD', pakai_periode ? 1 : 0, pakai_hotel_star ? 1 : 0, info_hotel?.trim() || null, pakai_city_tour_opsi ? 1 : 0, Number(urutan) || 0,
        itinerary_per_hari && Object.keys(itinerary_per_hari).length > 0 ? JSON.stringify(itinerary_per_hari) : null,
        include_exclude && Object.keys(include_exclude).length > 0 ? JSON.stringify(include_exclude) : null,
        Number(tl_gratis_min_pax) > 0 ? Number(tl_gratis_min_pax) : null]
    );
    return result.insertId;
  }

  async perbarui(id, { nama, mata_uang, pakai_periode, pakai_hotel_star, info_hotel, pakai_city_tour_opsi, urutan, aktif, itinerary_per_hari, include_exclude, tl_gratis_min_pax }) {
    const [result] = await pool.query(
      'UPDATE modul_negara SET nama = ?, mata_uang = ?, pakai_periode = ?, pakai_hotel_star = ?, info_hotel = ?, pakai_city_tour_opsi = ?, urutan = ?, aktif = ?, itinerary_per_hari = ?, include_exclude = ?, tl_gratis_min_pax = ? WHERE id = ?',
      [nama.trim(), mata_uang || 'USD', pakai_periode ? 1 : 0, pakai_hotel_star ? 1 : 0, info_hotel?.trim() || null, pakai_city_tour_opsi ? 1 : 0, Number(urutan) || 0, aktif ? 1 : 0,
        itinerary_per_hari && Object.keys(itinerary_per_hari).length > 0 ? JSON.stringify(itinerary_per_hari) : null,
        include_exclude && Object.keys(include_exclude).length > 0 ? JSON.stringify(include_exclude) : null,
        Number(tl_gratis_min_pax) > 0 ? Number(tl_gratis_min_pax) : null, id]
    );
    return result.affectedRows;
  }

  async cariPemakaiModulTambahan() {
    const [rows] = await pool.query(
      `SELECT bb.nama, bb.is_template, bb.modul_tambahan, p.name AS program_nama
       FROM biaya_breakdown bb LEFT JOIN programs p ON p.id = bb.program_id
       WHERE bb.modul_tambahan IS NOT NULL`
    );
    return rows;
  }

  async hapus(id) {
    const [result] = await pool.query('DELETE FROM modul_negara WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

export const modulNegaraRepository = new ModulNegaraRepository();
