import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { hitungLaporanKeuanganPerusahaan, hitungLaporanLabaRugiTahunan } from '@/lib/laporanKeuanganPerusahaan';

// GET /api/admin/laporan-keuangan-perusahaan?from=&to=  (mode bulan/rentang bebas)
//  atau  ?tahun=YYYY  (mode tahunan, breakdown per bulan) — khusus super admin
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const tahun = searchParams.get('tahun');
    if (tahun) {
      const data = await hitungLaporanLabaRugiTahunan(pool, tahun);
      return Response.json(data);
    }
    const data = await hitungLaporanKeuanganPerusahaan(pool, {
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });
    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
