import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 5 * 1024 * 1024; // 5MB

function parseLegal(v) {
  if (!v) return [];
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return Array.isArray(v) ? v : [];
}

// POST (multipart: file, label) — nambah 1 dokumen legal (scan SK Haji, SK
// PPIU, sertifikat, NIB, dst) ke daftar yang otomatis ikut ke semua
// Proposal Corporate. Nambah ke array, bukan replace.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const label = formData.get('label');
    if (!label?.trim()) return Response.json({ error: 'Label wajib diisi' }, { status: 400 });
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 5MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'proposal-profile');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || '.jpg';
    const nama = `legal_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));
    const publicPath = `/uploads/proposal-profile/${nama}`;

    const [[row]] = await pool.query('SELECT legal_dokumen FROM proposal_profile WHERE id = 1');
    const daftar = parseLegal(row?.legal_dokumen);
    daftar.push({ label: label.trim(), path: publicPath, tipe: file.type });
    await pool.query('UPDATE proposal_profile SET legal_dokumen = ? WHERE id = 1', [JSON.stringify(daftar)]);

    return Response.json({ message: 'Dokumen legal ditambahkan!', legal_dokumen: daftar });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}

// DELETE ?index=N — hapus 1 dokumen legal dari daftar berdasarkan posisinya.
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const index = Number(searchParams.get('index'));
    const [[row]] = await pool.query('SELECT legal_dokumen FROM proposal_profile WHERE id = 1');
    const daftar = parseLegal(row?.legal_dokumen);
    if (Number.isNaN(index) || index < 0 || index >= daftar.length) {
      return Response.json({ error: 'Index tidak valid' }, { status: 400 });
    }
    daftar.splice(index, 1);
    await pool.query('UPDATE proposal_profile SET legal_dokumen = ? WHERE id = 1', [JSON.stringify(daftar)]);
    return Response.json({ message: 'Dokumen dihapus.', legal_dokumen: daftar });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
