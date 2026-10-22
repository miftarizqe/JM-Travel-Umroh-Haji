// Helper format/parse input nominal uang ala Indonesia: tampil "3.000.000"
// (titik = ribuan, koma = desimal), tapi nilai yang disimpan ke state tetap
// angka mentah gaya JS ("3000000", "12.5", "-15000") supaya kode lama yang
// Number(...)-in value-nya gak perlu diubah. Dipakai komponen InputNominal.

// Rapikan nilai mentah dari state/DB: number → string, "1250.00" (DECIMAL
// MySQL) → "1250". Kalau gak desimal, dibulatkan.
export function normalisasiNominal(raw, { desimal = false } = {}) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (s === '' || s === '-') return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  if (!desimal) return String(Math.round(n));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

// Nilai mentah ("1250.5") → teks tampilan ("1.250,5"). Gak dibulatkan /
// dirapikan biar ketikan setengah jadi ("12," atau "12,0") gak loncat.
export function formatNominal(raw) {
  if (raw === null || raw === undefined) return '';
  const s = String(raw);
  if (s === '' || s === '-') return s;
  const neg = s.startsWith('-');
  const [bulat, pecahan] = s.replace(/^-/, '').split('.');
  const ribuan = (bulat || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + ribuan + (pecahan !== undefined ? ',' + pecahan : '');
}

// Teks ketikan user ("1.250,5", "Rp 3.000", "-15.000") → nilai mentah.
export function parseNominal(teks, { desimal = false, bolehMinus = false } = {}) {
  const s = String(teks ?? '');
  const neg = bolehMinus && s.trim().startsWith('-');
  let bulat, pecahan;
  if (desimal) {
    const i = s.indexOf(',');
    bulat = (i < 0 ? s : s.slice(0, i)).replace(/\D/g, '');
    pecahan = i < 0 ? undefined : s.slice(i + 1).replace(/\D/g, '').slice(0, 2);
  } else {
    bulat = s.replace(/\D/g, '');
  }
  bulat = bulat.replace(/^0+(?=\d)/, '');
  if (bulat === '' && pecahan === undefined) return neg ? '-' : '';
  return (neg ? '-' : '') + (bulat || '0') + (pecahan !== undefined ? '.' + pecahan : '');
}
