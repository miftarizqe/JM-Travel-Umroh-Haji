import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { buatPdfFormulirBsiUntukUser } from '@/lib/pdfDokumen/dokumenSahabatGabungan';

// POST /api/sahabat/dokumen-legal/formulir-bsi — preview PDF "Formulir
// Pendaftaran Rekening BSI" BERDIRI SENDIRI (dikonfirmasi user 2026-10-09)
// -- sebelumnya dokumen ke-4 ini cuma bisa dilihat lewat "Unduh Dokumen
// Lengkap" (gabungan 4 file) SETELAH pilih Metode TTD, padahal keputusan
// metode itu sendiri wajar butuh tau dulu dokumennya kayak apa, sama
// seperti preview Surat Perjanjian & SK-CIF yang sudah ada (lihat tombol
// "Mau lihat isinya dulu?" di status-pendaftaran-sahabat). Cuma relevan
// buat user yang udah setuju bantuan BSI manual -- dicek di
// buatPdfFormulirBsiUntukUser lewat bantuan_bsi_manual_disetujui_at di FE,
// endpoint ini sendiri gak nge-gate (sama pola dgn pdf-otomatis/route.js).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const pdfBuffer = await buatPdfFormulirBsiUntukUser(pool, auth.user.id);
    return new Response(pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Formulir-Pendaftaran-Rekening-BSI.pdf"', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
