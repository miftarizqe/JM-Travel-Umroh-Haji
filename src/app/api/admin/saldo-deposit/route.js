import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { saldoDeposit, koreksiSaldoDeposit } from '@/lib/depositSaldo';

// GET /api/admin/saldo-deposit?user_id=xxx — saldo + riwayat ledger 1 akun.
export async function GET(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const saldo = await saldoDeposit(pool, userId);
    const [riwayat] = await pool.query(
      `SELECT id, booking_id_asal, booking_id_pakai, nominal, jenis, keterangan, dibuat_oleh, created_at
       FROM deposit_saldo_ledger WHERE user_id = ? ORDER BY id DESC`,
      [userId]
    );
    return Response.json({ saldo, riwayat });
  } catch (error) {
    console.error('GET /api/admin/saldo-deposit gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/saldo-deposit  body: { user_id, nominal, keterangan }
// Koreksi manual (saldo salah input, dsb) — nominal boleh positif/negatif,
// keterangan WAJIB (audit trail, mirror pola koreksi_saldo_sahabat).
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const { user_id, nominal, keterangan } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });
    const nominalNum = Number(nominal);
    if (!Number.isFinite(nominalNum) || nominalNum === 0) {
      return Response.json({ error: 'Nominal koreksi wajib diisi (boleh negatif, gak boleh 0)' }, { status: 400 });
    }
    if (!keterangan || !String(keterangan).trim()) {
      return Response.json({ error: 'Keterangan wajib diisi buat koreksi manual' }, { status: 400 });
    }

    const [[u]] = await pool.query('SELECT name FROM users WHERE id = ?', [user_id]);
    if (!u) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });

    const saldoSebelum = await saldoDeposit(pool, user_id);
    await koreksiSaldoDeposit(pool, { userId: user_id, nominal: nominalNum, keterangan: keterangan.trim(), dibuatOleh: auth.user.id });
    const saldoSesudah = await saldoDeposit(pool, user_id);

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'koreksi_saldo_deposit',
      target_type: 'user',
      target_id: user_id,
      keterangan: `Koreksi Saldo Deposit ${u.name}: ${nominalNum > 0 ? '+' : ''}Rp ${nominalNum.toLocaleString('id-ID')} (${keterangan.trim()}) — saldo ${saldoSebelum.toLocaleString('id-ID')} -> ${saldoSesudah.toLocaleString('id-ID')}`,
    });

    return Response.json({ message: 'Saldo Deposit berhasil dikoreksi.', saldo: saldoSesudah });
  } catch (error) {
    console.error('PATCH /api/admin/saldo-deposit gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
