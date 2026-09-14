import { modulNegaraRepository as repo } from './repository';

function errorDenganStatus(pesan, status) {
  const error = new Error(pesan);
  error.status = status;
  return error;
}

export const modulNegaraService = {
  async daftar({ semua, full } = {}) {
    const modul = await repo.semua({ semua });
    if (full && modul.length > 0) {
      const modulIds = modul.map(m => m.id);
      const [tiers, addons] = await Promise.all([
        repo.tiersUntukModul(modulIds),
        repo.addonsUntukModul(modulIds),
      ]);
      const tiersByModul = new Map();
      for (const t of tiers) {
        if (!tiersByModul.has(t.modul_negara_id)) tiersByModul.set(t.modul_negara_id, []);
        tiersByModul.get(t.modul_negara_id).push(t);
      }
      const addonsByModul = new Map();
      for (const a of addons) {
        if (!addonsByModul.has(a.modul_negara_id)) addonsByModul.set(a.modul_negara_id, []);
        addonsByModul.get(a.modul_negara_id).push(a);
      }
      for (const m of modul) {
        m.tiers = tiersByModul.get(m.id) || [];
        m.addons = addonsByModul.get(m.id) || [];
      }
    }
    return modul;
  },

  async tambah(data) {
    if (!data.nama?.trim()) throw errorDenganStatus('Nama wajib diisi', 400);
    return repo.simpan(data);
  },

  async ubah(id, data) {
    if (!id || !data.nama?.trim()) throw errorDenganStatus('Data tidak lengkap', 400);
    const affectedRows = await repo.perbarui(id, data);
    if (affectedRows === 0) throw errorDenganStatus('Data tidak ditemukan', 404);
  },

  // Tier ikut kehapus otomatis (ON DELETE CASCADE). modul_tambahan di
  // biaya_breakdown itu JSON polos (BUKAN foreign key), jadi DB gak
  // otomatis nolak kayak Item Master — dicek manual dulu di sini biar gak
  // ninggalin referensi mati yang bikin costing template/program diem-diem
  // salah hitung.
  async hapus(idMentah) {
    const id = Number(idMentah);
    if (!id) throw errorDenganStatus('Parameter id wajib diisi', 400);

    const rows = await repo.cariPemakaiModulTambahan();
    const pemakai = new Set();
    for (const r of rows) {
      let arr = r.modul_tambahan;
      if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
      if (!Array.isArray(arr)) arr = arr?.modul_negara_id ? [arr] : [];
      if (arr.some(e => Number(e?.modul_negara_id) === id)) {
        pemakai.add(r.is_template ? `Template "${r.nama}"` : `Program "${r.program_nama || r.nama}"`);
      }
    }
    if (pemakai.size > 0) {
      throw errorDenganStatus(`Modul ini masih dipakai di: ${[...pemakai].join(', ')}. Nonaktifkan aja daripada dihapus, atau lepas dulu tautannya di sana kalau memang mau dihapus permanen.`, 409);
    }

    try {
      const affectedRows = await repo.hapus(id);
      if (affectedRows === 0) throw errorDenganStatus('Data tidak ditemukan', 404);
    } catch (error) {
      if (error.status) throw error;
      if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
        throw errorDenganStatus('Modul negara ini masih ditautkan ke Item Master/breakdown biaya — nonaktifkan saja, atau lepas dulu tautannya sebelum dihapus.', 409);
      }
      throw error;
    }
  },
};
