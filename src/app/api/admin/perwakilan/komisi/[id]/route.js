import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { catatRekening } from '@/lib/rekeningLedger';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024;

// PATCH /api/admin/perwakilan/komisi/[id]  (multipart: confirmed, file?)
// Checklist "udah ditransfer & di-acc" per baris — mirror PERSIS
// /api/admin/sahabat/komisi/[id], scoped ke jenis ujroh perwakilan.
export async function PATCH(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const formData = await request.formData();
    const confirmed = formData.get('confirmed') === 'true';
    const file = formData.get('file');

    const [rows] = await pool.query(
      `SELECT id, jenis, nominal, booking_id, dikonfirmasi_at, pengajuan_ujroh_perwakilan_id FROM komisi_ledger
       WHERE id = ? AND jenis IN ('ujroh_perwakilan', 'reseller_perwakilan')`,
      [id]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Baris komisi tidak ditemukan' }, { status: 404 });
    }
    const sudahConfirmed = !!rows[0].dikonfirmasi_at;

    // Gerbang approval — baris ini WAJIB udah masuk pengajuan yang statusnya
    // 'disetujui' (bos udah TTD fisik) sebelum bisa di-confirm beneran TF.
    // Beda dari Sahabat Baitullah yang punya baris "lepas" (pemakaian_saldo_
    // sahabat) tanpa pengajuan_ujroh_id — SEMUA ujroh perwakilan lewat
    // pipeline pengajuan, gak ada jalur lepas.
    if (confirmed && !sudahConfirmed) {
      if (!rows[0].pengajuan_ujroh_perwakilan_id) {
        return Response.json({ error: 'Baris ini belum masuk pengajuan manapun.' }, { status: 400 });
      }
      const [[p]] = await pool.query('SELECT status FROM pengajuan_ujroh_perwakilan WHERE id = ?', [rows[0].pengajuan_ujroh_perwakilan_id]);
      if (!p || p.status !== 'disetujui') {
        return Response.json({ error: `Batch pengajuan ini belum disetujui (status: ${p?.status || '-'}). Konfirmasi baru bisa dilakukan setelah disetujui.` }, { status: 400 });
      }
    }

    const butuhBukti = confirmed && !sudahConfirmed;
    let buktiPath = null;
    if (butuhBukti) {
      if (!file || typeof file === 'string') {
        return Response.json({ error: 'Bukti transfer wajib diunggah' }, { status: 400 });
      }
      if (!TIPE_OK.includes(file.type)) {
        return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
      }
      if (file.size > MAKS) {
        return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
      }

      const dir = path.join(process.cwd(), 'private-uploads', 'bukti-tf-komisi');
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
      const nama = `buktitfkomisiperw_${id}_${Date.now()}${ext}`;
      await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));
      buktiPath = `/api/dokumen/bukti-tf-komisi/${nama}`;
    }

    if (confirmed) {
      await pool.query(
        buktiPath
          ? 'UPDATE komisi_ledger SET dikonfirmasi_at = NOW(), bukti_tf_admin_path = ?, bukti_tf_admin_uploaded_at = NOW() WHERE id = ?'
          : 'UPDATE komisi_ledger SET dikonfirmasi_at = NOW() WHERE id = ?',
        buktiPath ? [buktiPath, id] : [id]
      );
    } else {
      await pool.query('UPDATE komisi_ledger SET dikonfirmasi_at = NULL WHERE id = ?', [id]);
    }

    // Rekening Alkhalid Jaya Megah — uang keluar (ujroh perwakilan yang
    // beneran ditransfer, dikonfirmasi user 2026-09-02).
    if (confirmed && !sudahConfirmed && buktiPath) {
      await catatRekening(pool, {
        rekening: 'alkhalid', jenis: 'keluar', sumber_tipe: 'ujroh_tf_perwakilan',
        sumber_id: id, nominal: Number(rows[0].nominal || 0),
        keterangan: 'Ujroh Perwakilan — TF keluar',
      });
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: confirmed ? 'komisi_perwakilan_confirm' : 'komisi_perwakilan_unconfirm',
      target_type: 'komisi_ledger',
      target_id: String(id),
      keterangan: confirmed ? 'Ditandai sudah ditransfer & dikonfirmasi.' : 'Dibatalkan konfirmasinya.',
    });

    return Response.json({ message: 'Status konfirmasi diperbarui.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
