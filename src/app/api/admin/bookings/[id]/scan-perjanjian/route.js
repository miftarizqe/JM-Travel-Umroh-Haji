import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB — bisa scan multi-halaman

// POST /api/admin/bookings/[id]/scan-perjanjian  (multipart: file, user_id)
// Unggah scan/foto Perjanjian Keberangkatan Jamaah yang sudah dicetak +
// dimaterai asli + ditandatangani fisik di kantor — jalur ini melengkapi
// syarat "perjanjian selesai" (lihat getStage di dashboard/jamaah/page.jsx)
// buat jamaah yang pilih fisik alih-alih TTD digital. Pola sama persis
// src/app/api/admin/invoice-kwitansi/[id]/scan-fisik/route.js.
export async function POST(request, { params }) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT id FROM bookings WHERE id = ?', [id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'perjanjian-jamaah-scan');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `perjanjian_${id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/perjanjian-jamaah-scan/${nama}`;
    await pool.query(
      'UPDATE bookings SET perjanjian_scan_path = ?, perjanjian_scan_uploaded_at = NOW() WHERE id = ?',
      [publicPath, id]
    );

    return Response.json({ message: 'Scan berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload scan perjanjian jamaah gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
