import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { wajibSuperAdmin } from '@/lib/auth';
import { pesanUkuranFile } from '@/lib/batasUpload';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];

// POST /api/admin/kalkulator-template/upload  (multipart: file) — foto paket
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'Foto harus JPG atau PNG' }, { status: 400 });
    }
    const errUkuran = pesanUkuranFile(file);
    if (errUkuran) {
      return Response.json({ error: errUkuran }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'kalkulator-template');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `paket_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    return Response.json({ path: `/uploads/kalkulator-template/${nama}` });
  } catch (error) {
    console.error('Upload foto template kalkulator gagal:', error);
    return Response.json({ error: 'Gagal mengunggah foto' }, { status: 500 });
  }
}
