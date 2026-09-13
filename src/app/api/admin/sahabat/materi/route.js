import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAKS = 8 * 1024 * 1024; // 8MB per slide

// Folder SENGAJA di luar public/ — lihat catatan di migration-materi-koperasi.sql.
const DIR = path.join(process.cwd(), 'private-uploads', 'materi-koperasi');

// GET /api/admin/sahabat/materi — semua materi (termasuk nonaktif), buat panel admin
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT m.*, (SELECT COUNT(*) FROM materi_sahabat_slide s WHERE s.materi_id = m.id) AS jumlah_slide
       FROM materi_sahabat m ORDER BY m.urutan ASC, m.created_at DESC`
    );
    if (rows.length === 0) return Response.json({ materi: [] });

    // Ikut sertakan id+urutan tiap slide (bukan file_path) — dipakai tombol
    // "Preview" admin yang reuse MateriSahabatViewer, komponen yang sama
    // persis dipakai anggota sahabat.
    const ids = rows.map(r => r.id);
    const [slides] = await pool.query(
      `SELECT id, materi_id, urutan FROM materi_sahabat_slide WHERE materi_id IN (?) ORDER BY urutan ASC`,
      [ids]
    );
    const byMateri = new Map();
    for (const s of slides) {
      if (!byMateri.has(s.materi_id)) byMateri.set(s.materi_id, []);
      byMateri.get(s.materi_id).push({ id: s.id, urutan: s.urutan });
    }
    const hasil = rows.map(r => ({ ...r, slides: byMateri.get(r.id) || [] }));
    return Response.json({ materi: hasil });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/sahabat/materi  (multipart: judul, deskripsi?, urutan?, slides[] — banyak file gambar)
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const formData = await request.formData();
    const judul = String(formData.get('judul') || '').trim();
    const deskripsi = formData.get('deskripsi') ? String(formData.get('deskripsi')).trim() : null;
    const urutan = Number(formData.get('urutan') || 0);
    const files = formData.getAll('slides');

    if (!judul) return Response.json({ error: 'Judul wajib diisi' }, { status: 400 });
    const validFiles = files.filter(f => f && typeof f !== 'string');
    if (validFiles.length === 0) return Response.json({ error: 'Minimal 1 slide (gambar) wajib diunggah' }, { status: 400 });
    for (const f of validFiles) {
      if (!TIPE_OK.includes(f.type)) return Response.json({ error: `File "${f.name}" harus JPG, PNG, atau WEBP` }, { status: 400 });
      if (f.size > MAKS) return Response.json({ error: `File "${f.name}" maksimal 8MB` }, { status: 400 });
    }

    if (!existsSync(DIR)) await mkdir(DIR, { recursive: true });

    const [ins] = await pool.query(
      'INSERT INTO materi_sahabat (judul, deskripsi, urutan, diupload_oleh) VALUES (?, ?, ?, ?)',
      [judul, deskripsi, urutan, auth.user.id]
    );
    const materiId = ins.insertId;

    let i = 0;
    for (const f of validFiles) {
      const ext = path.extname(f.name || '') || '.jpg';
      const nama = `materi_${materiId}_${i}_${Date.now()}${ext}`;
      await writeFile(path.join(DIR, nama), Buffer.from(await f.arrayBuffer()));
      await pool.query(
        'INSERT INTO materi_sahabat_slide (materi_id, file_path, urutan) VALUES (?, ?, ?)',
        [materiId, nama, i]
      );
      i++;
    }

    return Response.json({ message: 'Materi berhasil diunggah!', id: materiId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
