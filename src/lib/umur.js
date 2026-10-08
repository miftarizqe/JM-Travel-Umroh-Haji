// Hitung umur (tahun penuh) dari tanggal lahir — dipakai form-jamaah (cek
// NIK wajib >17) & pendaftaran Sahabat Baitullah/Perwakilan (cek minimal
// 17 tahun buat jadi pendaftar, dikonfirmasi user 2026-10-08).
export function hitungUmur(tgl) {
  if (!tgl) return null;
  const lahir = new Date(tgl);
  if (isNaN(lahir)) return null;
  const now = new Date();
  let umur = now.getFullYear() - lahir.getFullYear();
  const m = now.getMonth() - lahir.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < lahir.getDate())) umur--;
  return umur;
}
