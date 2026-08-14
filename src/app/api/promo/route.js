import pool from '@/lib/db';

// GET /api/promo — PUBLIK, banner promo yang lagi aktif (kalau ada)
export async function GET() {
  try {
    const [rows] = await pool.query(
      `SELECT id, judul, deskripsi, flyer_path, kode_voucher, link, link_label
       FROM promo_banner WHERE aktif = 1 ORDER BY created_at DESC LIMIT 1`
    );
    return Response.json({ promo: rows[0] || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
