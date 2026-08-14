import crypto from 'crypto';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// POST — transfer antar akun sendiri (mis. "Pindah dana cash to bank"), dicatat
// sebagai 2 baris terhubung: OUT di akun asal + IN di akun tujuan, deskripsi sama.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { periode_id, tanggal, deskripsi, akun_dari_id, akun_ke_id, nominal } = await request.json();
    if (!periode_id || !tanggal || !deskripsi?.trim() || !akun_dari_id || !akun_ke_id || !nominal || Number(nominal) <= 0) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    if (akun_dari_id === akun_ke_id) {
      return Response.json({ error: 'Akun asal dan tujuan tidak boleh sama' }, { status: 400 });
    }

    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [periode_id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, tidak bisa menambah transfer' }, { status: 400 });
    }

    const pairId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO cashflow_transaksi (periode_id, tanggal, deskripsi, akun_id, tipe, nominal, transfer_pair_id, input_oleh)
       VALUES (?, ?, ?, ?, 'out', ?, ?, ?), (?, ?, ?, ?, 'in', ?, ?, ?)`,
      [periode_id, tanggal, deskripsi.trim(), akun_dari_id, Number(nominal), pairId, auth.user.id,
       periode_id, tanggal, deskripsi.trim(), akun_ke_id, Number(nominal), pairId, auth.user.id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'transfer_antar_akun_cashflow',
      target_type: 'cashflow_transaksi',
      target_id: pairId,
      keterangan: `${deskripsi.trim()} — Rp${Number(nominal).toLocaleString('id-ID')} (akun #${akun_dari_id} → akun #${akun_ke_id})`,
    });

    return Response.json({ message: 'Transfer antar akun dicatat!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
