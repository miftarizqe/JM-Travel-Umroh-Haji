// Validasi & normalisasi identitas akun (register + login).

export function nikValid(nik) {
  return /^\d{16}$/.test(nik);
}

export function emailValid(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Normalisasi nomor WA ke format "08xxxxxxxxxx" (sesuai placeholder form).
 * Menerima "08…", "628…", "+62 8…", spasi/strip. Balikin null kalau bukan
 * nomor HP Indonesia yang masuk akal.
 */
export function normalisasiWA(input) {
  let n = String(input || '').replace(/[\s\-().]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (!/^\d+$/.test(n)) return null;
  if (n.startsWith('62')) n = '0' + n.slice(2);
  else if (n.startsWith('8')) n = '0' + n;
  if (!/^08\d{7,12}$/.test(n)) return null;
  return n;
}

/**
 * Semua bentuk penulisan nomor yang sama (08…, 628…, +628…). Data lama di DB
 * bisa tersimpan dalam format mana saja, jadi cek duplikat & login via WA
 * harus mencocokkan semuanya.
 */
export function varianWA(input) {
  const n = normalisasiWA(input);
  if (!n) return [];
  const tanpaNol = n.slice(1);
  return [n, '62' + tanpaNol, '+62' + tanpaNol];
}
