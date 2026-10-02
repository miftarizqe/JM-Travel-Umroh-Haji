import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { buatPdfSkCifPemblokiranUntukUser } from '@/lib/pdfDokumen/dokumenSahabatGabungan';

// POST /api/sahabat/dokumen-legal/pdf-otomatis — PDF gabungan SK-CIF +
// Surat Pemblokiran dengan identitas jamaah terisi otomatis, ditempel di
// atas template PDF final (dikonfirmasi user 2026-09-28, satu file PDF
// biar sama kayak alur cetak fisiknya yang emang dibarengin — lihat tombol
// "Print Kedua Surat" yang sudah ada). SENGAJA gak ganti alur baca/
// scroll-gate/checkbox setuju & tombol Print lama — murni tambahan.
//
// Logika generate PDF-nya dipindah ke buatPdfSkCifPemblokiranUntukUser
// (src/lib/pdfDokumen/dokumenSahabatGabungan.js, dikonfirmasi user
// 2026-10-02) biar bisa dipakai ulang juga oleh
// /api/sahabat/dokumen-legal/unduh-lengkap (gabungan 3 dokumen).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const pdfBuffer = await buatPdfSkCifPemblokiranUntukUser(pool, auth.user.id);
    return new Response(pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="SK-CIF-dan-Surat-Pemblokiran.pdf"' },
    });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
