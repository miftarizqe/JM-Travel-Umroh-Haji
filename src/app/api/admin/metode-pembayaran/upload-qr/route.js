import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 3 * 1024 * 1024; // 3MB

// POST /api/admin/metode-pembayaran/upload-qr  (multipart: file, id)
// Unggah gambar QR code (mis. buat QRIS) buat 1 metode pembayaran.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const id = formData.get('id');

    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'Gambar QR harus JPG atau PNG' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran gambar maksimal 3MB' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT id FROM metode_pembayaran WHERE id = ?', [id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Metode tidak ditemukan' }, { status: 404 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'metode-pembayaran');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `qr_${id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/uploads/metode-pembayaran/${nama}`;
    await pool.query('UPDATE metode_pembayaran SET gambar_qr = ? WHERE id = ?', [publicPath, id]);

    return Response.json({ message: 'Gambar QR berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload QR metode pembayaran gagal:', error);
    return Response.json({ error: 'Gagal mengunggah gambar' }, { status: 500 });
  }
}
