const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];

// Harga termurah utk 1 paket (dari 3 kombinasi kamar). Fallback ke kolom
// harga_<paket> lama kalau kombinasi kamar belum keisi (program lawas).
export function hargaTermurahPaket(prog, paket) {
  const nilai = KAMAR
    .map(k => Number(prog?.[`harga_${paket}_${k}`] || 0))
    .filter(v => v > 0);
  if (nilai.length > 0) return Math.min(...nilai);
  return Number(prog?.[`harga_${paket}`] || 0);
}

// Harga termurah program (dari semua 9 kombinasi paket x kamar) — dipakai
// buat label "Mulai dari" di tampilan depan (list program, homepage, dst).
export function hargaTermurahProgram(prog) {
  const semua = PAKET.map(p => hargaTermurahPaket(prog, p)).filter(v => v > 0);
  return semua.length > 0 ? Math.min(...semua) : 0;
}
