import { wajibLogin } from '@/lib/auth';
import { buatPdfSpkaInsUntukUser, responsPdfSpkaIns } from '@/lib/pdfDokumen/spkaInsUntukUser';

// GET /api/perwakilan/unduh-pks — PDF Surat Perjanjian Kerja Sama
// Perwakilan (SPKA-Ins) resmi milik anggota yang login, rangkap
// "perwakilan" (yang dia cetak/TTD/kirim sendiri). Dipakai jalur Cetak &
// Kirim Sendiri (dikonfirmasi user 2026-10-18, mirror
// /api/sahabat/unduh-spk-ak). Rangkap "management" TETAP cuma admin yang
// bisa ambil (lihat /api/admin/cetak-spka-ins) -- itu yang dicetak &
// dikirim balik kantor SETELAH terima rangkap perwakilan yang asli.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    return responsPdfSpkaIns(await buatPdfSpkaInsUntukUser(auth.user.id, 'perwakilan'));
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
