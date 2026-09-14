export const KOSONG_MASTER = { id: null, kelompok: '', nama: '', keterangan: '', harga_default: '', mata_uang: 'IDR', basis_default: 'jamaah', trigger_kunci: '', modul_negara_id: null, urutan: 0, aktif: true };
// Urutan kelompok sesuai sheet "Master" asli — kelompok baru yang belum ada
// di daftar ini (dibuat lewat "+ Tambah Kategori Baru") otomatis nempel di
// belakang, urut alfabet.
const URUTAN_KELOMPOK_MASTER = ['Cost Saudi (Via Mutawwif)', 'Cost Jakarta (Via Management)', 'Cost Transportation', 'Cost Tour Leader', 'Handling Alfiyah'];
export function urutkanKelompok(daftar) {
  return [...daftar].sort((a, b) => {
    const ia = URUTAN_KELOMPOK_MASTER.indexOf(a), ib = URUTAN_KELOMPOK_MASTER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}
