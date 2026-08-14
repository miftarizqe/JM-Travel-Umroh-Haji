import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// POST /api/admin/cashflow/reimburse/[id]/bayar  body: { periode_id, akun_id }
// Company beneran bayar balik klaim reimburse ke staff — INI baru jadi baris
// cashflow_transaksi OUT yang sebenarnya (uang company gerak SEKARANG),
// bukan pas klaim dibuat. Bon yang staff upload pas klaim ikut kebawa ke
// transaksi ini sebagai bukti_path-nya.
export async function POST(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const id = Number((await params).id);
    const { periode_id, akun_id } = await request.json();
    if (!id || !periode_id || !akun_id) {
      return Response.json({ error: 'periode_id dan akun_id wajib diisi' }, { status: 400 });
    }

    const [[klaim]] = await pool.query('SELECT * FROM cashflow_reimburse WHERE id = ?', [id]);
    if (!klaim) return Response.json({ error: 'Klaim tidak ditemukan' }, { status: 404 });
    if (klaim.status === 'sudah_dibayar') {
      return Response.json({ error: 'Klaim ini sudah dibayar sebelumnya' }, { status: 400 });
    }

    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [periode_id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, buka periode yang masih draft buat bayar reimburse' }, { status: 400 });
    }

    const deskripsiTransaksi = `Reimburse — ${klaim.deskripsi} (a.n. ${klaim.nama_staff})`;
    const [result] = await pool.query(
      `INSERT INTO cashflow_transaksi (periode_id, tanggal, deskripsi, kategori_id, akun_id, tipe, nominal, bukti_path, bukti_nama, input_oleh)
       VALUES (?, CURDATE(), ?, ?, ?, 'out', ?, ?, ?, ?)`,
      [periode_id, deskripsiTransaksi, klaim.kategori_id, akun_id, klaim.nominal, klaim.bukti_path, klaim.bukti_nama, auth.user.id]
    );

    await pool.query(
      `UPDATE cashflow_reimburse SET status = 'sudah_dibayar', dibayar_transaksi_id = ?, dibayar_at = NOW() WHERE id = ?`,
      [result.insertId, id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'bayar_reimburse',
      target_type: 'cashflow_reimburse',
      target_id: id,
      keterangan: `${klaim.deskripsi} — a.n. ${klaim.nama_staff} — Rp${Number(klaim.nominal).toLocaleString('id-ID')} (transaksi #${result.insertId})`,
    });

    return Response.json({ message: 'Reimburse berhasil dibayar & dicatat ke cashflow!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
