import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { ambilDokumenCetak } from '@/lib/invoiceKwitansi';
import { renderInvoicePdf } from '@/lib/pdfDokumen/renderInvoice';

// Path disk absolut dari URL public (`/uploads/pengaturan/xxx.png`) —
// react-pdf <Image> jalan server-side (Node), butuh path filesystem/URL
// penuh, bukan path relatif browser.
function diskPath(publicPath) {
  if (!publicPath) return null;
  return path.join(process.cwd(), 'public', publicPath);
}

// GET /api/admin/invoice-kwitansi/[id]/pdf — PDF ASLI (react-pdf,
// server-side), BUKAN HTML+window.print() (dikonfirmasi user 2026-10-22,
// "kenapasih gakbisa kayak perjanjian yang gampang rapihnya dengan gue
// kirim format template pdfnya" — SK-CIF/SPK-AK/dll SELALU PDF asli,
// preview = hasil akhir). Data & gerbang akses SAMA PERSIS GET
// /api/admin/invoice-kwitansi/[id] (ambilDokumenCetak, 1 sumber kebenaran).
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const hasil = await ambilDokumenCetak(pool, id, auth);
    if (hasil.status === 404) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
    if (hasil.status === 403) return Response.json({ error: 'Akses ditolak.' }, { status: 403 });
    const { dokumen, booking, payment } = hasil;

    const [[pengaturan]] = await pool.query('SELECT * FROM pengaturan WHERE id = 1');

    // Sama persis jamaahUntukPembayaran di DokumenCetak.jsx (HTML) --
    // fallback [{nama: dokumen.nama}] buat dokumen bookingless (mis.
    // Kwitansi setoran pendaftaran Sahabat Baitullah).
    const jamaahUntukPembayaran = ['tanda_terima', 'kwitansi'].includes(dokumen.jenis)
      ? (booking?.jamaah_breakdown_pembayaran || booking?.jamaah_breakdown || (!booking && dokumen.nama ? [{ nama: dokumen.nama }] : []))
      : (booking?.jamaah_breakdown || []);

    const buffer = await renderInvoicePdf({
      dokumen, booking, payment,
      pengaturan: {
        ...pengaturan,
        cap_perusahaan_path: diskPath(pengaturan?.cap_perusahaan_path),
        ttd_penandatangan_keuangan_path: diskPath(pengaturan?.ttd_penandatangan_keuangan_path),
      },
      jamaahUntukPembayaran,
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${dokumen.jenis}-${dokumen.nomor || dokumen.id}.pdf"`,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
