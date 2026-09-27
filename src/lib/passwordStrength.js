// Indikator kekuatan password (visual doang, TIDAK menghalangi submit) — dipasang
// di form registrasi (dikonfirmasi user 2026-09-27). Aturan "kuat": >=8 karakter
// + ada huruf besar, huruf kecil, dan angka. Kurang dari itu tapi masih ada
// campuran 2 jenis karakter -> "sedang". Sisanya -> "lemah".
export function kekuatanPassword(password) {
  const p = password || '';
  const cukupPanjang = p.length >= 8;
  const adaKecil = /[a-z]/.test(p);
  const adaBesar = /[A-Z]/.test(p);
  const adaAngka = /[0-9]/.test(p);
  const jumlahJenis = [adaKecil, adaBesar, adaAngka].filter(Boolean).length;

  if (!p) return { level: 'kosong', label: '', persen: 0 };
  if (cukupPanjang && jumlahJenis === 3) return { level: 'kuat', label: 'Kuat', persen: 100 };
  if (p.length >= 6 && jumlahJenis >= 2) return { level: 'sedang', label: 'Sedang', persen: 60 };
  return { level: 'lemah', label: 'Lemah', persen: 25 };
}
