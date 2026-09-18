// Style constants + helper kecil yang dipakai LINTAS fitur di halaman
// Master Data (Modul Negara, Master Item, Jenis Program, Kurs, Master
// Hotel, Master Tiket). Konstanta/fungsi yang cuma dipakai 1 fitur hidup
// di file fitur itu sendiri, bukan di sini.
export const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
export const lbl = "block text-xs font-semibold text-gray-500 mb-1";
export const KOTA_LABEL = { mekkah: 'Mekkah', madinah: 'Madinah' };
export const MATA_UANG_LIST = ['IDR', 'SAR', 'USD'];
export const rp = (n) => Number(n || 0).toLocaleString('id-ID');

// Rate/tier tanpa periode_selesai ATAU berlaku_sampai keliatan "Berlaku
// selamanya" — gak ada tanda kadaluarsa sama sekali, resiko admin gak sadar
// masih makai harga vendor yang udah basi. berlaku_sampai itu FALLBACK
// (dipakai kalau periode_selesai kosong), BUKAN gantiin periode_selesai —
// batas mana pun yang keisi, itu yang dipakai buat cek kadaluarsa.
export function sudahKadaluarsa(selesai, berlakuSampai) {
  const batas = selesai || berlakuSampai;
  if (!batas) return false;
  return new Date(batas) < new Date(new Date().toDateString());
}

export function labelPeriode(mulai, selesai, berlakuSampai) {
  const f = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '?';
  const kadaluarsa = sudahKadaluarsa(selesai, berlakuSampai) ? ' · ⚠️ Kadaluarsa' : '';
  if (mulai || selesai) return `${f(mulai)} s/d ${f(selesai)}${kadaluarsa}`;
  if (berlakuSampai) return `Berlaku sampai ${f(berlakuSampai)}${kadaluarsa}`;
  return 'Berlaku selamanya';
}
