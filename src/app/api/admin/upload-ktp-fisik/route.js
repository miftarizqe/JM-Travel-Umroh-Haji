import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB

// POST /api/admin/upload-ktp-fisik  (multipart: file, user_id)
// Versi ADMIN dari /api/upload-ktp (yang itu self-service, selalu upload ke
// akun yang lagi login — gak bisa dipakai admin upload-in punya orang lain).
// Buat nge-backfill foto KTP perwakilan lama yang belum pernah unggah
// (mayoritas kasusnya, cek DB: 0/14 perwakilan yang udah ada).
// Simpan ke folder & kolom yang SAMA (private-uploads/ktp, users.foto_ktp_path)
// biar renderNik() di Database Perwakilan otomatis kepake.
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

    const dir = path.join(process.cwd(), 'private-uploads', 'ktp');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `ktp_${userId}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/ktp/${nama}`;
    await pool.query('UPDATE users SET foto_ktp_path = ? WHERE id = ?', [publicPath, userId]);

    return Response.json({ message: 'Foto KTP berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload KTP (admin) gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
