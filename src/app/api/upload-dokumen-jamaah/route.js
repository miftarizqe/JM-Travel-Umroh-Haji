import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { wajibLogin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 5 * 1024 * 1024; // 5MB
const JENIS_OK = ['paspor', 'kk', 'ktp', 'vaksin', 'foto'];

// POST /api/upload-dokumen-jamaah  (multipart: file, jenis)
// Dokumen pendukung jamaah (scan paspor/KK/KTP/vaksin/pas foto) — OPSIONAL,
// diisi pas form-jamaah. Stateless: cuma simpan file & balikin path, gak
// nulis ke DB langsung (beda dari /api/upload-ktp) krn jamaah_data itu 1
// array berisi banyak orang per booking, path-nya digabung ke object jamaah
// yang bersangkutan di state form dulu, baru ikut ke-submit bareng field lain.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const jenis = formData.get('jenis');

    if (!JENIS_OK.includes(jenis)) {
      return Response.json({ error: 'Jenis dokumen tidak dikenal' }, { status: 400 });
    }
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 5MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'dokumen-jamaah');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `${jenis}_${auth.user.id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    return Response.json({ message: 'Dokumen berhasil diunggah!', path: `/api/dokumen/dokumen-jamaah/${nama}` });
  } catch (error) {
    console.error('Upload dokumen jamaah gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
