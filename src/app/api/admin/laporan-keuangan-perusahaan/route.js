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
    // Default ke 'akrual' di level API (user-facing) — beda dari default
    // 'kas' di level lib (cuma demi backward-compat siapa pun yang manggil
    // fungsinya langsung tanpa basis). Dikonfirmasi user 2026-10-16: akrual
    // (pendapatan diakui pas program berangkat) lebih bener secara
    // akuntansi, jadi itu yang ditampilin duluan — mode kas (uang masuk,
    // cara lama) tetap ada, dipilih eksplisit lewat ?basis=kas.
    const basis = searchParams.get('basis') === 'kas' ? 'kas' : 'akrual';
    if (tahun) {
      const data = await hitungLaporanLabaRugiTahunan(pool, tahun, basis);
      return Response.json(data);
    }
    const data = await hitungLaporanKeuanganPerusahaan(pool, {
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      basis,
    });
    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
