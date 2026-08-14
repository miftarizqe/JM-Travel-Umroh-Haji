import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 3 * 1024 * 1024; // 3MB
// Whitelist kolom yang boleh diisi lewat endpoint ini — biar gak bisa
// nimpa kolom sembarangan di tabel pengaturan cuma dari nama field kiriman.
const KOLOM_OK = ['ttd_penandatangan_keuangan_path', 'cap_perusahaan_path'];

// POST /api/admin/pengaturan/upload-gambar (multipart: file, kolom)
// Upload gambar TTD digital penandatangan keuangan ATAU cap perusahaan —
// dua-duanya sama-sama disimpan di baris tunggal `pengaturan` (id=1).
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const kolom = formData.get('kolom');

    if (!KOLOM_OK.includes(kolom)) {
      return Response.json({ error: 'Kolom tidak valid' }, { status: 400 });
    }
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'Gambar harus JPG atau PNG' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran gambar maksimal 3MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'pengaturan');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.png';
    const nama = `${kolom}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/uploads/pengaturan/${nama}`;
    await pool.query(`UPDATE pengaturan SET ${kolom} = ? WHERE id = 1`, [publicPath]);

    return Response.json({ message: 'Gambar berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload gambar pengaturan gagal:', error);
    return Response.json({ error: 'Gagal mengunggah gambar' }, { status: 500 });
  }
}
