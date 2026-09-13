import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB — bisa scan multi-halaman
const JENIS_KOLOM = {
  spk_ak: { path: 'dokumen_spk_ak_fisik_path', uploadedAt: 'dokumen_spk_ak_fisik_uploaded_at', prefix: 'spkak' },
  sk_cif: { path: 'dokumen_sk_cif_fisik_path', uploadedAt: 'dokumen_sk_cif_fisik_uploaded_at', prefix: 'skcif' },
  surat_pemblokiran: { path: 'dokumen_surat_pemblokiran_fisik_path', uploadedAt: 'dokumen_surat_pemblokiran_fisik_uploaded_at', prefix: 'suratpemblokiran' },
};

// POST /api/admin/upload-dokumen-sahabat-fisik  (multipart: file, user_id, jenis)
// Satu route TERPARAMETERISASI buat SPK-AK & SK-CIF (bukan 2 route bespoke
// terpisah kayak pola dokumen lain di sistem) — isi penanganan filenya
// identik, cuma beda kolom target. Dipicu SENDIRI oleh anggota sahabat
// (upload scan dokumen yang sudah ditandatangani fisik di atas materai,
// SEBELUM salinan fisiknya dikirim ke kantor JM Travel) — jadi bukan
// admin-only kayak upload-dokumen-pks-fisik, boleh dipicu pemilik akun juga.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('user_id');
    const jenis = formData.get('jenis');

    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });
    const kolom = JENIS_KOLOM[jenis];
    if (!kolom) return Response.json({ error: 'Parameter jenis tidak valid' }, { status: 400 });

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin && String(userId) !== String(auth.user.id)) {
      return Response.json({ error: 'Anda tidak berwenang mengunggah dokumen ini' }, { status: 403 });
    }

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    }

    // Kategori storage SENGAJA dibiarkan 'dokumen-koperasi-fisik' (bukan
    // ikut rename) — dokumen fisik yang SUDAH terupload pakai prefix ini,
    // ganti nama bakal bikin src/lib/dokumenProteksi.js gak kenal lagi file
    // lama (403/404 dokumen legal beneran, SK-CIF/Surat Kuasa asli).
    const dir = path.join(process.cwd(), 'private-uploads', 'dokumen-koperasi-fisik');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `${kolom.prefix}_${userId}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/dokumen-koperasi-fisik/${nama}`;
    await pool.query(
      `UPDATE users SET ${kolom.path} = ?, ${kolom.uploadedAt} = NOW() WHERE id = ?`,
      [publicPath, userId]
    );

    return Response.json({ message: 'Dokumen fisik berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload dokumen sahabat fisik gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
