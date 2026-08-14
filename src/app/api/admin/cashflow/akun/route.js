import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const TIPE_VALID = ['bank', 'cash', 'emoney', 'lainnya'];

// GET /api/admin/cashflow/akun?semua=1 — default cuma yang aktif, ?semua=1 termasuk nonaktif
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const semua = searchParams.get('semua') === '1';
    const [rows] = await pool.query(
      `SELECT * FROM cashflow_akun ${semua ? '' : 'WHERE aktif = 1'} ORDER BY urutan ASC, id ASC`
    );
    return Response.json({ akun: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah akun baru
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { nama, tipe, urutan } = await request.json();
    if (!nama?.trim()) return Response.json({ error: 'Nama akun wajib diisi' }, { status: 400 });
    const tipeFinal = TIPE_VALID.includes(tipe) ? tipe : 'lainnya';
    const [result] = await pool.query(
      'INSERT INTO cashflow_akun (nama, tipe, urutan) VALUES (?, ?, ?)',
      [nama.trim(), tipeFinal, Number(urutan) || 0]
    );
    return Response.json({ message: 'Akun ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update nama/tipe/urutan/aktif
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id, nama, tipe, urutan, aktif } = await request.json();
    if (!id || !nama?.trim()) return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    const tipeFinal = TIPE_VALID.includes(tipe) ? tipe : 'lainnya';
    const [result] = await pool.query(
      'UPDATE cashflow_akun SET nama = ?, tipe = ?, urutan = ?, aktif = ? WHERE id = ?',
      [nama.trim(), tipeFinal, Number(urutan) || 0, aktif ? 1 : 0, id]
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Akun diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X — cuma boleh kalau belum pernah dipakai di transaksi manapun
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });
  try {
    const [[{ jumlah }]] = await pool.query(
      'SELECT COUNT(*) AS jumlah FROM cashflow_transaksi WHERE akun_id = ?', [id]
    );
    if (jumlah > 0) {
      return Response.json({ error: 'Akun sudah punya transaksi, nonaktifkan saja (bukan hapus)' }, { status: 400 });
    }
    const [result] = await pool.query('DELETE FROM cashflow_akun WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Akun dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
