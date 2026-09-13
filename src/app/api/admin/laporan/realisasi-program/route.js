import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { hitungRealisasiVsBudget } from '@/lib/laporanKeuangan';

// GET /api/admin/laporan/realisasi-program?prog_id= — super_admin only,
// sama kayak laporan keuangan lain (HPP/budget sensitif).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const data = await hitungRealisasiVsBudget(pool, { progId: searchParams.get('prog_id') });
    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
