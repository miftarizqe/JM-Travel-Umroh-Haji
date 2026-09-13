import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB

// POST /api/admin/pembatalan/[id]/bukti-refund  (multipart: file, user_id)
// Unggah bukti transfer refund pembatalan yang sudah disetujui — begitu
// tersimpan, refund_status AKHIRNYA bisa jadi 'selesai' (sebelumnya cuma
// pernah ditulis 'diproses', nyangkut selamanya). Dipakai jamaah lewat
// riwayat booking dan admin lewat reminder cluster "Refund Belum
// Ditransfer" (lihat src/lib/perjanjianJamaah.js).
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

    const [rows] = await pool.query("SELECT id, status FROM pembatalan WHERE id = ?", [id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Pengajuan pembatalan tidak ditemukan' }, { status: 404 });
    }
    if (rows[0].status !== 'disetujui') {
      return Response.json({ error: 'Pengajuan ini belum disetujui' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'bukti-refund');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `refund_${id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/bukti-refund/${nama}`;
    await pool.query(
      "UPDATE pembatalan SET bukti_refund_path = ?, bukti_refund_uploaded_at = NOW(), refund_status = 'selesai' WHERE id = ?",
      [publicPath, id]
    );

    return Response.json({ message: 'Bukti refund berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload bukti refund gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
