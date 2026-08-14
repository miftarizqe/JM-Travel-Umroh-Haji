import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 5 * 1024 * 1024; // 5MB

// POST /api/admin/perlengkapan-jamaah/upload-gambar  (multipart: file, id)
// Unggah foto buat 1 item perlengkapan (atau beberapa item sekaligus kalau
// admin pilih ID yang sama — foto boleh dipakai bareng buat 1 kelompok
// barang, sama kayak foto bawaan JM Travel yang dikelompokkan per kategori).
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
      return Response.json({ error: 'Gambar harus JPG atau PNG' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran gambar maksimal 5MB' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT id FROM perlengkapan_jamaah WHERE id = ?', [id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'perlengkapan-jamaah');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `perlengkapan_${id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/uploads/perlengkapan-jamaah/${nama}`;
    await pool.query('UPDATE perlengkapan_jamaah SET gambar = ? WHERE id = ?', [publicPath, id]);

    return Response.json({ message: 'Gambar berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload gambar perlengkapan gagal:', error);
    return Response.json({ error: 'Gagal mengunggah gambar' }, { status: 500 });
  }
}
