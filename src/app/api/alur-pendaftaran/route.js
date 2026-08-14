import pool from '@/lib/db';

// GET /api/alur-pendaftaran — PUBLIK, dipakai landing page
export async function GET() {
  try {
    const [rows] = await pool.query(
      'SELECT id, judul, deskripsi, icon FROM alur_pendaftaran WHERE aktif = 1 ORDER BY urutan ASC'
    );
    return Response.json({ alur: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
