import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/metode-pembayaran — semua metode (termasuk yg nonaktif)
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query('SELECT * FROM metode_pembayaran ORDER BY urutan ASC');
    return Response.json({ metode: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah metode baru di akhir daftar (urutan = MAX+1)
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { nama, nomor, atas_nama, catatan } = await request.json();
    if (!nama?.trim()) {
      return Response.json({ error: 'Nama metode wajib diisi' }, { status: 400 });
    }
    const [[{ maxUrutan }]] = await pool.query('SELECT COALESCE(MAX(urutan), 0) AS maxUrutan FROM metode_pembayaran');
    const [result] = await pool.query(
      'INSERT INTO metode_pembayaran (urutan, nama, nomor, atas_nama, catatan) VALUES (?, ?, ?, ?, ?)',
      [maxUrutan + 1, nama.trim(), nomor?.trim() || null, atas_nama?.trim() || null, catatan?.trim() || null]
    );
    return Response.json({ message: 'Metode pembayaran ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update 1 metode (nama/nomor/atas_nama/catatan/aktif)
export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, nama, nomor, atas_nama, catatan, aktif } = await request.json();
    if (!id || !nama?.trim()) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [result] = await pool.query(
      'UPDATE metode_pembayaran SET nama = ?, nomor = ?, atas_nama = ?, catatan = ?, aktif = ? WHERE id = ?',
      [nama.trim(), nomor?.trim() || null, atas_nama?.trim() || null, catatan?.trim() || null, aktif ? 1 : 0, id]
    );
    if (result.affectedRows === 0) {
      return Response.json({ error: 'Metode tidak ditemukan' }, { status: 404 });
    }
    return Response.json({ message: 'Metode pembayaran disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X — hapus 1 metode, rapikan urutan yang sesudahnya
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query('SELECT urutan FROM metode_pembayaran WHERE id = ?', [id]);
    if (!row) {
      await conn.rollback();
      return Response.json({ error: 'Metode tidak ditemukan' }, { status: 404 });
    }
    await conn.query('DELETE FROM metode_pembayaran WHERE id = ?', [id]);
    await conn.query('UPDATE metode_pembayaran SET urutan = urutan - 1 WHERE urutan > ?', [row.urutan]);
    await conn.commit();
    return Response.json({ message: 'Metode pembayaran dihapus!' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}

// PATCH — geser urutan naik/turun, tukar dengan tetangga (pakai nomor
// sementara biar gak nabrak unique constraint kalau ada).
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, arah } = await request.json();
    if (!id || !['naik', 'turun'].includes(arah)) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[current]] = await conn.query('SELECT urutan FROM metode_pembayaran WHERE id = ?', [id]);
      if (!current) {
        await conn.rollback();
        return Response.json({ error: 'Metode tidak ditemukan' }, { status: 404 });
      }
      const urutanTetangga = arah === 'naik' ? current.urutan - 1 : current.urutan + 1;
      const [[tetangga]] = await conn.query('SELECT id, urutan FROM metode_pembayaran WHERE urutan = ?', [urutanTetangga]);
      if (!tetangga) {
        await conn.rollback();
        return Response.json({ error: 'Metode ini sudah paling ' + (arah === 'naik' ? 'atas' : 'bawah') }, { status: 400 });
      }
      const TEMP = -999;
      await conn.query('UPDATE metode_pembayaran SET urutan = ? WHERE id = ?', [TEMP, id]);
      await conn.query('UPDATE metode_pembayaran SET urutan = ? WHERE id = ?', [current.urutan, tetangga.id]);
      await conn.query('UPDATE metode_pembayaran SET urutan = ? WHERE id = ?', [urutanTetangga, id]);
      await conn.commit();
      return Response.json({ message: 'Urutan diperbarui!' });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
