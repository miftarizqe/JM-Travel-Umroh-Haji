import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const KATEGORI_VALID = ['gaji', 'sewa', 'marketing', 'utilitas', 'atk_kantor', 'sistem_teknologi', 'legal_perizinan', 'lain_lain'];

// GET /api/admin/pengeluaran?from=&to=&kategori= — khusus super admin
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const kategori = searchParams.get('kategori');

    const params = [];
    let where = ' WHERE 1=1';
    if (from) { where += ' AND p.tanggal >= ?'; params.push(from); }
    if (to) { where += ' AND p.tanggal <= ?'; params.push(to); }
    if (kategori) { where += ' AND p.kategori = ?'; params.push(kategori); }

    const [rows] = await pool.query(
      `SELECT p.*, u.name AS input_oleh_nama
       FROM pengeluaran_operasional p LEFT JOIN users u ON u.id = p.input_oleh
       ${where} ORDER BY p.tanggal DESC, p.created_at DESC`,
      params
    );
    return Response.json({ pengeluaran: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah pengeluaran
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { tanggal, kategori, keterangan, nominal, bukti_path, bukti_nama } = await request.json();
    if (!tanggal || !nominal || Number(nominal) <= 0) {
      return Response.json({ error: 'Tanggal dan nominal wajib diisi' }, { status: 400 });
    }
    const kategoriFinal = KATEGORI_VALID.includes(kategori) ? kategori : 'lain_lain';
    const [result] = await pool.query(
      'INSERT INTO pengeluaran_operasional (tanggal, kategori, keterangan, nominal, bukti_path, bukti_nama, input_oleh) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tanggal, kategoriFinal, keterangan?.trim() || null, Number(nominal), bukti_path || null, bukti_nama || null, auth.user.id]
    );
    return Response.json({ message: 'Pengeluaran dicatat!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update pengeluaran
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id, tanggal, kategori, keterangan, nominal, bukti_path, bukti_nama } = await request.json();
    if (!id || !tanggal || !nominal || Number(nominal) <= 0) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const kategoriFinal = KATEGORI_VALID.includes(kategori) ? kategori : 'lain_lain';
    const [result] = await pool.query(
      'UPDATE pengeluaran_operasional SET tanggal = ?, kategori = ?, keterangan = ?, nominal = ?, bukti_path = ?, bukti_nama = ? WHERE id = ?',
      [tanggal, kategoriFinal, keterangan?.trim() || null, Number(nominal), bukti_path || null, bukti_nama || null, id]
    );
    if (result.affectedRows === 0) {
      return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    }
    return Response.json({ message: 'Pengeluaran diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });
  try {
    const [result] = await pool.query('DELETE FROM pengeluaran_operasional WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    }
    return Response.json({ message: 'Pengeluaran dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
