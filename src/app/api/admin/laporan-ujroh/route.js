import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { hitungLaporanUjroh } from '@/lib/laporanUjroh';

// GET /api/admin/laporan-ujroh?from=&to=
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const data = await hitungLaporanUjroh(pool, {
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });
    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
