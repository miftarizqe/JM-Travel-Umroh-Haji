import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { cekDanFinalisasiLunasSahabat } from '@/lib/pembayaranSahabatMandiri';
import { catatRekening } from '@/lib/rekeningLedger';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB

// PATCH /api/admin/sahabat/komisi/[id]  (multipart: confirmed, file?)
// Checklist "udah ditransfer ke BSI & di-acc" — SENGAJA super_admin only
// (dikonfirmasi user), bukan admin biasa. Guard `jenis IN (...)` biar
// endpoint ini gak bisa dipakai ubah baris reseller_perwakilan (perwakilan).
// Transisi belum-confirmed -> confirmed WAJIB bawa bukti TF (dikonfirmasi
// user 2026-08-29 — "biar semua ada tracknya"); unconfirm gak perlu file,
// & file yang udah ada TETAP disimpan (histori) kalau nanti di-confirm ulang.
export async function PATCH(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const formData = await request.formData();
    const confirmed = formData.get('confirmed') === 'true';
    const file = formData.get('file');

    const [rows] = await pool.query(
      `SELECT id, jenis, nominal, booking_id, dikonfirmasi_at, pengajuan_ujroh_id FROM komisi_ledger
       WHERE id = ? AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat')`,
      [id]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Baris komisi tidak ditemukan' }, { status: 404 });
    }
    const sudahConfirmed = !!rows[0].dikonfirmasi_at;

    // Gerbang approval — baris yang udah masuk batch pengajuan mingguan
    // (`pengajuan_ujroh_id` keisi) CUMA boleh di-confirm (beneran TF) kalau
    // batch-nya udah 'disetujui' (bos udah TTD fisik di dokumen cetak) —
    // jangan sampai bisa TF duluan sebelum approval-nya kelar. Baris TANPA
    // pengajuan_ujroh_id (mis. pemakaian_saldo_sahabat checkout mandiri) gak
    // ikut alur pengajuan mingguan sama sekali, gak kena guard ini.
    if (confirmed && !sudahConfirmed && rows[0].pengajuan_ujroh_id) {
      const [[p]] = await pool.query('SELECT status FROM pengajuan_ujroh WHERE id = ?', [rows[0].pengajuan_ujroh_id]);
      if (!p || p.status !== 'disetujui') {
        return Response.json({ error: `Batch pengajuan ujroh ini belum disetujui (status: ${p?.status || '-'}). Konfirmasi baru bisa dilakukan setelah disetujui.` }, { status: 400 });
      }
    }
    // pemakaian_saldo_sahabat itu penyesuaian internal (saldo dipakai buat
    // booking sendiri), bukan transfer masuk — gak ada bukti TF eksternal
    // yang perlu diunggah, beda dari jenis lain di endpoint ini.
    // setoran_mandiri_sahabat juga dikecualikan — itu lahir langsung
    // dikonfirmasi_at terisi dari POST .../setoran-mandiri (gak ada tahap
    // pending di sini sama sekali), baris ini cuma kepakai kalau super_admin
    // sempat "Batalkan" lalu confirm ulang.
    const butuhBukti = confirmed && !sudahConfirmed && !['pemakaian_saldo_sahabat', 'setoran_mandiri_sahabat'].includes(rows[0].jenis);

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
      const nama = `buktitfkomisi_${id}_${Date.now()}${ext}`;
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

    // Rekening Sahabat Baitullah — uang keluar, cuma buat baris yang beneran
    // butuh bukti TF eksternal (buktiPath ada) — pemakaian_saldo_sahabat &
    // setoran_mandiri_sahabat SENGAJA gak dihitung, itu bukan transfer keluar
    // dari rekening pool ini (yang pertama saldo internal dipakai buat
    // booking sendiri, yang kedua duitnya emang gak pernah masuk rekening
    // JM Travel sama sekali — langsung ke rekening pribadi jamaah).
    if (confirmed && !sudahConfirmed && buktiPath) {
      await catatRekening(pool, {
        rekening: 'sahabat_baitullah', jenis: 'keluar', sumber_tipe: 'ujroh_tf',
        sumber_id: id, nominal: Number(rows[0].nominal || 0),
        keterangan: 'Ujroh Sahabat Baitullah — TF keluar',
      });
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: confirmed ? 'komisi_sahabat_confirm' : 'komisi_sahabat_unconfirm',
      target_type: 'komisi_ledger',
      target_id: String(id),
      keterangan: confirmed ? 'Ditandai sudah ditransfer & dikonfirmasi.' : 'Dibatalkan konfirmasinya.',
    });

    // Baris pemakaian saldo checkout-mandiri yang baru di-acc — cek apakah
    // booking terkait udah bisa difinalisasi lunas (nunggu sisi transfer
    // pribadi juga, kalau ada).
    if (confirmed && rows[0].jenis === 'pemakaian_saldo_sahabat' && rows[0].booking_id) {
      try {
        await cekDanFinalisasiLunasSahabat(pool, rows[0].booking_id, auth.user);
      } catch (e) {
        console.error('Gagal finalisasi lunas sahabat mandiri:', e);
      }
    }

    return Response.json({ message: 'Status konfirmasi diperbarui.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
