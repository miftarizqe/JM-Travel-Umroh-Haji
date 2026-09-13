import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// CRUD Master Harga Tiket Pesawat — super_admin only (data biaya vendor,
// level akses sama kayak modul-negara/kalkulator-template). Sumber buat
// "Isi dari Master" di KalkulatorTerpadu.jsx — SNAPSHOT/copy doang, bukan
// live-link (lihat komentar sama di master-hotel-rate/route.js).

// GET /api/admin/master-tiket-rate            -> semua (termasuk nonaktif)
// GET /api/admin/master-tiket-rate?aktif=1    -> cuma yang aktif
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const aktifSaja = searchParams.get('aktif');

    let query = 'SELECT * FROM master_tiket_rate WHERE 1=1';
    const params = [];
    if (aktifSaja) { query += ' AND aktif = 1'; }
    query += ' ORDER BY urutan ASC, nama_rute ASC';

    const [rows] = await pool.query(query, params);
    return Response.json({ rate: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/master-tiket-rate
// body: { nama_rute, kota_asal?, kota_tujuan?, rute?, negara_transit_id?, periode_mulai?, periode_selesai?, rate, mata_uang?, urutan? }
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { nama_rute, kota_asal, kota_tujuan, rute, negara_transit_id, periode_mulai, periode_selesai, berlaku_sampai, rate, mata_uang, urutan } = await request.json();
    if (!nama_rute?.trim()) {
      return Response.json({ error: 'Nama rute wajib diisi' }, { status: 400 });
    }
    const [result] = await pool.query(
      `INSERT INTO master_tiket_rate (nama_rute, kota_asal, kota_tujuan, rute, negara_transit_id, periode_mulai, periode_selesai, berlaku_sampai, rate, mata_uang, urutan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nama_rute.trim(), kota_asal?.trim() || null, kota_tujuan?.trim() || null, rute || null, rute === 'transit' ? (negara_transit_id || null) : null, periode_mulai || null, periode_selesai || null, berlaku_sampai || null, Number(rate) || 0, mata_uang || 'IDR', Number(urutan) || 0]
    );
    return Response.json({ message: 'Master tiket tersimpan!', id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/master-tiket-rate
// body: { id, nama_rute?, kota_asal?, kota_tujuan?, rute?, negara_transit_id?, periode_mulai?, periode_selesai?, rate?, mata_uang?, urutan?, aktif? }
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, nama_rute, kota_asal, kota_tujuan, rute, negara_transit_id, periode_mulai, periode_selesai, berlaku_sampai, rate, mata_uang, urutan, aktif } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const set = [];
    const params = [];
    if (nama_rute != null) { set.push('nama_rute = ?'); params.push(nama_rute.trim()); }
    if (kota_asal !== undefined) { set.push('kota_asal = ?'); params.push(kota_asal?.trim() || null); }
    if (kota_tujuan !== undefined) { set.push('kota_tujuan = ?'); params.push(kota_tujuan?.trim() || null); }
    if (rute !== undefined) { set.push('rute = ?'); params.push(rute || null); }
    // negara_transit_id cuma masuk akal kalau rute='transit' — dikosongin
    // otomatis kalau rute-nya diubah jadi bukan transit (dikirim bareng
    // rute di body yang sama, lihat simpanHarga() di master-data/page.jsx).
    if (negara_transit_id !== undefined) { set.push('negara_transit_id = ?'); params.push(rute === 'transit' ? (negara_transit_id || null) : null); }
    if (periode_mulai !== undefined) { set.push('periode_mulai = ?'); params.push(periode_mulai || null); }
    if (periode_selesai !== undefined) { set.push('periode_selesai = ?'); params.push(periode_selesai || null); }
    if (berlaku_sampai !== undefined) { set.push('berlaku_sampai = ?'); params.push(berlaku_sampai || null); }
    if (rate != null) { set.push('rate = ?'); params.push(Number(rate) || 0); }
    if (mata_uang != null) { set.push('mata_uang = ?'); params.push(mata_uang); }
    if (urutan != null) { set.push('urutan = ?'); params.push(Number(urutan) || 0); }
    if (aktif != null) { set.push('aktif = ?'); params.push(aktif ? 1 : 0); }
    if (set.length === 0) return Response.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

    params.push(id);
    const [result] = await pool.query(`UPDATE master_tiket_rate SET ${set.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Master tiket diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/master-tiket-rate?id=xxx
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const [result] = await pool.query('DELETE FROM master_tiket_rate WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Master tiket dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
