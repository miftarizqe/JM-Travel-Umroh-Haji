import { statusJamaah } from '@/app/api/admin/database/route';

// Samarkan nama buat ditampilin ke calon pendaftar SEBELUM akun dibuat
// (popup cek NIK di /register, dikonfirmasi user 2026-10-17) — biar mereka
// bisa self-verify "oh iya ini saya" tanpa endpoint publik ini bocorin nama
// lengkap orang lain cuma modal coba-coba NIK. Huruf pertama & terakhir tiap
// kata tetap kelihatan, tengahnya diganti bintang — "Ahmad Budiman" jadi
// "A***d B******n".
export function samarkanNama(nama) {
  return String(nama || '').trim().split(/\s+/).filter(Boolean).map(w => {
    if (w.length <= 2) return w;
    return w[0] + '*'.repeat(w.length - 2) + w[w.length - 1];
  }).join(' ');
}

// Cek NIK pernah tercatat SUDAH BERANGKAT umroh bersama JM Travel — dipakai
// buat gerbang "eligible daftar Perwakilan tanpa kode referral" (dikonfirmasi
// user 2026-09-06). Balikin { pernahUmroh, namaMasked }.
export async function cekRiwayatUmroh(pool, nik) {
  const nikTrim = String(nik || '').trim();
  if (nikTrim.length !== 16) return { pernahUmroh: false, namaMasked: null };
  const [bookings] = await pool.query(
    `SELECT status, jamaah_data FROM bookings WHERE jamaah_data IS NOT NULL`
  );
  for (const b of bookings) {
    let jd = b.jamaah_data;
    if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
    if (!Array.isArray(jd)) continue;
    const match = jd.find(j => (j.nik || '').trim() === nikTrim);
    if (match && statusJamaah(b.status) === 'Sudah Berangkat') {
      return { pernahUmroh: true, namaMasked: samarkanNama(match.nama) };
    }
  }
  return { pernahUmroh: false, namaMasked: null };
}

// Dipakai server-side pas POST /api/auth/register beneran nyimpen akun
// perwakilan (dikonfirmasi user 2026-10-17) — sebelumnya cuma dicek di
// /register lewat fetch /api/cek-riwayat-umroh buat live-feedback UI, TAPI
// gak pernah divalidasi ulang di sini, jadi POST langsung ke endpoint bisa
// bikin akun perwakilan tanpa referral & tanpa riwayat umroh sama sekali.
export async function pernahBerangkatUmroh(pool, nik) {
  return (await cekRiwayatUmroh(pool, nik)).pernahUmroh;
}
