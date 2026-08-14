import pool from '@/lib/db';

// GET /api/metode-pembayaran — PUBLIK, dipakai landing page & halaman
// transaksi (checkout, order-jamaah, pelunasan). Cuma balikin yang aktif.
export async function GET() {
  try {
    const [rows] = await pool.query(
      'SELECT id, nama, nomor, atas_nama, catatan, gambar_qr FROM metode_pembayaran WHERE aktif = 1 ORDER BY urutan ASC'
    );
    return Response.json({ metode: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
