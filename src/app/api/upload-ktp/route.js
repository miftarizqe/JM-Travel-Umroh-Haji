import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 3 * 1024 * 1024; // 3MB

// POST /api/upload-ktp  (multipart: file)
// Foto KTP — dipakai pas isi formulir pendaftaran perwakilan.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'Foto KTP harus JPG atau PNG' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran foto maksimal 3MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'ktp');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `ktp_${auth.user.id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/ktp/${nama}`;
    await pool.query('UPDATE users SET foto_ktp_path = ? WHERE id = ?', [publicPath, auth.user.id]);

    return Response.json({ message: 'Foto KTP berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload foto KTP gagal:', error);
    return Response.json({ error: 'Gagal mengunggah foto KTP' }, { status: 500 });
  }
}
