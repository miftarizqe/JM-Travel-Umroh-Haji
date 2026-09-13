import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// CRUD Periode-Rate per Master Hotel — super_admin only. Anak dari
// master_hotel (lihat master-hotel/route.js) — 1 hotel bisa punya banyak
// baris di sini, 1 per periode harga (mis. Ramadan vs low-season), biar
// nambah periode baru gak perlu bikin ulang hotelnya.

// POST /api/admin/master-hotel-periode
// body: { master_hotel_id, periode_mulai?, periode_selesai?, berlaku_sampai?, rate_double, rate_triple, rate_quad, mata_uang?, urutan? }
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { master_hotel_id, periode_mulai, periode_selesai, berlaku_sampai, rate_double, rate_triple, rate_quad, mata_uang, urutan } = await request.json();
    if (!master_hotel_id) return Response.json({ error: 'master_hotel_id wajib diisi' }, { status: 400 });
    const [result] = await pool.query(
      `INSERT INTO master_hotel_periode (master_hotel_id, periode_mulai, periode_selesai, berlaku_sampai, rate_double, rate_triple, rate_quad, mata_uang, urutan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [master_hotel_id, periode_mulai || null, periode_selesai || null, berlaku_sampai || null, Number(rate_double) || 0, Number(rate_triple) || 0, Number(rate_quad) || 0, mata_uang || 'SAR', Number(urutan) || 0]
    );
    return Response.json({ message: 'Periode tersimpan!', id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/master-hotel-periode
// body: { id, periode_mulai?, periode_selesai?, berlaku_sampai?, rate_double?, rate_triple?, rate_quad?, mata_uang?, urutan? }
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, periode_mulai, periode_selesai, berlaku_sampai, rate_double, rate_triple, rate_quad, mata_uang, urutan } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const set = [];
    const params = [];
    if (periode_mulai !== undefined) { set.push('periode_mulai = ?'); params.push(periode_mulai || null); }
    if (periode_selesai !== undefined) { set.push('periode_selesai = ?'); params.push(periode_selesai || null); }
    if (berlaku_sampai !== undefined) { set.push('berlaku_sampai = ?'); params.push(berlaku_sampai || null); }
    if (rate_double != null) { set.push('rate_double = ?'); params.push(Number(rate_double) || 0); }
    if (rate_triple != null) { set.push('rate_triple = ?'); params.push(Number(rate_triple) || 0); }
    if (rate_quad != null) { set.push('rate_quad = ?'); params.push(Number(rate_quad) || 0); }
    if (mata_uang != null) { set.push('mata_uang = ?'); params.push(mata_uang); }
    if (urutan != null) { set.push('urutan = ?'); params.push(Number(urutan) || 0); }
    if (set.length === 0) return Response.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

    params.push(id);
    const [result] = await pool.query(`UPDATE master_hotel_periode SET ${set.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Periode diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/master-hotel-periode?id=xxx
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const [result] = await pool.query('DELETE FROM master_hotel_periode WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Periode dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
