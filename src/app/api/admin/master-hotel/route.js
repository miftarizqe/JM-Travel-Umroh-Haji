import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// CRUD Master Hotel (kota + bintang + nama hotel) — super_admin only. Ini
// ENTITAS INDUK, banyak periode-rate nempel di bawahnya (lihat
// master-hotel-periode/route.js) — beda dari dulu (`master_hotel_rate`
// flat, 1 baris = 1 hotel + 1 rate + 1 periode), sekarang 1 hotel bisa
// punya banyak periode tanpa ngetik ulang nama hotelnya (dikonfirmasi user
// 2026-08-18).

// GET /api/admin/master-hotel                    -> semua (termasuk nonaktif), nested periode[]
// GET /api/admin/master-hotel?kota=mekkah         -> filter kota, cuma aktif
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const kota = searchParams.get('kota');

    let query = 'SELECT * FROM master_hotel WHERE 1=1';
    const params = [];
    if (kota) { query += ' AND kota = ? AND aktif = 1'; params.push(kota); }
    query += ' ORDER BY kota ASC, bintang ASC, urutan ASC, nama_hotel ASC';

    const [hotels] = await pool.query(query, params);
    if (hotels.length > 0) {
      const [periode] = await pool.query(
        'SELECT * FROM master_hotel_periode WHERE master_hotel_id IN (?) ORDER BY periode_mulai ASC, urutan ASC',
        [hotels.map(h => h.id)]
      );
      for (const h of hotels) h.periode = periode.filter(p => p.master_hotel_id === h.id);
    }
    return Response.json({ hotel: hotels });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/master-hotel
// body: { kota, bintang, nama_hotel, urutan? }
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { kota, bintang, nama_hotel, urutan } = await request.json();
    if (!kota || !bintang || !nama_hotel?.trim()) {
      return Response.json({ error: 'Kota, bintang, dan nama hotel wajib diisi' }, { status: 400 });
    }
    const [result] = await pool.query(
      'INSERT INTO master_hotel (kota, bintang, nama_hotel, urutan) VALUES (?, ?, ?, ?)',
      [kota, Number(bintang), nama_hotel.trim(), Number(urutan) || 0]
    );
    return Response.json({ message: 'Hotel tersimpan!', id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/master-hotel
// body: { id, kota?, bintang?, nama_hotel?, urutan?, aktif? }
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, kota, bintang, nama_hotel, urutan, aktif } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const set = [];
    const params = [];
    if (kota != null) { set.push('kota = ?'); params.push(kota); }
    if (bintang != null) { set.push('bintang = ?'); params.push(Number(bintang)); }
    if (nama_hotel != null) { set.push('nama_hotel = ?'); params.push(nama_hotel.trim()); }
    if (urutan != null) { set.push('urutan = ?'); params.push(Number(urutan) || 0); }
    if (aktif != null) { set.push('aktif = ?'); params.push(aktif ? 1 : 0); }
    if (set.length === 0) return Response.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

    params.push(id);
    const [result] = await pool.query(`UPDATE master_hotel SET ${set.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Hotel diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/master-hotel?id=xxx — ikut hapus semua periode di
// bawahnya (gak ada FK constraint di skema ini, jadi dibersihin manual).
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    await pool.query('DELETE FROM master_hotel_periode WHERE master_hotel_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM master_hotel WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Hotel dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
