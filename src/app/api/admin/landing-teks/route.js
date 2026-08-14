import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/landing-teks — semua baris, buat form admin (grouped by grup)
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query('SELECT * FROM landing_page_teks ORDER BY grup, urutan ASC');
    return Response.json({ teks: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/landing-teks  body: { updates: [{ kunci, nilai }, ...] }
// Update banyak kunci sekaligus (satu form nyimpen semua section) —
// cuma nilai yang berubah dari kunci yang udah ada, gak bisa nambah/hapus
// kunci baru dari sini (kunci dikontrol lewat migrasi, bukan lewat UI).
export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { updates } = await request.json();
    if (!Array.isArray(updates) || updates.length === 0) {
      return Response.json({ error: 'updates wajib diisi (array)' }, { status: 400 });
    }
    for (const u of updates) {
      if (!u.kunci) continue;
      await pool.query('UPDATE landing_page_teks SET nilai = ? WHERE kunci = ?', [u.nilai ?? '', u.kunci]);
    }
    return Response.json({ message: 'Teks landing page disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
