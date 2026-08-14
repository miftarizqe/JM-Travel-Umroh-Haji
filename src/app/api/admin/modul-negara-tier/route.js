import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/modul-negara-tier?modul_negara_id=X — daftar baris tier 1 modul
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const modulNegaraId = Number(searchParams.get('modul_negara_id'));
    if (!modulNegaraId) return Response.json({ error: 'Parameter modul_negara_id wajib diisi' }, { status: 400 });
    const [tiers] = await pool.query(
      'SELECT * FROM modul_negara_tier WHERE modul_negara_id = ? ORDER BY urutan ASC, id ASC',
      [modulNegaraId]
    );
    return Response.json({ tiers });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — ganti SELURUH baris tier 1 modul sekaligus (DELETE semua + bulk INSERT),
// pola yang sama kayak biaya_breakdown_item di biaya-breakdown/route.js.
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { modul_negara_id, tiers } = await request.json();
    const modulNegaraId = Number(modul_negara_id);
    if (!modulNegaraId) return Response.json({ error: 'Parameter modul_negara_id wajib diisi' }, { status: 400 });

    await pool.query('DELETE FROM modul_negara_tier WHERE modul_negara_id = ?', [modulNegaraId]);
    for (const [i, t] of (tiers || []).entries()) {
      if (t.hari === '' || t.hari == null || t.pax_min === '' || t.pax_min == null || t.harga_per_pax === '' || t.harga_per_pax == null) continue;
      await pool.query(
        'INSERT INTO modul_negara_tier (modul_negara_id, periode_mulai, periode_selesai, hotel_star, city_tour_opsi, hari, pax_min, pax_max, harga_per_pax, urutan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [modulNegaraId, t.periode_mulai || null, t.periode_selesai || null, t.hotel_star || null, t.city_tour_opsi || null, Number(t.hari), Number(t.pax_min), t.pax_max === '' || t.pax_max == null ? null : Number(t.pax_max), Number(t.harga_per_pax), i]
      );
    }

    return Response.json({ message: 'Tabel tier disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
