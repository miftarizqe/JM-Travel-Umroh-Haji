import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { hitungSaldoAkhirPeriode } from '@/lib/cashflow';

// GET /api/admin/finance/rekening?bulan=YYYY-MM — dashboard 3 rekening JM
// Travel (dikonfirmasi user 2026-09-02): Alkhalid Jaya Megah, Sahabat
// Baitullah (dua-duanya baru, dari rekening_ledger), dan Cashflow (SUDAH
// ADA, cuma disurface bareng di sini lewat cashflow_periode/hitungSaldoAkhirPeriode
// yang udah dipakai halaman Cashflow — TIDAK dihitung ulang beda formula).
// Alokasi operasional/management dari pendaftaran Sahabat Baitullah baru
// (2026-09-06) TETAP di rekening sahabat_baitullah yang sama (keluar+masuk,
// netral ke saldo) — bukan rekening terpisah, lihat komisi_ledger jenis
// 'operasional_sahabat' & sumber_tipe yang sama di rekening_ledger.
async function saldoRekeningLedger(rekening, bulan) {
  const awalBulan = `${bulan}-01`;
  const [[sebelum]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN jenis='masuk' THEN nominal ELSE -nominal END), 0) AS saldo
     FROM rekening_ledger WHERE rekening = ? AND created_at < ?`,
    [rekening, awalBulan]
  );
  const [[bulanIni] ] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN jenis='masuk' THEN nominal ELSE 0 END), 0) AS masuk,
            COALESCE(SUM(CASE WHEN jenis='keluar' THEN nominal ELSE 0 END), 0) AS keluar
     FROM rekening_ledger WHERE rekening = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH)`,
    [rekening, awalBulan, awalBulan]
  );
  const [transaksi] = await pool.query(
    `SELECT id, jenis, sumber_tipe, sumber_id, nominal, keterangan, created_at
     FROM rekening_ledger WHERE rekening = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH)
     ORDER BY created_at DESC`,
    [rekening, awalBulan, awalBulan]
  );
  const saldoAwal = Number(sebelum.saldo || 0);
  const masuk = Number(bulanIni.masuk || 0);
  const keluar = Number(bulanIni.keluar || 0);
  return { saldo_awal: saldoAwal, masuk, keluar, saldo_akhir: saldoAwal + masuk - keluar, transaksi };
}

export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const bulan = searchParams.get('bulan') || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(bulan)) {
      return Response.json({ error: 'Format bulan harus YYYY-MM' }, { status: 400 });
    }

    const [alkhalid, sahabatBaitullah] = await Promise.all([
      saldoRekeningLedger('alkhalid', bulan),
      saldoRekeningLedger('sahabat_baitullah', bulan),
    ]);

    const [[periodeCashflow]] = await pool.query('SELECT id, status FROM cashflow_periode WHERE bulan = ?', [bulan]);
    let cashflow = null;
    if (periodeCashflow) {
      const saldoPerAkun = await hitungSaldoAkhirPeriode(pool, periodeCashflow.id);
      const [akunRows] = await pool.query('SELECT id, nama FROM cashflow_akun');
      const namaAkun = Object.fromEntries(akunRows.map(a => [a.id, a.nama]));
      cashflow = {
        periode_id: periodeCashflow.id, status: periodeCashflow.status,
        per_akun: saldoPerAkun.map(a => ({ ...a, nama: namaAkun[a.akun_id] || `Akun #${a.akun_id}` })),
      };
    }

    return Response.json({ bulan, alkhalid, sahabat_baitullah: sahabatBaitullah, cashflow });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
