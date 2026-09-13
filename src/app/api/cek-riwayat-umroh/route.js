import pool from '@/lib/db';
import { statusJamaah } from '@/app/api/admin/database/route';

// GET /api/cek-riwayat-umroh?nik=xxx — PUBLIK (dipanggil dari halaman
// /register sebelum akun ada, gak ada sesi login) buat cek apakah NIK yang
// baru diketik calon pendaftar pernah tercatat SUDAH BERANGKAT umroh
// bersama JM Travel (dikonfirmasi user 2026-09-06) — dipakai buat gerbang
// "eligible daftar Perwakilan tanpa kode referral". SENGAJA cuma balikin
// boolean, TIDAK ADA data pribadi/detail booking yang di-expose — endpoint
// publik tanpa login jangan sampai jadi oracle buat ngintip siapa aja yang
// pernah umroh cuma modal coba-coba NIK.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const nik = (searchParams.get('nik') || '').trim();
  if (!nik || nik.length < 16) return Response.json({ pernahUmroh: false });

  try {
    const [bookings] = await pool.query(
      `SELECT status, jamaah_data FROM bookings WHERE jamaah_data IS NOT NULL`
    );
    for (const b of bookings) {
      let jd = b.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      if (!Array.isArray(jd)) continue;
      const match = jd.some(j => (j.nik || '').trim() === nik);
      if (match && statusJamaah(b.status) === 'Sudah Berangkat') {
        return Response.json({ pernahUmroh: true });
      }
    }
    return Response.json({ pernahUmroh: false });
  } catch (error) {
    console.error(error);
    return Response.json({ pernahUmroh: false });
  }
}
