import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { wajibLogin } from '@/lib/auth';

const TIPE_DIIZINKAN = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS_UKURAN = 5 * 1024 * 1024; // 5MB

// POST /api/upload-bukti  (multipart/form-data: file)
// Menyimpan file ke private-uploads/bukti dan mengembalikan path-nya (dilindungi login, lihat /api/dokumen/[...slug]).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }

    // Validasi tipe
    if (!TIPE_DIIZINKAN.includes(file.type)) {
      return Response.json(
        { error: 'Tipe file tidak didukung. Gunakan JPG, PNG, atau PDF.' },
        { status: 400 }
      );
    }

    // Validasi ukuran
    if (file.size > MAKS_UKURAN) {
      return Response.json(
        { error: 'Ukuran file maksimal 5MB.' },
        { status: 400 }
      );
    }

    // Siapkan folder tujuan
    const dir = path.join(process.cwd(), 'private-uploads', 'bukti');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Nama file unik: timestamp + acak + ekstensi asli
    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const namaUnik = `bukti_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const tujuan = path.join(dir, namaUnik);

    const bytes = await file.arrayBuffer();
    await writeFile(tujuan, Buffer.from(bytes));

    // Path yang bisa diakses browser
    const publicPath = `/api/dokumen/bukti/${namaUnik}`;

    return Response.json({
      message: 'Bukti transfer berhasil diunggah!',
      path: publicPath,
      nama_asli: file.name || namaUnik,
    });
  } catch (error) {
    console.error('Upload gagal:', error);
    return Response.json({ error: 'Gagal mengunggah file' }, { status: 500 });
  }
}
