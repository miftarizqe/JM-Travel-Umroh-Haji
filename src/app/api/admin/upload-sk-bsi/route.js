import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB

// POST /api/admin/upload-sk-bsi  (multipart: file, user_id)
// Admin mengunggah scan SK BSI (Surat Kuasa BSI) untuk pendaftaran
// kemitraan perwakilan — dokumen ini syarat wajib sebelum status
// pendaftaran bisa dimajukan ke 'sk_bsi_verified' (lihat
// /api/status-pendaftaran). Disimpan ke pendaftaran (agen_pendaftaran)
// terbaru milik user tsb, sama pola dgn /api/admin/upload-ktp-fisik.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('user_id');

    if (!userId) {
      return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });
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

    const [rows] = await pool.query(
      'SELECT id FROM agen_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [userId]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Pendaftaran kemitraan tidak ditemukan untuk akun ini' }, { status: 404 });
    }
    const pendaftaranId = rows[0].id;

    const dir = path.join(process.cwd(), 'public', 'uploads', 'sk-bsi');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `skbsi_${userId}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/uploads/sk-bsi/${nama}`;
    await pool.query('UPDATE agen_pendaftaran SET sk_bsi_path = ? WHERE id = ?', [publicPath, pendaftaranId]);

    return Response.json({ message: 'SK BSI berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload SK BSI gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
