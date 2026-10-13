import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024; // 10MB — bisa scan multi-halaman

// POST /api/admin/bookings/[id]/scan-perjanjian  (multipart: file, user_id,
// jamaah_idx opsional)
// Unggah scan/foto Perjanjian Jamaah yang sudah dicetak + dimaterai asli +
// ditandatangani fisik di kantor/manasik. Ini BUKAN gerbang pelunasan lagi
// (dikonfirmasi user 2026-10-13, setuju_pks online sudah cukup) — murni
// arsip administratif per jamaah. Lembar perjanjian sekarang 1-per-jamaah
// (dikonfirmasi user 2026-10-13, mirip Formulir Jamaah), jadi scan-nya juga
// disimpan PER JAMAAH di jamaah_data[idx], bukan 1 kolom booking lagi —
// jamaah_idx WAJIB dikirim dari halaman cetak yang baru. Booking LAMA yang
// masih punya bookings.perjanjian_scan_path (sebelum perubahan ini) TETAP
// dibiarkan di kolom lama itu sebagai warisan, gak di-backfill ke jamaah_data.
export async function POST(request, { params }) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file');
    const jamaahIdxRaw = formData.get('jamaah_idx');
    const jamaahIdx = jamaahIdxRaw !== null && jamaahIdxRaw !== '' ? Number(jamaahIdxRaw) : null;

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT id, jamaah_data FROM bookings WHERE id = ?', [id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'perjanjian-jamaah-scan');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `perjanjian_${id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/perjanjian-jamaah-scan/${nama}`;

    if (jamaahIdx !== null) {
      let jd = rows[0].jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      const entries = Array.isArray(jd) ? jd : [];
      if (!entries[jamaahIdx]) {
        return Response.json({ error: 'Jamaah tidak ditemukan' }, { status: 404 });
      }
      entries[jamaahIdx] = { ...entries[jamaahIdx], perjanjian_scan_path: publicPath, perjanjian_scan_uploaded_at: new Date().toISOString() };
      await pool.query('UPDATE bookings SET jamaah_data = ? WHERE id = ?', [JSON.stringify(entries), id]);
    } else {
      await pool.query(
        'UPDATE bookings SET perjanjian_scan_path = ?, perjanjian_scan_uploaded_at = NOW() WHERE id = ?',
        [publicPath, id]
      );
    }

    return Response.json({ message: 'Scan berhasil diunggah!', path: publicPath });
  } catch (error) {
    console.error('Upload scan perjanjian jamaah gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}
