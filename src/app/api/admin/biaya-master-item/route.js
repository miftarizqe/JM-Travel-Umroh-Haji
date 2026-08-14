import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/biaya-master-item?semua=1 — default cuma yang aktif
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const semua = searchParams.get('semua') === '1';
    const [rows] = await pool.query(
      `SELECT * FROM biaya_master_item ${semua ? '' : 'WHERE aktif = 1'} ORDER BY kelompok ASC, urutan ASC, id ASC`
    );
    return Response.json({ item: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah item master baru
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { kelompok, nama, keterangan, harga_default, mata_uang, basis_default, trigger_kunci, modul_negara_id, urutan } = await request.json();
    if (!kelompok?.trim() || !nama?.trim()) return Response.json({ error: 'Kelompok & nama wajib diisi' }, { status: 400 });
    const [result] = await pool.query(
      'INSERT INTO biaya_master_item (kelompok, nama, keterangan, harga_default, mata_uang, basis_default, trigger_kunci, modul_negara_id, urutan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [kelompok.trim(), nama.trim(), keterangan?.trim() || null, Number(harga_default) || 0, mata_uang || 'IDR', basis_default || 'jamaah', trigger_kunci || null, modul_negara_id || null, Number(urutan) || 0]
    );
    return Response.json({ message: 'Item master ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update item master
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, kelompok, nama, keterangan, harga_default, mata_uang, basis_default, trigger_kunci, modul_negara_id, urutan, aktif } = await request.json();
    if (!id || !kelompok?.trim() || !nama?.trim()) return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    const [result] = await pool.query(
      'UPDATE biaya_master_item SET kelompok = ?, nama = ?, keterangan = ?, harga_default = ?, mata_uang = ?, basis_default = ?, trigger_kunci = ?, modul_negara_id = ?, urutan = ?, aktif = ? WHERE id = ?',
      [kelompok.trim(), nama.trim(), keterangan?.trim() || null, Number(harga_default) || 0, mata_uang || 'IDR', basis_default || 'jamaah', trigger_kunci || null, modul_negara_id || null, Number(urutan) || 0, aktif ? 1 : 0, id]
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Item master diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });
    const [result] = await pool.query('DELETE FROM biaya_master_item WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Item master dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
