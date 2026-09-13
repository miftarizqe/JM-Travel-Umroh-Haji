import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/perwakilan/kalkulator             -> daftar quote milik sendiri (semua status)
// GET /api/perwakilan/kalkulator?id=123      -> 1 quote (buat lanjutin edit draft)
export async function GET(request) {
  const auth = wajibRole(request, ['perwakilan']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    let query = `
      SELECT l.*, t.nama AS template_nama
      FROM kalkulator_perwakilan_lead l
      JOIN kalkulator_template_publik t ON t.id = l.template_id
      WHERE l.perwakilan_id = ?`;
    const params = [auth.user.id];
    if (id) { query += ' AND l.id = ?'; params.push(id); }
    query += ' ORDER BY l.created_at DESC';

    const [rows] = await pool.query(query, params);
    if (id) {
      if (rows.length === 0) return Response.json({ error: 'Quote tidak ditemukan' }, { status: 404 });
      return Response.json({ lead: rows[0] });
    }
    return Response.json({ leads: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
