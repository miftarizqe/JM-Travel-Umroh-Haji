// Inti penyelesaian satu sesi TTD — dipakai bareng oleh dua pemanggil:
// 1) tombol manual mock (src/app/api/dokumen-signature/[id]/selesaikan) yang
//    dipicu user login (admin/signer sendiri), dan
// 2) webhook provider tersertifikasi (mis. src/app/api/webhook/privy-ttd)
//    yang dipicu server provider tanpa sesi login user — makanya `actor`
//    opsional (null kalau dari webhook; catatAudit otomatis skip kalau
//    actor.id kosong, lihat src/lib/audit.js).
import { readFile } from 'fs/promises';
import pool from '@/lib/db';
import { catatAudit } from '@/lib/audit';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { selesaikanTtd } from '@/lib/eSignature';
import { simpanPdfDokumenSignature } from '@/lib/pdfDokumen/simpanPdf';
import { absolutePathDariUrl } from '@/lib/dokumenProteksi';

export async function selesaikanSesiTtdById(sigId, { actor } = {}) {
  const [[sig]] = await pool.query('SELECT * FROM dokumen_signature WHERE id = ?', [sigId]);
  if (!sig) throw Object.assign(new Error('Sesi tanda tangan tidak ditemukan'), { status: 404 });
  if (sig.fase !== 'ttd_menunggu') {
    throw Object.assign(new Error(`Sesi ini berstatus "${sig.fase}", belum siap diselesaikan.`), { status: 400 });
  }

  const sumberPath = sig.pdf_bermaterai_path || sig.pdf_awal_path;
  const pdfBuffer = await readFile(absolutePathDariUrl(sumberPath));

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
    actor,
    aksi: 'dokumen_signature_selesai',
    target_type: sig.dokumen,
    target_id: sig.ref_id,
    keterangan: `TTD digital selesai (${sig.ttd_provider || 'mock'}).`,
  });

  if (sig.requested_by && (!actor || sig.requested_by !== actor.id)) {
    await kirimNotifikasi(pool, {
      user_id: sig.requested_by,
      tipe: 'dokumen_ttd_selesai',
      judul: 'Dokumen Selesai Ditandatangani',
      pesan: `Dokumen ${sig.dokumen} sudah selesai ditandatangani secara digital.`,
      link: `/tanda-tangan/${sig.id}`,
    });
  }

  return { sig, pdfFinalPath };
}
