import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatRekening } from '@/lib/rekeningLedger';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024;

// POST /api/sahabat/upload-bukti-tf  (multipart: file)
// Self-service, wajibLogin — bukti transfer Rp1.000.000 pendaftaran
// sahabat, milik akun yang lagi login sendiri (bukan admin, gak butuh
// user_id di body).
//
// Sahabat Baitullah CUMA bisa daftar via referral (bukan publik random),
// jadi TF gak lagi butuh verifikasi admin sebelum lanjut (dikonfirmasi
// user 2026-09-02) — begitu file keupload, langsung dianggap terverifikasi
// & status auto-maju ke 'menunggu_bsi'. Gate kepercayaan dipindah ke 2
// titik lain: ACC voucher (disetujui_at, lihat
// project_voucher_sejuta_auto_generate) dan aktivasi akun (advance ke
// 'active', tetap wajib CIF+SK-CIF+Surat Kuasa lengkap + aksi admin).
// Admin masih bisa 'reject' pendaftaran kapan saja kalau ternyata bukti
// TF-nya bermasalah — itu jaring pengamannya sekarang, bukan gate di muka.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[pendaftaran]] = await pool.query(
      'SELECT id, bukti_tf_verified_at FROM sahabat_pendaftaran WHERE user_id = ?',
      [auth.user.id]
    );
    if (!pendaftaran) {
      return Response.json({ error: 'Isi data diri pendaftaran sahabat terlebih dahulu' }, { status: 400 });
    }
    if (pendaftaran.bukti_tf_verified_at) {
      return Response.json({ error: 'Bukti transfer sudah diunggah, tidak bisa diganti' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
    }

    // Kategori storage SENGAJA dibiarkan 'bukti-tf-koperasi' (bukan ikut
    // rename) — bukti TF yang SUDAH terupload pakai prefix ini, lihat
    // catatan sama di upload-dokumen-sahabat-fisik/route.js.
    const dir = path.join(process.cwd(), 'private-uploads', 'bukti-tf-koperasi');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `buktitf_${auth.user.id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/bukti-tf-koperasi/${nama}`;
    await pool.query(
      `UPDATE sahabat_pendaftaran
       SET bukti_tf_path = ?, bukti_tf_uploaded_at = NOW(), bukti_tf_verified_at = NOW(), status = 'menunggu_bsi'
       WHERE user_id = ?`,
      [publicPath, auth.user.id]
    );
    await pool.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('sahabat_baitullah', ?, 'menunggu_bsi', 'Bukti transfer diunggah — auto-lanjut (referral, tanpa gate admin)')",
      [auth.user.id]
    );

    // Rekening Sahabat Baitullah — uang masuk (setoran Rp1jt pendaftaran),
    // dikonfirmasi user 2026-09-02. Nominal hardcode 1000000 sama kayak
    // potongan voucher auto-generate di status-pendaftaran-sahabat/route.js
    // (SATU sumber angka yang sama, jangan baca dari tempat lain).
    await catatRekening(pool, {
      rekening: 'sahabat_baitullah', jenis: 'masuk', sumber_tipe: 'setoran_pendaftaran',
      sumber_id: auth.user.id, nominal: 1000000,
      keterangan: `Setoran pendaftaran Rp1.000.000 — ${auth.user.name || auth.user.id}`,
    });

    return Response.json({ message: 'Bukti transfer berhasil diunggah, lanjut ke tahap akun BSI!', path: publicPath });
  } catch (error) {
    console.error('Upload bukti TF sahabat gagal:', error);
    return Response.json({ error: 'Gagal mengunggah bukti transfer' }, { status: 500 });
  }
}
