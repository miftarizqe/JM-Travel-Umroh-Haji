import { masterHotelRepository as repo } from './repository';

function errorDenganStatus(pesan, status) {
  const error = new Error(pesan);
  error.status = status;
  return error;
}

// Logic bisnis (Service) — validasi + orkestrasi. Gak tau apa-apa soal
// HTTP (Request/Response) atau SQL, cuma manggil repository.
export const masterHotelService = {
  async daftar({ kota } = {}) {
    const hotel = await repo.semua({ kota });
    if (hotel.length > 0) {
      const periode = await repo.periodeUntukHotel(hotel.map(h => h.id));
      for (const h of hotel) h.periode = periode.filter(p => p.master_hotel_id === h.id);
    }
    return hotel;
  },

  async tambah({ kota, bintang, nama_hotel, urutan }) {
    if (!kota || !bintang || !nama_hotel?.trim()) {
      throw errorDenganStatus('Kota, bintang, dan nama hotel wajib diisi', 400);
    }
    return repo.simpan({ kota, bintang, nama_hotel, urutan });
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
