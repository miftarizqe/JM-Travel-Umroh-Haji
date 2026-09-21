import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 3 * 1024 * 1024; // 3MB

// POST /api/upload-paspor  (multipart: file)
// Foto/scan paspor — OPSIONAL, cuma relevan kalau jamaah udah isi No.
// Paspor (dikonfirmasi user 2026-09-20, khusus wizard Sahabat Baitullah
// buat sekalian nyimpen data paspor jamaah yang udah punya, biar gak perlu
// diminta ulang pas beneran booking berangkat nanti). Mirror persis
// /api/upload-ktp/route.js.
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
      return Response.json({ error: 'Foto paspor harus JPG atau PNG' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran foto maksimal 3MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'paspor');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `paspor_${auth.user.id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/paspor/${nama}`;
    await pool.query('UPDATE users SET foto_paspor_path = ? WHERE id = ?', [publicPath, auth.user.id]);

    return Response.json({ message: 'Foto paspor berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload foto paspor gagal:', error);
    return Response.json({ error: 'Gagal mengunggah foto paspor' }, { status: 500 });
  }
}
