import pool from '@/lib/db';

// GET /api/opsi-tambahan?prog_id=X — PUBLIK, dipakai checkout & order-jamaah
// buat nampilin pilihan opsi tambahan MILIK PROGRAM ITU SAJA. Cuma balikin
// yang aktif.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const progId = searchParams.get('prog_id');
    if (!progId) return Response.json({ opsi: [] });
    const [rows] = await pool.query(
      'SELECT id, nama, harga, deskripsi FROM opsi_tambahan WHERE prog_id = ? AND aktif = 1 ORDER BY urutan ASC',
      [progId]
    );
    return Response.json({ opsi: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
