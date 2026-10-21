import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { saldoDeposit } from '@/lib/depositSaldo';

// GET /api/saldo-deposit?user_id=xxx
// Saldo Deposit umum (dikonfirmasi user 2026-10-20) — saldo milik SENDIRI
// kalau user_id gak diisi/beda, admin boleh lihat saldo siapa aja (dipakai
// cek sebelum nentuin "pakai saldo atas nama orang lain" di checkout).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    const userId = (isAdmin && searchParams.get('user_id')) ? searchParams.get('user_id') : auth.user.id;

    const saldo = await saldoDeposit(pool, userId);
    let riwayat = [];
    if (isAdmin && searchParams.get('riwayat') === '1') {
      const [rows] = await pool.query(
        `SELECT id, booking_id_asal, booking_id_pakai, nominal, jenis, keterangan, created_at
         FROM deposit_saldo_ledger WHERE user_id = ? ORDER BY id DESC`,
        [userId]
      );
      riwayat = rows;
    }
    return Response.json({ saldo, riwayat });
  } catch (error) {
    console.error('GET /api/saldo-deposit gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
