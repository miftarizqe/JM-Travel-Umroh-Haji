import pool from '@/lib/db';

// GET /api/perlengkapan-jamaah — PUBLIK, dipakai landing page
export async function GET() {
  try {
    const [rows] = await pool.query(
      'SELECT id, nama, deskripsi, gambar FROM perlengkapan_jamaah WHERE aktif = 1 ORDER BY urutan ASC'
    );
    return Response.json({ perlengkapan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
