// Aturan isian formulir jamaah (/form-jamaah) — dipakai FE buat batasi ketikan
// & validasi sebelum submit (dikonfirmasi user 2026-10-01). Validasi server
// BELUM ada: semua perubahan backend wajib di Go (jm-travel-api), sedangkan
// PATCH /api/bookings/[id] belum di-port ke Go — pasang di sana begitu di-port.

// Pilihan "Hubungan" kontak darurat — sumber utamanya endpoint Go
// GET /api/master/hubungan-kontak-darurat (internal/cms di jm-travel-api).
// Daftar ini cuma fallback kalau fetch gagal — kalau mengubah, ubah di Go
// juga biar sama.
export const HUBUNGAN_KONTAK_DARURAT = [
  'Suami/Istri',
  'Orang Tua',
  'Anak',
  'Saudara Kandung',
  'Kerabat',
  'Teman',
  'Lainnya',
];

// No. WA: angka saja, 10-13 digit (sama dengan batas form registrasi).
export const WA_MAKS = 13;
const WA_REGEX = /^[0-9]{10,13}$/;

// No. paspor RI: huruf kapital + angka (mis. C1234567 / X1234567), 8-9
// karakter. Sengaja BUKAN angka saja — paspor Indonesia selalu diawali huruf.
export const PASPOR_MAKS = 9;
const PASPOR_REGEX = /^[A-Z][A-Z0-9]{7,8}$/;

// Pembersih ketikan (FE): buang karakter yang gak boleh sebelum masuk state.
export const hanyaAngka = (v, maks = WA_MAKS) => String(v || '').replace(/\D/g, '').slice(0, maks);
export const bersihkanPaspor = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, PASPOR_MAKS);

// Validasi 1 jamaah — balikin pesan error pertama, atau null kalau lolos.
// Field kosong gak dicek di sini (wajib-isi dicek terpisah di form).
export function validasiIsianJamaah(j, label = 'Jamaah') {
  if (j.paspor && !PASPOR_REGEX.test(j.paspor)) {
    return `${label}: No. Paspor harus diawali huruf, lalu huruf/angka, total 8-9 karakter (contoh: C1234567).`;
  }
  if (j.wa && !WA_REGEX.test(j.wa)) return `${label}: No. WhatsApp harus angka saja, 10-13 digit.`;
  if (j.kdwa && !WA_REGEX.test(j.kdwa)) return `${label}: No. WA Kontak Darurat harus angka saja, 10-13 digit.`;
  if (j.kdhub && !HUBUNGAN_KONTAK_DARURAT.includes(j.kdhub)) return `${label}: Hubungan Kontak Darurat tidak valid.`;
  return null;
}
