import pool from '@/lib/db';

// GET /api/skema-pembayaran — PUBLIK, dipakai landing page
export async function GET() {
  try {
    const [rows] = await pool.query(
      'SELECT id, judul, deskripsi, pesan_wa FROM skema_pembayaran WHERE aktif = 1 ORDER BY urutan ASC'
    );
    return Response.json({ skema: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
