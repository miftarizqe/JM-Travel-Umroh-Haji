import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { catatRekening } from '@/lib/rekeningLedger';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024;

// PATCH /api/admin/perwakilan/komisi/konfirmasi-batch — mirror PERSIS
// /api/admin/sahabat/komisi/konfirmasi-batch, scoped ke jenis ujroh
// perwakilan (lihat komentar di file itu buat alasan lengkap).
export async function PATCH(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    let ids;
    try { ids = JSON.parse(formData.get('ids') || '[]'); } catch { ids = []; }
    ids = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (ids.length === 0) return Response.json({ error: 'Gak ada baris yang dipilih' }, { status: 400 });
    if (ids.length > 50) return Response.json({ error: 'Maksimal 50 baris per batch' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT id, jenis, nominal, booking_id, penerima_id, penerima_nama, dikonfirmasi_at, pengajuan_ujroh_perwakilan_id FROM komisi_ledger
       WHERE id IN (${ids.map(() => '?').join(',')}) AND jenis IN ('ujroh_perwakilan', 'reseller_perwakilan')`,
      ids
    );
    if (rows.length !== ids.length) {
      return Response.json({ error: 'Sebagian baris tidak ditemukan atau bukan jenis yang bisa dikonfirmasi di sini' }, { status: 400 });
    }

    const belumConfirm = rows.filter(r => !r.dikonfirmasi_at);
    if (belumConfirm.length === 0) {
      return Response.json({ error: 'Semua baris yang dipilih sudah dikonfirmasi' }, { status: 400 });
    }

    // Beda dari Sahabat Baitullah — SEMUA ujroh perwakilan lewat pipeline
    // pengajuan, gak ada jalur lepas (lihat komentar di
    // /api/admin/perwakilan/komisi/[id]).
    for (const r of belumConfirm) {
      if (!r.pengajuan_ujroh_perwakilan_id) {
        return Response.json({ error: `Baris #${r.id} belum masuk pengajuan manapun.` }, { status: 400 });
      }
    }
    const pengajuanIds = [...new Set(belumConfirm.map(r => r.pengajuan_ujroh_perwakilan_id))];
    const [pRows] = await pool.query(
      `SELECT id, status FROM pengajuan_ujroh_perwakilan WHERE id IN (${pengajuanIds.map(() => '?').join(',')})`,
      pengajuanIds
    );
    const statusById = Object.fromEntries(pRows.map(p => [p.id, p.status]));
    for (const pid of pengajuanIds) {
      if (statusById[pid] !== 'disetujui') {
        return Response.json({ error: `Batch pengajuan #${pid} belum disetujui (status: ${statusById[pid] || '-'}). Konfirmasi baru bisa dilakukan setelah disetujui.` }, { status: 400 });
      }
    }

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
    const nama = `buktitfkomisiperw_batch_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));
    const buktiPath = `/api/dokumen/bukti-tf-komisi/${nama}`;

    for (const r of belumConfirm) {
      await pool.query(
        'UPDATE komisi_ledger SET dikonfirmasi_at = NOW(), bukti_tf_admin_path = ?, bukti_tf_admin_uploaded_at = NOW() WHERE id = ?',
        [buktiPath, r.id]
      );
      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'komisi_perwakilan_confirm',
        target_type: 'komisi_ledger',
        target_id: String(r.id),
        keterangan: `Ditandai sudah ditransfer & dikonfirmasi — ${r.jenis}, Rp${Number(r.nominal || 0).toLocaleString('id-ID')}.`,
      });
    }

    // 1 baris rekening_ledger PER KELOMPOK pengajuan_ujroh_perwakilan_id —
    // bukan per komisi_ledger row lagi.
    const kelompok = new Map();
    for (const r of belumConfirm) {
      const key = r.pengajuan_ujroh_perwakilan_id;
      if (!kelompok.has(key)) kelompok.set(key, []);
      kelompok.get(key).push(r);
    }
    for (const [key, items] of kelompok) {
      const total = items.reduce((s, r) => s + Number(r.nominal || 0), 0);
      const namaSet = [...new Set(items.map(r => r.penerima_nama).filter(Boolean))];
      const namaLabel = namaSet.length === 1 ? namaSet[0] : `${namaSet.length} penerima`;
      // Pengajuan perwakilan dikelompokkan per PROGRAM, bukan periode
      // tanggal (beda dari Sahabat Baitullah) — lihat src/lib/pengajuanUjrohPerwakilan.js.
      const [[pengajuan]] = await pool.query(
        `SELECT pr.name AS prog_name FROM pengajuan_ujroh_perwakilan p JOIN programs pr ON pr.id = p.prog_id WHERE p.id = ?`,
        [key]
      );
      const periodeLabel = pengajuan ? ` — ${pengajuan.prog_name}` : '';
      await catatRekening(pool, {
        rekening: 'alkhalid', jenis: 'keluar', sumber_tipe: 'ujroh_tf_perwakilan',
        sumber_id: items.map(r => r.id).join(','), nominal: total,
        keterangan: `Ujroh Perwakilan — ${namaLabel}${periodeLabel}${items.length > 1 ? ` (${items.length} item)` : ''}`,
      });
    }

    return Response.json({ message: `${belumConfirm.length} baris dikonfirmasi.` });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
