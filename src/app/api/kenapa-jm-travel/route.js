import pool from '@/lib/db';

export async function GET() {
  try {
    const [rows] = await pool.query(
      'SELECT id, judul, icon, deskripsi, gambar FROM kenapa_jm_travel WHERE aktif = 1 ORDER BY urutan ASC'
    );
    return Response.json({ kenapa: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
