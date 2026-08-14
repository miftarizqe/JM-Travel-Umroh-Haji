import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// Opsi tambahan itu per-program (beda program bisa beda opsi & harga) —
// jadi prog_id WAJIB dan semua urutan (untuk reorder) di-scope ke program
// yang sama, bukan global lintas program.

// GET /api/admin/opsi-tambahan?prog_id=X — semua opsi 1 program (termasuk yg nonaktif)
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const progId = searchParams.get('prog_id');
    if (!progId) return Response.json({ error: 'Parameter prog_id wajib diisi' }, { status: 400 });
    const [rows] = await pool.query('SELECT * FROM opsi_tambahan WHERE prog_id = ? ORDER BY urutan ASC', [progId]);
    return Response.json({ opsi: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST ?prog_id=X — tambah opsi baru di akhir daftar program itu (urutan = MAX+1)
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const progId = searchParams.get('prog_id');
    if (!progId) return Response.json({ error: 'Parameter prog_id wajib diisi' }, { status: 400 });
    const { nama, harga, deskripsi } = await request.json();
    if (!nama?.trim()) {
      return Response.json({ error: 'Nama opsi wajib diisi' }, { status: 400 });
    }
    const [[{ maxUrutan }]] = await pool.query('SELECT COALESCE(MAX(urutan), 0) AS maxUrutan FROM opsi_tambahan WHERE prog_id = ?', [progId]);
    const [result] = await pool.query(
      'INSERT INTO opsi_tambahan (prog_id, urutan, nama, harga, deskripsi) VALUES (?, ?, ?, ?, ?)',
      [progId, maxUrutan + 1, nama.trim(), Number(harga) || 0, deskripsi?.trim() || null]
    );
    return Response.json({ message: 'Opsi tambahan ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update 1 opsi (nama/harga/deskripsi/aktif)
export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, nama, harga, deskripsi, aktif } = await request.json();
    if (!id || !nama?.trim()) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [result] = await pool.query(
      'UPDATE opsi_tambahan SET nama = ?, harga = ?, deskripsi = ?, aktif = ? WHERE id = ?',
      [nama.trim(), Number(harga) || 0, deskripsi?.trim() || null, aktif ? 1 : 0, id]
    );
    if (result.affectedRows === 0) {
      return Response.json({ error: 'Opsi tidak ditemukan' }, { status: 404 });
    }
    return Response.json({ message: 'Opsi tambahan disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X — hapus 1 opsi, rapikan urutan program yang sama
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query('SELECT prog_id, urutan FROM opsi_tambahan WHERE id = ?', [id]);
    if (!row) {
      await conn.rollback();
      return Response.json({ error: 'Opsi tidak ditemukan' }, { status: 404 });
    }
    await conn.query('DELETE FROM opsi_tambahan WHERE id = ?', [id]);
    await conn.query('UPDATE opsi_tambahan SET urutan = urutan - 1 WHERE prog_id = ? AND urutan > ?', [row.prog_id, row.urutan]);
    await conn.commit();
    return Response.json({ message: 'Opsi tambahan dihapus!' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}

// PATCH — geser urutan naik/turun, tukar dengan tetangga DI PROGRAM YANG SAMA
// (pakai nomor sementara biar gak nabrak unique constraint kalau ada).
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
      const [[current]] = await conn.query('SELECT prog_id, urutan FROM opsi_tambahan WHERE id = ?', [id]);
      if (!current) {
        await conn.rollback();
        return Response.json({ error: 'Opsi tidak ditemukan' }, { status: 404 });
      }
      const urutanTetangga = arah === 'naik' ? current.urutan - 1 : current.urutan + 1;
      const [[tetangga]] = await conn.query(
        'SELECT id, urutan FROM opsi_tambahan WHERE prog_id = ? AND urutan = ?', [current.prog_id, urutanTetangga]
      );
      if (!tetangga) {
        await conn.rollback();
        return Response.json({ error: 'Opsi ini sudah paling ' + (arah === 'naik' ? 'atas' : 'bawah') }, { status: 400 });
      }
      const TEMP = -999;
      await conn.query('UPDATE opsi_tambahan SET urutan = ? WHERE id = ?', [TEMP, id]);
      await conn.query('UPDATE opsi_tambahan SET urutan = ? WHERE id = ?', [current.urutan, tetangga.id]);
      await conn.query('UPDATE opsi_tambahan SET urutan = ? WHERE id = ?', [urutanTetangga, id]);
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
