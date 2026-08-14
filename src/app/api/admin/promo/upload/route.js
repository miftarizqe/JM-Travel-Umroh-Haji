import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 5 * 1024 * 1024; // 5MB

// POST /api/admin/promo/upload  (multipart: file) — flyer promo
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'Flyer harus JPG atau PNG' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran flyer maksimal 5MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'promo');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `flyer_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    return Response.json({ path: `/uploads/promo/${nama}` });
  } catch (error) {
    console.error('Upload flyer promo gagal:', error);
    return Response.json({ error: 'Gagal mengunggah flyer' }, { status: 500 });
  }
}
