import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// GET /api/admin/cashflow/reimburse?status=belum_dibayar — default semua
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const [rows] = await pool.query(
      `SELECT r.*, k.nama AS kategori_nama
       FROM cashflow_reimburse r
       LEFT JOIN cashflow_kategori k ON k.id = r.kategori_id
       ${status ? 'WHERE r.status = ?' : ''}
       ORDER BY r.tanggal_pengeluaran ASC, r.id ASC`,
      status ? [status] : []
    );
    return Response.json({ reimburse: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — buat klaim reimburse baru (staff keluar duit pribadi dulu, company
// BELUM bayar — belum masuk cashflow_transaksi sampai di-"bayar")
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { tanggal_pengeluaran, deskripsi, kategori_id, nominal, nama_staff, bukti_path, bukti_nama, dari_settlement_id } = await request.json();
    if (!tanggal_pengeluaran || !deskripsi?.trim() || !nama_staff?.trim() || !nominal || Number(nominal) <= 0) {
      return Response.json({ error: 'Tanggal, deskripsi, nama staff & nominal wajib diisi' }, { status: 400 });
    }

    const [result] = await pool.query(
      `INSERT INTO cashflow_reimburse (tanggal_pengeluaran, deskripsi, kategori_id, nominal, nama_staff, dari_settlement_id, bukti_path, bukti_nama, input_oleh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tanggal_pengeluaran, deskripsi.trim(), kategori_id || null, Number(nominal), nama_staff.trim(), dari_settlement_id || null, bukti_path || null, bukti_nama || null, auth.user.id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'tambah_reimburse',
      target_type: 'cashflow_reimburse',
      target_id: result.insertId,
      keterangan: `${deskripsi.trim()} — a.n. ${nama_staff.trim()} — Rp${Number(nominal).toLocaleString('id-ID')}`,
    });

    return Response.json({ message: 'Klaim reimburse dicatat!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — edit klaim yang MASIH belum_dibayar
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id, tanggal_pengeluaran, deskripsi, kategori_id, nominal, nama_staff, bukti_path, bukti_nama } = await request.json();
    if (!id || !tanggal_pengeluaran || !deskripsi?.trim() || !nama_staff?.trim() || !nominal || Number(nominal) <= 0) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const [[existing]] = await pool.query('SELECT * FROM cashflow_reimburse WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Klaim tidak ditemukan' }, { status: 404 });
    if (existing.status === 'sudah_dibayar') {
      return Response.json({ error: 'Klaim ini sudah dibayar, tidak bisa diubah lagi' }, { status: 400 });
    }

    await pool.query(
      `UPDATE cashflow_reimburse SET tanggal_pengeluaran = ?, deskripsi = ?, kategori_id = ?, nominal = ?, nama_staff = ?, bukti_path = ?, bukti_nama = ?
       WHERE id = ?`,
      [tanggal_pengeluaran, deskripsi.trim(), kategori_id || null, Number(nominal), nama_staff.trim(), bukti_path || null, bukti_nama || null, id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'edit_reimburse',
      target_type: 'cashflow_reimburse',
      target_id: id,
      keterangan: `${existing.deskripsi} (Rp${Number(existing.nominal).toLocaleString('id-ID')}) → ${deskripsi.trim()} (Rp${Number(nominal).toLocaleString('id-ID')})`,
    });

    return Response.json({ message: 'Klaim diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X — cuma boleh kalau belum_dibayar
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });
  try {
    const [[existing]] = await pool.query('SELECT * FROM cashflow_reimburse WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Klaim tidak ditemukan' }, { status: 404 });
    if (existing.status === 'sudah_dibayar') {
      return Response.json({ error: 'Klaim ini sudah dibayar, tidak bisa dihapus' }, { status: 400 });
    }

    await pool.query('DELETE FROM cashflow_reimburse WHERE id = ?', [id]);

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'hapus_reimburse',
      target_type: 'cashflow_reimburse',
      target_id: id,
      keterangan: `${existing.deskripsi} — a.n. ${existing.nama_staff} — Rp${Number(existing.nominal).toLocaleString('id-ID')}`,
    });

    return Response.json({ message: 'Klaim dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
