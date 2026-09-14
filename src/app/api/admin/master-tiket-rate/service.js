import { masterTiketRateRepository as repo } from './repository';

function errorDenganStatus(pesan, status) {
  const error = new Error(pesan);
  error.status = status;
  return error;
}

export const masterTiketRateService = {
  async daftar({ aktifSaja } = {}) {
    return repo.semua({ aktifSaja });
  },

  async tambah(data) {
    if (!data.nama_rute?.trim()) throw errorDenganStatus('Nama rute wajib diisi', 400);
    return repo.simpan(data);
  },

  async ubah(id, data) {
    if (!id) throw errorDenganStatus('id wajib diisi', 400);
    const hasil = await repo.perbarui(id, data);
    if (!hasil.diubah) throw errorDenganStatus('Tidak ada field yang diubah', 400);
    if (hasil.affectedRows === 0) throw errorDenganStatus('Data tidak ditemukan', 404);
  },

  async hapus(id) {
    if (!id) throw errorDenganStatus('id wajib diisi', 400);
    const affectedRows = await repo.hapus(id);
    if (affectedRows === 0) throw errorDenganStatus('Data tidak ditemukan', 404);
  },
};
