import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB — bisa scan multi-halaman

// POST /api/admin/upload-dokumen-pks-fisik  (multipart: file, user_id)
// Unggah scan/foto dokumen SPKA/SPKA-Ins/SPKL yang sudah ditandatangani
// fisik — buat di-cross-check sama isi yang tercatat sistem (nomor surat,
// pasal beku, penandatangan beku). Simpan file + update users dalam satu
// request (bukan 2 langkah kayak upload-dokumen-jamaah) krn ini 1:1
// langsung ke 1 baris user, gak perlu state form perantara.
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

    const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'dokumen-pks-fisik');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `pks_${userId}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/dokumen-pks-fisik/${nama}`;
    await pool.query(
      'UPDATE users SET dokumen_pks_fisik_path = ?, dokumen_pks_fisik_uploaded_at = NOW() WHERE id = ?',
      [publicPath, userId]
    );

    return Response.json({ message: 'Dokumen fisik berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload dokumen PKS fisik gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
