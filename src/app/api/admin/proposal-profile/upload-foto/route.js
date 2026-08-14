import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 8 * 1024 * 1024; // 8MB — halaman penuh hasil export Canva bisa lumayan besar

// slot -> {kolom di proposal_profile, prefix nama file}
const SLOT = {
  perlengkapan_foto: { kolom: 'perlengkapan_foto', prefix: 'perlengkapan' },
  gambar_cover: { kolom: 'gambar_cover', prefix: 'cover' },
  gambar_keutamaan: { kolom: 'gambar_keutamaan', prefix: 'keutamaan' },
  gambar_penutup: { kolom: 'gambar_penutup', prefix: 'penutup' },
};

// POST /api/admin/proposal-profile/upload-foto (multipart: file, slot)
// slot menentukan mau isi field apa — perlengkapan_foto (foto produk kecil,
// masih dirender dalam layout HTML) atau gambar_cover/keutamaan/penutup
// (halaman penuh hasil export Canva apa adanya, gak dibangun ulang di HTML
// karena hasilnya gak akan pernah identik — lihat CetakProposalPage).
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const slotKey = formData.get('slot') || 'perlengkapan_foto';
    const slot = SLOT[slotKey];
    if (!slot) return Response.json({ error: 'Slot tidak dikenal' }, { status: 400 });
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'Gambar harus JPG atau PNG' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran gambar maksimal 8MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'proposal-profile');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `${slot.prefix}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/uploads/proposal-profile/${nama}`;
    await pool.query(`UPDATE proposal_profile SET ${slot.kolom} = ? WHERE id = 1`, [publicPath]);

    return Response.json({ message: 'Gambar berhasil diunggah!', path: publicPath, slot: slotKey });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Gagal mengunggah gambar' }, { status: 500 });
  }
}
