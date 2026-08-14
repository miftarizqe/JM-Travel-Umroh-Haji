import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { cekItemPerluDipesan, hitungKebutuhanPerItem, tambahStokMasuk } from '@/lib/perlengkapan';

// GET /api/admin/perlengkapan — daftar item + stok + status perlu-pesan.
// KHUSUS super_admin (detail stok & ambang reorder tidak boleh dilihat
// admin operasional biasa — beda dengan status pengiriman per-jamaah yang
// ada di /api/admin/perlengkapan-pengiriman, itu admin biasa boleh akses).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const [items] = await pool.query('SELECT * FROM perlengkapan_jamaah ORDER BY urutan');
    const kebutuhan = await hitungKebutuhanPerItem(pool, items);
    const perluDipesanIds = new Set((await cekItemPerluDipesan(pool)).map(i => i.id));

    const hasil = items.map(it => ({
      ...it,
      kebutuhan_mendatang: kebutuhan.get(it.id) || 0,
      perlu_dipesan: perluDipesanIds.has(it.id),
    }));
    return Response.json({ items: hasil });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/perlengkapan  body: { item_id, qty, keterangan } — catat
// stok masuk (restock/pembelian).
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { item_id, qty, keterangan } = await request.json();
    if (!item_id || !qty) return Response.json({ error: 'item_id dan qty wajib diisi' }, { status: 400 });
    await tambahStokMasuk(pool, { itemId: item_id, qty: Number(qty), keterangan, actorId: auth.user.id });
    return Response.json({ message: 'Stok masuk dicatat!' });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}

// PUT /api/admin/perlengkapan  body: { id, stok_minimum?, gender_spesifik?, aktif? }
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id, stok_minimum, gender_spesifik, aktif } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    if (gender_spesifik && !['semua', 'laki', 'perempuan'].includes(gender_spesifik)) {
      return Response.json({ error: 'gender_spesifik tidak valid' }, { status: 400 });
    }

    const set = [];
    const params = [];
    if (stok_minimum != null) { set.push('stok_minimum = ?'); params.push(Number(stok_minimum)); }
    if (gender_spesifik) { set.push('gender_spesifik = ?'); params.push(gender_spesifik); }
    if (aktif != null) { set.push('aktif = ?'); params.push(aktif ? 1 : 0); }
    if (set.length === 0) return Response.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

    params.push(id);
    const [result] = await pool.query(`UPDATE perlengkapan_jamaah SET ${set.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Item diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
