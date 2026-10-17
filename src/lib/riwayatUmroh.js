import { statusJamaah } from '@/app/api/admin/database/route';

// Cek NIK pernah tercatat SUDAH BERANGKAT umroh bersama JM Travel — dipakai
// buat gerbang "eligible daftar Perwakilan tanpa kode referral" (dikonfirmasi
// user 2026-09-06). Dipisah dari /api/cek-riwayat-umroh (yang cuma pembacaan
// publik buat live-feedback di /register) supaya POST /api/auth/register
// bisa validasi NIK yang BENERAN disubmit di server, bukan percaya klaim
// `pernahUmroh` dari body (dikonfirmasi user 2026-10-17 — sebelumnya cuma
// nudge UI, bisa dilewatin kalau request API dipanggil langsung).
export async function pernahBerangkatUmroh(pool, nik) {
  const nikTrim = String(nik || '').trim();
  if (nikTrim.length !== 16) return false;
  const [bookings] = await pool.query(
    `SELECT status, jamaah_data FROM bookings WHERE jamaah_data IS NOT NULL`
  );
  for (const b of bookings) {
    let jd = b.jamaah_data;
    if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
    if (!Array.isArray(jd)) continue;
    const match = jd.some(j => (j.nik || '').trim() === nikTrim);
    if (match && statusJamaah(b.status) === 'Sudah Berangkat') return true;
  }
  return false;
}
