import { wajibRole } from '@/lib/auth';
import { buatPdfSpkaInsUntukUser, responsPdfSpkaIns } from '@/lib/pdfDokumen/spkaInsUntukUser';

// GET /api/admin/cetak-spka-ins/[user_id] — PDF Surat Perjanjian Kerjasama
// Perwakilan (SPKA-Ins) resmi, template final (dikonfirmasi user 2026-10-18).
// Admin only, mirror /api/admin/cetak-spk-ak.
//
// ?rangkap=management|perwakilan — default 'perwakilan' kalau gak diisi,
// lihat buatPdfSpkaInsUntukUser.
export async function GET(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { user_id } = await params;
    const { searchParams } = new URL(request.url);
    const rangkapDiminta = searchParams.get('rangkap');
    const rangkap = rangkapDiminta === 'management' ? 'management' : 'perwakilan';
    return responsPdfSpkaIns(await buatPdfSpkaInsUntukUser(user_id, rangkap));
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
