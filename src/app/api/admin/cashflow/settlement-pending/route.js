import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { ambilSettlementBelumSelesai } from '@/lib/cashflow';

// GET /api/admin/cashflow/settlement-pending — semua settlement (transfer ke
// staff) lintas bulan yang belum dirincikan tuntas.
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const data = await ambilSettlementBelumSelesai(pool);
    return Response.json({ settlement: data });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
