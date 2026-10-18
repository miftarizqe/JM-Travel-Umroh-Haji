import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { buatPdfJamaahUntukBooking, responsPdfJamaah } from '@/lib/pdfDokumen/jamaahUntukBooking';

// GET /api/admin/cetak-spj/[booking_id] — PDF Surat Perjanjian Jamaah Umroh
// (SPJ) resmi, template final (dikonfirmasi user 2026-10-18). Admin only.
// 1 lembar per jamaah aktif, digabung otomatis kalau >1.
export async function GET(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { booking_id } = await params;
    return responsPdfJamaah(await buatPdfJamaahUntukBooking(pool, booking_id));
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
