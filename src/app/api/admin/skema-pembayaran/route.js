import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query('SELECT * FROM skema_pembayaran ORDER BY urutan ASC');
    return Response.json({ skema: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { judul, deskripsi, pesan_wa } = await request.json();
    if (!judul?.trim() || !deskripsi?.trim()) {
      return Response.json({ error: 'Judul & deskripsi wajib diisi' }, { status: 400 });
    }
    const [[{ maxUrutan }]] = await pool.query('SELECT COALESCE(MAX(urutan), 0) AS maxUrutan FROM skema_pembayaran');
    const [result] = await pool.query(
      'INSERT INTO skema_pembayaran (urutan, judul, deskripsi, pesan_wa) VALUES (?, ?, ?, ?)',
      [maxUrutan + 1, judul.trim(), deskripsi.trim(), pesan_wa?.trim() || null]
    );
    return Response.json({ message: 'Skema pembayaran ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, judul, deskripsi, pesan_wa, aktif } = await request.json();
    if (!id || !judul?.trim() || !deskripsi?.trim()) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [result] = await pool.query(
      'UPDATE skema_pembayaran SET judul = ?, deskripsi = ?, pesan_wa = ?, aktif = ? WHERE id = ?',
      [judul.trim(), deskripsi.trim(), pesan_wa?.trim() || null, aktif ? 1 : 0, id]
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Skema tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Skema pembayaran disimpan!' });
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
    const [[row]] = await conn.query('SELECT urutan FROM skema_pembayaran WHERE id = ?', [id]);
    if (!row) {
      await conn.rollback();
      return Response.json({ error: 'Skema tidak ditemukan' }, { status: 404 });
    }
    await conn.query('DELETE FROM skema_pembayaran WHERE id = ?', [id]);
    await conn.query('UPDATE skema_pembayaran SET urutan = urutan - 1 WHERE urutan > ?', [row.urutan]);
    await conn.commit();
    return Response.json({ message: 'Skema pembayaran dihapus!' });
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
      const [[current]] = await conn.query('SELECT urutan FROM skema_pembayaran WHERE id = ?', [id]);
      if (!current) {
        await conn.rollback();
        return Response.json({ error: 'Skema tidak ditemukan' }, { status: 404 });
      }
      const urutanTetangga = arah === 'naik' ? current.urutan - 1 : current.urutan + 1;
      const [[tetangga]] = await conn.query('SELECT id, urutan FROM skema_pembayaran WHERE urutan = ?', [urutanTetangga]);
      if (!tetangga) {
        await conn.rollback();
        return Response.json({ error: 'Skema ini sudah paling ' + (arah === 'naik' ? 'atas' : 'bawah') }, { status: 400 });
      }
      const TEMP = -999;
      await conn.query('UPDATE skema_pembayaran SET urutan = ? WHERE id = ?', [TEMP, id]);
      await conn.query('UPDATE skema_pembayaran SET urutan = ? WHERE id = ?', [current.urutan, tetangga.id]);
      await conn.query('UPDATE skema_pembayaran SET urutan = ? WHERE id = ?', [urutanTetangga, id]);
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
