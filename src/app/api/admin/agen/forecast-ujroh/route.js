import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { KOMISI_AGEN_PER_JAMAAH } from '@/lib/closing';

// GET /api/admin/agen/forecast-ujroh?from=&to= — mirror struktur
// hitungLaporanUjroh() punya Perwakilan/Sahabat (lihat src/lib/laporanUjroh.js)
// TAPI dibuat endpoint sendiri, gak ikut digabung ke fungsi bersama itu —
// rumus ujroh Agen flat (3,5jt/jamaah - voucher, bukan margin dinamis per
// paket/kamar kayak Perwakilan), jadi gak ada cost-basis lookup yang perlu
// dipakai bareng (dikonfirmasi user 2026-10-17, "Agen" sengaja dibuat lebih
// ringan & berdiri sendiri sejak awal — lihat closing/pengajuan-ujroh/
// rekap-ujroh Agen yang juga endpoint sendiri, bukan ikut pola 2-role itu).
export async function GET(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const ledgerParams = [];
    let ledgerWhere = '';
    if (from) { ledgerWhere += ' AND kl.created_at >= ?'; ledgerParams.push(`${from} 00:00:00`); }
    if (to) { ledgerWhere += ' AND kl.created_at <= ?'; ledgerParams.push(`${to} 23:59:59`); }

    const [realizedRows] = await pool.query(
      `SELECT kl.penerima_id, kl.nominal, kl.booking_id, kl.jumlah_jamaah, kl.keterangan, kl.created_at
       FROM komisi_ledger kl WHERE kl.jenis = 'ujroh_agen'${ledgerWhere} ORDER BY kl.created_at DESC`,
      ledgerParams
    );
    const [realizedBookings] = await pool.query(
      `SELECT id, prog_name FROM bookings WHERE id IN (${realizedRows.length ? realizedRows.map(() => '?').join(',') : 'NULL'})`,
      realizedRows.map(r => r.booking_id)
    );
    const progNameByBooking = new Map(realizedBookings.map(b => [b.id, b.prog_name]));

    const [forecastBookings] = await pool.query(
      `SELECT id, prog_name, jumlah_jamaah, voucher_nominal, referral_agen_id
       FROM bookings WHERE referral_agen_id IS NOT NULL AND status IN ('active', 'menunggu_batal')`
    );

    const agenMap = new Map();
    const userCache = new Map();
    async function ambilAgen(id) {
      if (!id) return null;
      if (userCache.has(id)) return userCache.get(id);
      const [[u]] = await pool.query("SELECT id, name, kode_unik FROM users WHERE id = ? AND role = 'agen'", [id]);
      userCache.set(id, u || null);
      return u || null;
    }
    function orangAgen(u) {
      if (!u) return null;
      if (!agenMap.has(u.id)) {
        agenMap.set(u.id, {
          id: u.id, name: u.name, kode_unik: u.kode_unik,
          realized_total: 0, realized_detail: [],
          forecast_total: 0, forecast_detail: [],
        });
      }
      return agenMap.get(u.id);
    }

    let totalRealized = 0;
    for (const r of realizedRows) {
      const o = orangAgen(await ambilAgen(r.penerima_id));
      if (!o) continue;
      o.realized_total += Number(r.nominal);
      o.realized_detail.push({
        booking_id: r.booking_id, prog_name: progNameByBooking.get(r.booking_id) || '-',
        jumlah_jamaah: r.jumlah_jamaah || 1, jenis: 'ujroh_agen', kategori: 'Rekening Pribadi',
        keterangan: r.keterangan, nominal: Number(r.nominal), created_at: r.created_at,
      });
      totalRealized += Number(r.nominal);
    }

    let totalForecast = 0;
    for (const b of forecastBookings) {
      const o = orangAgen(await ambilAgen(b.referral_agen_id));
      if (!o) continue;
      const nominal = Math.max(0, KOMISI_AGEN_PER_JAMAAH * Number(b.jumlah_jamaah || 1) - Number(b.voucher_nominal || 0));
      if (nominal <= 0) continue;
      o.forecast_total += nominal;
      o.forecast_detail.push({
        booking_id: b.id, prog_name: b.prog_name, jumlah_jamaah: b.jumlah_jamaah || 1,
        jenis: 'ujroh_agen', keterangan: 'Belum closing', nominal,
      });
      totalForecast += nominal;
    }

    const list = [...agenMap.values()]
      .map(o => ({ ...o, grand_total: o.realized_total + o.forecast_total }))
      .sort((a, b) => b.grand_total - a.grand_total);

    return Response.json({ agen: list, totals: { realized: totalRealized, forecast: totalForecast } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
