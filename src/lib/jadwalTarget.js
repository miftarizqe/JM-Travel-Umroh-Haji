// Aturan jadwal Target Impian Sahabat Baitullah (catatan SYSTEM UJROH E3,
// dikerjakan 2026-10-03): kalau tanggal keberangkatan program target sudah
// lewat SEBELUM target tabungan tercapai, anggota WAJIB pilih program lain
// (lewat alur Ganti Target yang tetap di-ACC admin). Program yang jadwalnya
// sudah lewat juga tidak boleh dipilih sebagai target baru.

/** Tanggal hari ini di WIB (Asia/Jakarta), format 'YYYY-MM-DD'. */
export function hariIniWib(sekarang = new Date()) {
  return new Date(sekarang.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Normalisasi kolom DATE dari mysql2 (Date) / string ke 'YYYY-MM-DD'. */
export function keTanggal(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** true kalau tanggal keberangkatan sudah lewat (sebelum hari ini, WIB). */
export function jadwalSudahLewat(tanggalBerangkat, sekarang = new Date()) {
  const t = keTanggal(tanggalBerangkat);
  return !!t && t < hariIniWib(sekarang);
}

/**
 * Status target 1 anggota. `wajib_ganti` = target belum tercapai DAN
 * (jadwal sudah lewat ATAU programnya dinonaktifkan admin).
 */
export function statusJadwalTarget({ tanggal_berangkat, program_aktif, saldo, target }, sekarang = new Date()) {
  const terlewat = jadwalSudahLewat(tanggal_berangkat, sekarang);
  const tercapai = Number(target) > 0 && Number(saldo) >= Number(target);
  return {
    jadwal_terlewat: terlewat,
    wajib_ganti: !tercapai && (terlewat || program_aktif === false),
  };
}

// Klausa SQL program yang masih boleh dipilih sebagai target (jadwal belum
// lewat). Pakai bersama param hariIniWib().
export const SQL_JADWAL_BELUM_LEWAT = '(tanggal_berangkat IS NULL OR tanggal_berangkat >= ?)';
