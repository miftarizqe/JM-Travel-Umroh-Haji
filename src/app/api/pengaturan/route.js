import pool from '@/lib/db';

// GET /api/pengaturan — PUBLIK, dipakai semua halaman marketing/transaksi
// (nomor WA, rekening, alamat, sosmed). Lihat migration-pengaturan-umum.sql
// buat catatan kenapa ini TIDAK dipakai di teks pasal SPKA/SPKA-Ins/SPKL.
export async function GET() {
  try {
    const [rows] = await pool.query('SELECT * FROM pengaturan WHERE id = 1');
    return Response.json({ pengaturan: rows[0] || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
