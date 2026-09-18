import pool from '@/lib/db';

class ModulNegaraAddonRepository {
  async untukModul(modulNegaraId) {
    const [addons] = await pool.query(
      'SELECT * FROM modul_negara_addon WHERE modul_negara_id = ? ORDER BY urutan ASC, id ASC',
      [modulNegaraId]
    );
    return addons;
  }

  async gantiSemua(modulNegaraId, addons) {
    await pool.query('DELETE FROM modul_negara_addon WHERE modul_negara_id = ?', [modulNegaraId]);
    for (const [i, a] of addons.entries()) {
      if (!a.nama?.trim()) continue;
      await pool.query(
        'INSERT INTO modul_negara_addon (modul_negara_id, nama, mata_uang, harga_per_unit, basis, sertakan_tl, urutan, aktif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [modulNegaraId, a.nama.trim(), a.mata_uang || 'USD', Number(a.harga_per_unit) || 0, a.basis || 'per_pax', a.sertakan_tl === false ? 0 : 1, i, a.aktif ? 1 : 0]
      );
    }
  }
}

export const modulNegaraAddonRepository = new ModulNegaraAddonRepository();
