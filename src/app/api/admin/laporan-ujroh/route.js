import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat, isHopRole } from '@/lib/hopAuth';
import { hitungLaporanUjroh } from '@/lib/laporanUjroh';

// GET /api/admin/laporan-ujroh?from=&to=
// HoP boleh akses juga (dikonfirmasi user 2026-10-08) TAPI cuma bagian
// Sahabat Baitullah -- perwakilan/closingRows/forecastRows (nyampur data
// perwakilan) DIBUANG di server, bukan cuma disembunyikan tampilan, sama
// pola kayak ringkasanHop() di /api/admin/dashboard.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const data = await hitungLaporanUjroh(pool, {
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });
    if (isHopRole(auth.user)) {
      return Response.json({
        sahabat: data.sahabat,
        totals: { sahabat_realized: data.totals.sahabat_realized, sahabat_forecast: data.totals.sahabat_forecast },
        me_id: auth.user.id,
      });
    }
    return Response.json({ ...data, me_id: auth.user.id });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
