import pool from '@/lib/db';

class ModulNegaraTierRepository {
  async untukModul(modulNegaraId) {
    const [tiers] = await pool.query(
      'SELECT * FROM modul_negara_tier WHERE modul_negara_id = ? ORDER BY urutan ASC, id ASC',
      [modulNegaraId]
    );
    return tiers;
  }

  async gantiSemua(modulNegaraId, tiers) {
    await pool.query('DELETE FROM modul_negara_tier WHERE modul_negara_id = ?', [modulNegaraId]);
    for (const [i, t] of tiers.entries()) {
      if (t.hari === '' || t.hari == null || t.pax_min === '' || t.pax_min == null || t.harga_per_pax === '' || t.harga_per_pax == null) continue;
      await pool.query(
        'INSERT INTO modul_negara_tier (modul_negara_id, periode_mulai, periode_selesai, berlaku_sampai, hotel_star, city_tour_opsi, hari, pax_min, pax_max, harga_per_pax, urutan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [modulNegaraId, t.periode_mulai || null, t.periode_selesai || null, t.berlaku_sampai || null, t.hotel_star || null, t.city_tour_opsi || null, Number(t.hari), Number(t.pax_min), t.pax_max === '' || t.pax_max == null ? null : Number(t.pax_max), Number(t.harga_per_pax), i]
      );
    }
  }
}

export const modulNegaraTierRepository = new ModulNegaraTierRepository();
