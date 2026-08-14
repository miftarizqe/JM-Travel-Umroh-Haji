import { readFile } from 'fs/promises';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { selesaikanTtd } from '@/lib/eSignature';
import { simpanPdfDokumenSignature } from '@/lib/pdfDokumen/simpanPdf';

// POST /api/dokumen-signature/[id]/selesaikan
// Trigger MOCK buat simulasi provider TTD selesai — di produksi nanti (begitu
// provider tersertifikasi sudah terhubung) ini digantikan endpoint webhook
// yang dipanggil provider, bukan tombol manual. Boleh dipicu admin ATAU
// signer sendiri (dari halaman /tanda-tangan/[id]), makanya cuma wajibLogin,
// bukan wajibRole(['admin']) — otorisasi lebih detail dicek di bawah.
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const [[sig]] = await pool.query('SELECT * FROM dokumen_signature WHERE id = ?', [id]);
    if (!sig) return Response.json({ error: 'Sesi tanda tangan tidak ditemukan' }, { status: 404 });
    if (sig.fase !== 'ttd_menunggu') {
      return Response.json({ error: `Sesi ini berstatus "${sig.fase}", belum siap diselesaikan.` }, { status: 400 });
    }

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin) {
      // Signer non-admin cuma boleh selesaikan sesi TTD miliknya sendiri —
      // dicocokkan ke email/wa yang tercatat waktu request dibuat, ATAU
      // (fallback) ke user_id booking untuk dokumen jamaah.
      let cocok = false;
      if (sig.dokumen === 'jamaah') {
        const [[b]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [sig.ref_id]);
        cocok = !!b && (b.user_id === auth.user.id || b.ordered_by === auth.user.id);
      } else if (sig.dokumen === 'spka_ins' || sig.dokumen === 'formulir') {
        cocok = sig.ref_id === auth.user.id;
      }
      if (!cocok) return Response.json({ error: 'Anda tidak berwenang menyelesaikan sesi ini' }, { status: 403 });
    }

    const sumberPath = sig.pdf_bermaterai_path || sig.pdf_awal_path;
    const pdfBuffer = await readFile(path.join(process.cwd(), 'public', sumberPath.replace(/^\//, '')));

    const hasil = await selesaikanTtd({
      providerRef: sig.ttd_provider_ref,
      signer: { nama: sig.signer_nama, email: sig.signer_email, wa: sig.signer_wa },
      pdfBuffer,
      dokumen: sig.dokumen,
    });
    const pdfFinalPath = await simpanPdfDokumenSignature(hasil.pdfBuffer, { dokumen: sig.dokumen, refId: sig.ref_id, tahap: 'final' });

    await pool.query(
      `UPDATE dokumen_signature SET fase = 'selesai', pdf_final_path = ?, completed_at = ? WHERE id = ?`,
      [pdfFinalPath, hasil.selesaiAt, sig.id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'dokumen_signature_selesai',
      target_type: sig.dokumen,
      target_id: sig.ref_id,
      keterangan: `TTD digital selesai (${sig.ttd_provider || 'mock'}).`,
    });

    if (sig.requested_by && sig.requested_by !== auth.user.id) {
      await kirimNotifikasi(pool, {
        user_id: sig.requested_by,
        tipe: 'dokumen_ttd_selesai',
        judul: 'Dokumen Selesai Ditandatangani',
        pesan: `Dokumen ${sig.dokumen} sudah selesai ditandatangani secara digital.`,
        link: `/tanda-tangan/${sig.id}`,
      });
    }

    return Response.json({ message: 'Tanda tangan digital selesai!', pdf_final_path: pdfFinalPath });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
