import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const JENIS_LOCK_ON_SEND = ['tanda_terima', 'kwitansi'];

// POST /api/admin/invoice-kwitansi/[id]/snapshot — simpan html_snapshot
// BEKU (migration 227, dikonfirmasi user 2026-10-14: "walaupun next time
// format/nama paket/siapa yg ttd diubah, yang udah terkirim gabakal
// ikutan berubah"). Dipanggil CLIENT-SIDE langsung setelah POST .../setuju
// sukses (lihat cetak-invoice/[id]/page.jsx) — HTML yang dikirim HASIL
// RENDER React di browser admin SAAT ITU JUGA (innerHTML div .sheet),
// BUKAN di-generate server-side — React 19 ngeblok ReactDOMServer dipakai
// di dalam Route Handler App Router ("react-dom/server is not supported
// in React Server Components", ketemu pas nyoba render di sini duluan).
// Idempotent & cuma berlaku buat dokumen yang SUDAH terkirim — gak bisa
// dipakai nulis konten dokumen yang belum resmi dikirim (jadi gak ada
// jalur buat "nge-preview-tapi-nyangkut-jadi-beku" lewat panggilan API
// langsung).
export async function POST(request, { params }) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { html } = await request.json();
    if (!html) return Response.json({ error: 'html wajib diisi' }, { status: 400 });

    const [[dokumen]] = await pool.query('SELECT jenis, terkirim, html_snapshot FROM invoice_kwitansi WHERE id = ?', [id]);
    if (!dokumen) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
    if (!dokumen.terkirim) return Response.json({ error: 'Dokumen belum dikirim, belum boleh dibekukan.' }, { status: 400 });
    if (!JENIS_LOCK_ON_SEND.includes(dokumen.jenis)) {
      return Response.json({ error: 'Jenis dokumen ini belum pakai snapshot beku.' }, { status: 400 });
    }
    if (dokumen.html_snapshot) {
      return Response.json({ message: 'Sudah ada snapshot, tidak ditimpa.' });
    }

    await pool.query('UPDATE invoice_kwitansi SET html_snapshot = ? WHERE id = ?', [html, id]);
    return Response.json({ message: 'Snapshot disimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
