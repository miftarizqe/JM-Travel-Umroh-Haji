import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/form-jamaah/cari-riwayat?nik=xxx  ATAU  ?paspor=xxx
// Exact-match doang (BUKAN search bebas) — dipakai form-jamaah buat prefill
// data jamaah yang sudah pernah isi formulir di booking lain, biar gak ketik
// ulang tiap kali umroh lagi. Cuma balikin 1 hasil kalau NIK/paspornya persis
// sama, supaya gak jadi celah buat mengintip data orang lewat coba-coba.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const nik = (searchParams.get('nik') || '').trim();
  const paspor = (searchParams.get('paspor') || '').trim().toLowerCase();
  if (!nik && !paspor) {
    return Response.json({ error: 'nik atau paspor wajib diisi' }, { status: 400 });
  }

  try {
    const [bookings] = await pool.query(
      `SELECT id AS booking_id, prog_name, jamaah_data, created_at
       FROM bookings WHERE jamaah_data IS NOT NULL ORDER BY created_at DESC`
    );

    for (const b of bookings) {
      let jd = b.jamaah_data;
      if (typeof jd === 'string') {
        try { jd = JSON.parse(jd); } catch { jd = null; }
      }
      if (!Array.isArray(jd)) continue;

      const match = jd.find(j => {
        if (nik) return (j.nik || '').trim() === nik;
        return (j.paspor || '').trim().toLowerCase() === paspor;
      });
      if (match) {
        return Response.json({
          found: true,
          data: match,
          sumber: { booking_id: b.booking_id, prog_name: b.prog_name, created_at: b.created_at },
        });
      }
    }
    return Response.json({ found: false });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
