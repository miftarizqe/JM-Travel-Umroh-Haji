import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB — bisa scan multi-halaman

// POST /api/admin/invoice-kwitansi/[id]/scan-fisik  (multipart: file, user_id)
// Unggah scan/foto Invoice/Kwitansi/Tanda Terima Uang yang sudah dicetak +
// dimaterai asli + ditandatangani fisik di kantor — dokumen langsung ditandai
// "terkirim" (dipakai reminder cluster "TTU Belum Dikirim") begitu scan
// tersimpan, biar hasilnya juga bisa dibagikan ulang lewat WA kapan saja.
// `user_id` di form field ikut konvensi UploadScanDokumen (komponen dipakai
// generik lintas jenis dokumen) — di sini nilainya invoice_kwitansi.id.
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

    const [rows] = await pool.query('SELECT id FROM invoice_kwitansi WHERE id = ?', [id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'invoice-kwitansi-scan');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `dok_${id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/invoice-kwitansi-scan/${nama}`;
    await pool.query(
      `UPDATE invoice_kwitansi
       SET scan_fisik_path = ?, scan_fisik_uploaded_at = NOW(),
           terkirim = 1, terkirim_metode = 'fisik', terkirim_at = NOW()
       WHERE id = ?`,
      [publicPath, id]
    );

    return Response.json({ message: 'Scan berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload scan invoice/kwitansi fisik gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
