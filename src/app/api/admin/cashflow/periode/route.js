import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { ambilAkunAktif, ambilPeriodeSebelumnya, hitungSaldoAkhirPeriode } from '@/lib/cashflow';

// GET /api/admin/cashflow/periode — daftar semua periode + ringkasan saldo akhir
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const [periodeList] = await pool.query('SELECT * FROM cashflow_periode ORDER BY bulan DESC');
    const hasil = [];
    for (const p of periodeList) {
      const saldo = await hitungSaldoAkhirPeriode(pool, p.id);
      hasil.push({ ...p, saldo_akhir: saldo });
    }
    return Response.json({ periode: hasil });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST { bulan: 'YYYY-MM', saldo_awal_manual?: { [akun_id]: number } }
// Urutan prioritas saldo awal per akun: (1) saldo_akhir periode sebelumnya
// (rantai normal, gak bisa "disunat"), (2) saldo_awal_manual kalau dikirim
// (override eksplisit saat bikin periode ini), (3) cashflow_akun.saldo_awal
// (diisi admin pas bikin akun itu — dikonfirmasi user 2026-10-01, dulu
// fallback-nya 0 kalau akun ini belum pernah punya periode sebelumnya).
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { bulan, saldo_awal_manual } = await request.json();
    if (!/^\d{4}-\d{2}$/.test(bulan || '')) {
      return Response.json({ error: 'Format bulan harus YYYY-MM' }, { status: 400 });
    }

    const [[existing]] = await pool.query('SELECT id FROM cashflow_periode WHERE bulan = ?', [bulan]);
    if (existing) return Response.json({ error: 'Cashflow bulan ini sudah pernah dibuat' }, { status: 400 });

    const akunAktif = await ambilAkunAktif(pool);
    const sebelumnya = await ambilPeriodeSebelumnya(pool, bulan);

    let saldoAkhirSebelumnyaMap = {};
    if (sebelumnya) {
      const saldoAkhirSebelumnya = await hitungSaldoAkhirPeriode(pool, sebelumnya.id);
      saldoAkhirSebelumnya.forEach(s => { saldoAkhirSebelumnyaMap[s.akun_id] = s.saldo_akhir; });
    }
    const override = saldo_awal_manual && typeof saldo_awal_manual === 'object' ? saldo_awal_manual : {};

    const [result] = await pool.query(
      'INSERT INTO cashflow_periode (bulan, status, created_by) VALUES (?, ?, ?)',
      [bulan, 'draft', auth.user.id]
    );
    const periodeId = result.insertId;

    for (const akun of akunAktif) {
      const saldoAwal = Number(saldoAkhirSebelumnyaMap[akun.id] ?? override[akun.id] ?? akun.saldo_awal ?? 0);
      await pool.query(
        'INSERT INTO cashflow_saldo_awal (periode_id, akun_id, saldo_awal) VALUES (?, ?, ?)',
        [periodeId, akun.id, saldoAwal]
      );
    }

    return Response.json({ message: 'Cashflow bulan ini dibuat!', id: periodeId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
