import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { hitungLaporanKeuanganProgram } from '@/lib/laporanKeuangan';

// GET /api/admin/laporan-keuangan-program?from=&to=&prog_id= — super_admin
// only, sama kayak laporan keuangan lain (HPP/margin per program sensitif).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    // Default 'akrual' di level API (dikonfirmasi user 2026-10-16) — lihat
    // catatan sama di /api/admin/laporan-keuangan-perusahaan.
    const basis = searchParams.get('basis') === 'kas' ? 'kas' : 'akrual';
    const data = await hitungLaporanKeuanganProgram(pool, {
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      progId: searchParams.get('prog_id'),
      basis,
    });
    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
