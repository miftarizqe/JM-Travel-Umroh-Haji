import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { saldoSahabat, catatPerubahanSaldo, JENIS_SALDO_SAHABAT } from '@/lib/saldoSahabat';
import { cekDanFinalisasiLunasSahabat } from '@/lib/pembayaranSahabatMandiri';
import { catatRekening } from '@/lib/rekeningLedger';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024;
const JENIS_TANPA_BUKTI = ['pemakaian_saldo_sahabat', 'setoran_mandiri_sahabat', 'koreksi_saldo_sahabat'];

function fmtTgl(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// PATCH /api/admin/sahabat/komisi/konfirmasi-batch  (multipart: ids (JSON
// array), file?)
// Konfirmasi SEKALIGUS beberapa baris komisi_ledger yang SATU bukti TF-nya
// sama (dikonfirmasi user 2026-10-05 — sebelumnya FE loop manggil PATCH
// /api/admin/sahabat/komisi/[id] satu-satu per baris pake file yang sama,
// jadinya 1 transfer fisik ke BSI kecatat jadi BEBERAPA baris terpisah di
// rekening_ledger, padahal uangnya cuma sekali jalan — bikin "Keluar"
// Rekening 3-Bank numpuk gak sesuai kenyataan). Endpoint lama TETAP ada
// (dipake confirm 1 baris lepas / bulk-select campuran jenis di Database
// Jamaah yang masih lewat sini juga). Di sini, baris yang butuh bukti
// DIKELOMPOKKAN per pengajuan_ujroh_id (null-safe) lalu ditulis SATU baris
// rekening_ledger per kelompok (nominal dijumlah) — bukan per baris lagi.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
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
      `SELECT id, jenis, nominal, booking_id, penerima_id, penerima_nama, bukti_tf_admin_path, dikonfirmasi_at, pengajuan_ujroh_id FROM komisi_ledger
       WHERE id IN (${ids.map(() => '?').join(',')}) AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat','koreksi_saldo_sahabat')`,
      ids
    );
    if (rows.length !== ids.length) {
      return Response.json({ error: 'Sebagian baris tidak ditemukan atau bukan jenis yang bisa dikonfirmasi di sini' }, { status: 400 });
    }

    const belumConfirm = rows.filter(r => !r.dikonfirmasi_at);
    if (belumConfirm.length === 0) {
      return Response.json({ error: 'Semua baris yang dipilih sudah dikonfirmasi' }, { status: 400 });
    }

    // Gerbang approval — sama persis per-baris (lihat komentar di
    // /api/admin/sahabat/komisi/[id]), dicek SEMUA dulu sebelum nulis apapun
    // biar gak ada perubahan setengah-jalan kalau salah satu batch belum ACC.
    const pengajuanIds = [...new Set(belumConfirm.map(r => r.pengajuan_ujroh_id).filter(Boolean))];
    if (pengajuanIds.length > 0) {
      const [pRows] = await pool.query(
        `SELECT id, status FROM pengajuan_ujroh WHERE id IN (${pengajuanIds.map(() => '?').join(',')})`,
        pengajuanIds
      );
      const statusById = Object.fromEntries(pRows.map(p => [p.id, p.status]));
      for (const pid of pengajuanIds) {
        if (statusById[pid] !== 'disetujui') {
          return Response.json({ error: `Batch pengajuan #${pid} belum disetujui (status: ${statusById[pid] || '-'}). Konfirmasi baru bisa dilakukan setelah disetujui.` }, { status: 400 });
        }
      }
    }

    const butuhBuktiRows = belumConfirm.filter(r => !JENIS_TANPA_BUKTI.includes(r.jenis));
    let buktiPath = null;
    if (butuhBuktiRows.length > 0) {
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
      const nama = `buktitfkomisi_batch_${Date.now()}${ext}`;
      await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));
      buktiPath = `/api/dokumen/bukti-tf-komisi/${nama}`;
    }

    for (const r of belumConfirm) {
      const pakaiBukti = !JENIS_TANPA_BUKTI.includes(r.jenis);
      const berpengaruhKeSaldo = JENIS_SALDO_SAHABAT.includes(r.jenis) && !!r.penerima_id;
      const saldoSebelum = berpengaruhKeSaldo ? await saldoSahabat(pool, r.penerima_id) : null;

      await pool.query(
        pakaiBukti
          ? 'UPDATE komisi_ledger SET dikonfirmasi_at = NOW(), bukti_tf_admin_path = ?, bukti_tf_admin_uploaded_at = NOW() WHERE id = ?'
          : 'UPDATE komisi_ledger SET dikonfirmasi_at = NOW() WHERE id = ?',
        pakaiBukti ? [buktiPath, r.id] : [r.id]
      );

      await catatPerubahanSaldo(pool, {
        actor: auth.user,
        userId: berpengaruhKeSaldo ? r.penerima_id : null,
        saldoSebelum,
        aksi: 'komisi_sahabat_confirm',
        target_type: 'komisi_ledger',
        target_id: String(r.id),
        keterangan: `Ditandai sudah ditransfer & dikonfirmasi — ${r.jenis}, Rp${Number(r.nominal || 0).toLocaleString('id-ID')}.`,
        bukti_path: pakaiBukti ? buktiPath : (r.bukti_tf_admin_path || null),
      });

      if (r.jenis === 'pemakaian_saldo_sahabat' && r.booking_id) {
        try { await cekDanFinalisasiLunasSahabat(pool, r.booking_id, auth.user); }
        catch (e) { console.error('Gagal finalisasi lunas sahabat mandiri:', e); }
      }
    }

    // 1 baris rekening_ledger PER KELOMPOK pengajuan_ujroh_id (null-safe) —
    // bukan per komisi_ledger row lagi, lihat komentar di atas.
    if (buktiPath && butuhBuktiRows.length > 0) {
      const kelompok = new Map();
      for (const r of butuhBuktiRows) {
        const key = r.pengajuan_ujroh_id || 'lepas';
        if (!kelompok.has(key)) kelompok.set(key, []);
        kelompok.get(key).push(r);
      }
      for (const [key, items] of kelompok) {
        const total = items.reduce((s, r) => s + Number(r.nominal || 0), 0);
        const namaSet = [...new Set(items.map(r => r.penerima_nama).filter(Boolean))];
        const namaLabel = namaSet.length === 1 ? namaSet[0] : `${namaSet.length} penerima`;
        let periodeLabel = '';
        if (key !== 'lepas') {
          const [[pengajuan]] = await pool.query('SELECT periode_mulai, periode_selesai FROM pengajuan_ujroh WHERE id = ?', [key]);
          if (pengajuan) periodeLabel = ` — Periode ${fmtTgl(pengajuan.periode_mulai)}–${fmtTgl(pengajuan.periode_selesai)}`;
        }
        await catatRekening(pool, {
          rekening: 'sahabat_baitullah', jenis: 'keluar', sumber_tipe: 'ujroh_tf',
          sumber_id: items.map(r => r.id).join(','), nominal: total,
          keterangan: `Ujroh Sahabat Baitullah — ${namaLabel}${periodeLabel}${items.length > 1 ? ` (${items.length} item)` : ''}`,
        });
      }
    }

    return Response.json({ message: `${belumConfirm.length} baris dikonfirmasi.` });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
