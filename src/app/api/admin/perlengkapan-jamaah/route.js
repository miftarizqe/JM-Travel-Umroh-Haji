import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query('SELECT * FROM perlengkapan_jamaah ORDER BY urutan ASC');
    return Response.json({ perlengkapan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { nama, deskripsi } = await request.json();
    if (!nama?.trim()) {
      return Response.json({ error: 'Nama item wajib diisi' }, { status: 400 });
    }
    const [[{ maxUrutan }]] = await pool.query('SELECT COALESCE(MAX(urutan), 0) AS maxUrutan FROM perlengkapan_jamaah');
    const [result] = await pool.query(
      'INSERT INTO perlengkapan_jamaah (urutan, nama, deskripsi) VALUES (?, ?, ?)',
      [maxUrutan + 1, nama.trim(), deskripsi?.trim() || null]
    );
    return Response.json({ message: 'Item perlengkapan ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, nama, deskripsi, aktif } = await request.json();
    if (!id || !nama?.trim()) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [result] = await pool.query(
      'UPDATE perlengkapan_jamaah SET nama = ?, deskripsi = ?, aktif = ? WHERE id = ?',
      [nama.trim(), deskripsi?.trim() || null, aktif ? 1 : 0, id]
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Item perlengkapan disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query('SELECT urutan FROM perlengkapan_jamaah WHERE id = ?', [id]);
    if (!row) {
      await conn.rollback();
      return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
    }
    await conn.query('DELETE FROM perlengkapan_jamaah WHERE id = ?', [id]);
    await conn.query('UPDATE perlengkapan_jamaah SET urutan = urutan - 1 WHERE urutan > ?', [row.urutan]);
    await conn.commit();
    return Response.json({ message: 'Item perlengkapan dihapus!' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}

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
      const [[current]] = await conn.query('SELECT urutan FROM perlengkapan_jamaah WHERE id = ?', [id]);
      if (!current) {
        await conn.rollback();
        return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
      }
      const urutanTetangga = arah === 'naik' ? current.urutan - 1 : current.urutan + 1;
      const [[tetangga]] = await conn.query('SELECT id, urutan FROM perlengkapan_jamaah WHERE urutan = ?', [urutanTetangga]);
      if (!tetangga) {
        await conn.rollback();
        return Response.json({ error: 'Item ini sudah paling ' + (arah === 'naik' ? 'atas' : 'bawah') }, { status: 400 });
      }
      const TEMP = -999;
      await conn.query('UPDATE perlengkapan_jamaah SET urutan = ? WHERE id = ?', [TEMP, id]);
      await conn.query('UPDATE perlengkapan_jamaah SET urutan = ? WHERE id = ?', [current.urutan, tetangga.id]);
      await conn.query('UPDATE perlengkapan_jamaah SET urutan = ? WHERE id = ?', [urutanTetangga, id]);
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
