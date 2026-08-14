import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/modul-negara-addon?modul_negara_id=X — daftar addon 1 modul
// (semua, aktif & nonaktif — filter aktif dilakukan di sisi kalkulator, bukan di sini)
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const modulNegaraId = Number(searchParams.get('modul_negara_id'));
    if (!modulNegaraId) return Response.json({ error: 'Parameter modul_negara_id wajib diisi' }, { status: 400 });
    const [addons] = await pool.query(
      'SELECT * FROM modul_negara_addon WHERE modul_negara_id = ? ORDER BY urutan ASC, id ASC',
      [modulNegaraId]
    );
    return Response.json({ addons });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — ganti SELURUH addon 1 modul sekaligus (DELETE semua + bulk INSERT),
// pola yang sama kayak modul_negara_tier.
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { modul_negara_id, addons } = await request.json();
    const modulNegaraId = Number(modul_negara_id);
    if (!modulNegaraId) return Response.json({ error: 'Parameter modul_negara_id wajib diisi' }, { status: 400 });

    await pool.query('DELETE FROM modul_negara_addon WHERE modul_negara_id = ?', [modulNegaraId]);
    for (const [i, a] of (addons || []).entries()) {
      if (!a.nama?.trim()) continue;
      await pool.query(
        'INSERT INTO modul_negara_addon (modul_negara_id, nama, mata_uang, harga_per_unit, basis, sertakan_tl, urutan, aktif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [modulNegaraId, a.nama.trim(), a.mata_uang || 'USD', Number(a.harga_per_unit) || 0, a.basis || 'per_pax', a.sertakan_tl === false ? 0 : 1, i, a.aktif ? 1 : 0]
      );
    }

    return Response.json({ message: 'Biaya tambahan disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
