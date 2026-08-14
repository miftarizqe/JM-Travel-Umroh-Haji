import pool from '@/lib/db';

// GET /api/landing-teks — PUBLIK, balikin { kunci: nilai } map biar gampang
// dipakai landing page (teks.hero_headline, dst).
export async function GET() {
  try {
    const [rows] = await pool.query('SELECT kunci, nilai FROM landing_page_teks');
    const teks = {};
    rows.forEach(r => { teks[r.kunci] = r.nilai; });
    return Response.json({ teks });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
