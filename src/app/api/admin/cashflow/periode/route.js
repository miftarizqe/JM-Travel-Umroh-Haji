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
// saldo_awal_manual cuma dipakai kalau belum ada periode sebelumnya sama sekali
// (bulan pertama pakai sistem ini) — selain itu saldo awal SELALU ditarik
// otomatis dari saldo akhir periode sebelumnya, gak boleh diutak-atik manual,
// supaya rantai saldo antar bulan gak bisa "disunat".
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

    let saldoPerAkun = {};
    if (sebelumnya) {
      const saldoAkhirSebelumnya = await hitungSaldoAkhirPeriode(pool, sebelumnya.id);
      saldoAkhirSebelumnya.forEach(s => { saldoPerAkun[s.akun_id] = s.saldo_akhir; });
    } else if (saldo_awal_manual && typeof saldo_awal_manual === 'object') {
      saldoPerAkun = saldo_awal_manual;
    }

    const [result] = await pool.query(
      'INSERT INTO cashflow_periode (bulan, status, created_by) VALUES (?, ?, ?)',
      [bulan, 'draft', auth.user.id]
    );
    const periodeId = result.insertId;

    for (const akun of akunAktif) {
      const saldoAwal = Number(saldoPerAkun[akun.id] || 0);
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
