import pool from '@/lib/db';

export async function GET() {
  try {
    const [rows] = await pool.query(
      'SELECT id, teks, icon FROM fasilitas_all_in WHERE aktif = 1 ORDER BY urutan ASC'
    );
    return Response.json({ fasilitas: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
