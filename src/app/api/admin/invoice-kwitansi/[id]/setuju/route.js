import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// UU Bea Meterai No.10/2020 Pasal 3 — dokumen yang menyatakan PENERIMAAN
// uang dengan nilai nominal LEBIH DARI Rp5.000.000 wajib materai Rp10.000
// asli (strictly di atas, persis Rp5jt TIDAK kena, dikonfirmasi user
// 2026-10-13). Sama persis logika `butuhMaterai` di halaman cetak
// (/admin/cetak-invoice/[id]/page.jsx) — JANGAN diubah sendiri2, kalau
// salah satu berubah yang lain ikut.
const BATAS_MATERAI = 5_000_000;

// POST /api/admin/invoice-kwitansi/[id]/setuju — "Setuju" tanpa cetak fisik
// (dikonfirmasi user 2026-10-04: TTD digital/e-materai beneran belum ada,
// ini cuma self-certify admin). CUMA boleh dipakai buat dokumen yang gak
// wajib materai (nominal < Rp5jt) — begitu wajib materai, satu-satunya
// jalur sah adalah cetak fisik + materai asli + TTD basah + scan (lihat
// /api/admin/invoice-kwitansi/[id]/scan-fisik), dipaksa di server di sini
// juga (bukan cuma disembunyikan di UI) biar gak bisa dilewatin lewat
// panggilan API langsung (dikonfirmasi user 2026-10-13).
//
// Sebelumnya endpoint ini ditangani Go backend (lihat komentar lama di
// halaman cetak) — dipindah ke Next.js supaya gating materai di atas bisa
// ditegakkan tanpa perlu sentuh repo jm-travel-api. Kalau Caddyfile.tahap2
// di VPS masih proxy path ini ke Go, endpoint ini gak akan kepanggil sampai
// routing-nya disesuaikan juga.
export async function POST(request, { params }) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const [[dokumen]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [id]);
    if (!dokumen) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
    if (dokumen.terkirim) {
      return Response.json({ error: 'Dokumen ini sudah disetujui/dikirim sebelumnya.' }, { status: 400 });
    }

    const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || dokumen.status === 'paid';
    const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) > BATAS_MATERAI;
    if (butuhMaterai) {
      return Response.json(
        { error: `Nominal Rp${Number(dokumen.nominal).toLocaleString('id-ID')} wajib materai asli — tidak bisa disetujui tanpa materai. Cetak fisik, tempel materai, TTD basah, lalu unggah scan.` },
        { status: 400 }
      );
    }

    const terkirimAt = new Date();
    await pool.query(
      "UPDATE invoice_kwitansi SET terkirim = 1, terkirim_metode = 'setuju', terkirim_at = ? WHERE id = ?",
      [terkirimAt, id]
    );

    return Response.json({ message: 'Dokumen disetujui.', terkirim_at: terkirimAt.toISOString() });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
