import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024;

// Validasi + simpan file scan TTD ke disk, balikin path publik-nya (atau
// { error } kalau gagal validasi) — dipakai bareng action 'setujui' &
// 'lampirkan_bukti_ttd', dua-duanya nyimpen ke folder & pola nama yang sama.
async function simpanBuktiTtd(file, id) {
  if (!file || typeof file === 'string') {
    return { error: 'Scan dokumen yang udah di-TTD bos wajib diunggah sebagai bukti ACC.' };
  }
  if (!TIPE_OK.includes(file.type)) {
    return { error: 'File harus JPG, PNG, atau PDF' };
  }
  if (file.size > MAKS) {
    return { error: 'Ukuran file maksimal 10MB' };
  }
  const dir = path.join(process.cwd(), 'private-uploads', 'bukti-ttd-ujroh');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
  const nama = `buktittd_${id}_${Date.now()}${ext}`;
  await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));
  return { path: `/api/dokumen/bukti-ttd-ujroh/${nama}` };
}

// PATCH /api/admin/sahabat/pengajuan-ujroh/[id]  (multipart: action, catatan?, file?)
// action: 'ajukan' (draft->diajukan, abis dicetak buat TTD bos) |
// 'setujui' (diajukan->disetujui) | 'tolak' (diajukan->ditolak, baris LEPAS
// dari batch ini biar otomatis masuk batch berikutnya, BUKAN hilang) |
// 'lampirkan_bukti_ttd' (disetujui TANPA bukti -> tetap disetujui, cuma
// nempelin file yang tadinya kosong).
//
// 'setujui' TIDAK LAGI cuma diklik super_admin tanpa bukti (2026-09-02,
// dikonfirmasi user) — approval bos itu KEJADIAN FISIK (TTD di atas kertas
// hasil print), bukan keputusan yang diambil di sistem. Jadi sekarang WAJIB
// upload scan dokumen yang udah di-TTD sebagai BUKTI udah di-ACC, disimpan
// ke `bukti_ttd_path` — upload-nya sendiri YANG jadi penanda status
// 'disetujui', bukan tombol approve terpisah tanpa lampiran. 'tolak' TETAP
// klik biasa (gak ada dokumen fisik buat penolakan verbal).
//
// 'lampirkan_bukti_ttd' nutup GAP buat pengajuan LAMA yang udah kepalang
// 'disetujui' lewat tombol klik-doang SEBELUM aturan wajib-upload ini ada
// (misal Pengajuan #3) — `bukti_ttd_path`-nya NULL selamanya kalau gak ada
// jalan buat nyusulin. TIDAK mengubah status/diputuskan_at (keputusannya
// udah diambil dulu, ini cuma melengkapi bukti fisiknya belakangan).
export async function PATCH(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const formData = await request.formData();
    const action = formData.get('action');
    const catatan = formData.get('catatan');
    const file = formData.get('file');

    const [[p]] = await pool.query('SELECT * FROM pengajuan_ujroh WHERE id = ?', [id]);
    if (!p) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });

    if (action === 'ajukan') {
      if (p.status !== 'draft') return Response.json({ error: 'Cuma pengajuan draft yang bisa diajukan.' }, { status: 400 });
      await pool.query(
        "UPDATE pengajuan_ujroh SET status='diajukan', diajukan_oleh=?, diajukan_at=NOW() WHERE id=?",
        [auth.user.id, id]
      );
    } else if (action === 'setujui') {
      if (p.status !== 'diajukan') return Response.json({ error: 'Cuma pengajuan yang udah diajukan yang bisa disetujui.' }, { status: 400 });
      const hasil = await simpanBuktiTtd(file, id);
      if (hasil.error) return Response.json({ error: hasil.error }, { status: 400 });

      await pool.query(
        "UPDATE pengajuan_ujroh SET status='disetujui', diputuskan_oleh=?, diputuskan_at=NOW(), catatan_keputusan=?, bukti_ttd_path=? WHERE id=?",
        [auth.user.id, catatan || null, hasil.path, id]
      );
    } else if (action === 'lampirkan_bukti_ttd') {
      if (p.status !== 'disetujui') return Response.json({ error: 'Cuma pengajuan yang udah disetujui yang bisa dilampirkan bukti TTD.' }, { status: 400 });
      if (p.bukti_ttd_path) return Response.json({ error: 'Pengajuan ini udah punya bukti TTD, gak bisa ditimpa.' }, { status: 400 });
      const hasil = await simpanBuktiTtd(file, id);
      if (hasil.error) return Response.json({ error: hasil.error }, { status: 400 });

      await pool.query('UPDATE pengajuan_ujroh SET bukti_ttd_path = ? WHERE id = ?', [hasil.path, id]);
    } else if (action === 'tolak') {
      if (p.status !== 'diajukan') return Response.json({ error: 'Cuma pengajuan yang udah diajukan yang bisa ditolak.' }, { status: 400 });
      await pool.query(
        "UPDATE pengajuan_ujroh SET status='ditolak', diputuskan_oleh=?, diputuskan_at=NOW(), catatan_keputusan=? WHERE id=?",
        [auth.user.id, catatan || null, id]
      );
      // Baris LEPAS dari batch yang ditolak — balik jadi pending biasa,
      // otomatis ke-include lagi pas admin bikin pengajuan berikutnya.
      await pool.query('UPDATE komisi_ledger SET pengajuan_ujroh_id = NULL WHERE pengajuan_ujroh_id = ?', [id]);
    } else {
      return Response.json({ error: 'Action tidak dikenal' }, { status: 400 });
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: `pengajuan_ujroh_${action}`,
      target_type: 'pengajuan_ujroh',
      target_id: id,
      keterangan: `Pengajuan ujroh #${id} (${fmtRp(p.grand_total)}, ${p.jumlah_baris} baris) → ${action}`,
    });

    return Response.json({ message: 'Status pengajuan diperbarui.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

// DELETE /api/admin/sahabat/pengajuan-ujroh/[id] — buang pengajuan yang
// SALAH BIKIN sebelum sempat di-ACC (draft/diajukan doang, dikonfirmasi
// user 2026-09-02 — "gabisa diedit/dihapus kah kalo belom di acc?"). Sekali
// 'disetujui' ATAU 'ditolak' udah jadi KEPUTUSAN tercatat (fisik TTD ada
// atau history penolakan) — dikunci, gak bisa dihapus, cuma bisa dibuat
// pengajuan baru buat koreksi. Baris komisi_ledger yang kesapu LEPAS balik
// jadi pending biasa (pola sama kayak 'tolak'), gak ikut kehapus.
export async function DELETE(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const [[p]] = await pool.query('SELECT * FROM pengajuan_ujroh WHERE id = ?', [id]);
    if (!p) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (!['draft', 'diajukan'].includes(p.status)) {
      return Response.json({ error: 'Pengajuan yang udah disetujui/ditolak gak bisa dihapus — itu udah jadi keputusan tercatat.' }, { status: 400 });
    }

    await pool.query('UPDATE komisi_ledger SET pengajuan_ujroh_id = NULL WHERE pengajuan_ujroh_id = ?', [id]);
    await pool.query('DELETE FROM pengajuan_ujroh WHERE id = ?', [id]);

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'pengajuan_ujroh_hapus',
      target_type: 'pengajuan_ujroh',
      target_id: id,
      keterangan: `Pengajuan ujroh #${id} (${fmtRp(p.grand_total)}, ${p.jumlah_baris} baris) dihapus — baris lepas balik ke pending.`,
    });

    return Response.json({ message: 'Pengajuan dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
