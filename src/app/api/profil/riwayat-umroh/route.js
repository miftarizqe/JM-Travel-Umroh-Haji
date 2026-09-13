import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { statusJamaah } from '@/app/api/admin/database/route';

// GET /api/profil/riwayat-umroh — riwayat perjalanan umroh akun sendiri,
// dicocokkan by NIK ke jamaah_data SEMUA booking (dikonfirmasi user
// 2026-09-06) — termasuk booking yang dulu dia "numpang" di akun orang lain
// (sebelum dia sendiri bikin akun sendiri, NIK-nya udah tertulis di formulir
// jamaah booking itu). Cuma balikin nama program/tanggal/status, SENGAJA
// gak expose detail booking/kontak pemesan lama (privasi orang lain) —
// mirror ambilJamaah() di admin/database/route.js tapi discope ke 1 NIK.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[me]] = await pool.query('SELECT nik FROM users WHERE id = ?', [auth.user.id]);
    const nik = (me?.nik || '').trim();
    if (!nik) return Response.json({ riwayat: [] });

    const [bookings] = await pool.query(
      `SELECT b.status, b.jamaah_data, b.created_at, b.prog_name, p.tanggal_berangkat
       FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.jamaah_data IS NOT NULL`
    );

    const riwayat = [];
    for (const b of bookings) {
      let jd = b.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      if (!Array.isArray(jd)) continue;
      const match = jd.some(j => (j.nik || '').trim() === nik);
      if (match) {
        riwayat.push({
          prog_name: b.prog_name || '-',
          tanggal_berangkat: b.tanggal_berangkat,
          status_jamaah: statusJamaah(b.status),
          created_at: b.created_at,
        });
      }
    }
    riwayat.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return Response.json({ riwayat });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
