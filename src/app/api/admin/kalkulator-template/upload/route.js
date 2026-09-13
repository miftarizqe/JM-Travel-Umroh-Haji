import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { wajibSuperAdmin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 10 * 1024 * 1024; // 10MB

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
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran foto maksimal 10MB' }, { status: 400 });
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
