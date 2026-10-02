import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { buatPdfSpkAkUntukUser } from '@/lib/pdfDokumen/spkAkUntukUser';
import { buatPdfSkCifPemblokiranUntukUser, mergePdfBuffers } from '@/lib/pdfDokumen/dokumenSahabatGabungan';

// GET /api/sahabat/dokumen-legal/unduh-lengkap — PDF gabungan KETIGA dokumen
// Sahabat Baitullah (SPK-AK + SK-CIF + Surat Pemblokiran) jadi SATU file,
// dipakai di step "Metode TTD & Kirim Dokumen" (dikonfirmasi user
// 2026-10-02) biar jamaah bisa baca & unduh ketiganya dari 1 tempat tanpa
// gonta-ganti halaman. TIDAK menggantikan unduhan per-dokumen yang sudah
// ada (/api/sahabat/unduh-spk-ak, /api/sahabat/dokumen-legal/pdf-otomatis)
// — itu tetap tersedia buat yang mau unduh terpisah.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { pdfBuffer: spkAkBuffer } = await buatPdfSpkAkUntukUser(pool, auth.user.id);
    const skCifPemblokiranBuffer = await buatPdfSkCifPemblokiranUntukUser(pool, auth.user.id);
    const gabungan = await mergePdfBuffers([spkAkBuffer, skCifPemblokiranBuffer]);

    return new Response(gabungan, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Dokumen-Lengkap-Sahabat-Baitullah.pdf"' },
    });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
