import { writeFile, mkdir, readdir, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

const execFileAsync = promisify(execFile);

// PDF, bukan lagi upload gambar per-slide satu-satu (dikonfirmasi user
// 2026-09-29 — presentasi biasanya banyak slide, export manual jadi gambar
// tiap slide ngerepotin). Batas dinaikkan jauh dari 8MB/slide yang lama
// (itu batas PER GAMBAR, ini batas PDF UTUH isi puluhan slide).
const MAKS_PDF = 100 * 1024 * 1024; // 100MB
const RESOLUSI_DPI = 150; // cukup tajam buat dibaca di layar, gak bikin file per-slide raksasa

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

// POST /api/admin/sahabat/materi  (multipart: judul, deskripsi?, urutan?, file — 1 PDF utuh)
// PDF dirasterisasi di server jadi 1 gambar PNG per halaman (poppler-utils
// `pdftoppm`, lihat Dockerfile) — viewer & mekanisme watermark yang SUDAH
// ADA (MateriSahabatViewer, per-gambar) TIDAK berubah sama sekali, cuma
// sumber gambarnya sekarang dari konversi PDF, bukan upload manual per-slide.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  let materiId = null;
  try {
    const formData = await request.formData();
    const judul = String(formData.get('judul') || '').trim();
    const deskripsi = formData.get('deskripsi') ? String(formData.get('deskripsi')).trim() : null;
    const urutan = Number(formData.get('urutan') || 0);
    const file = formData.get('file');

    if (!judul) return Response.json({ error: 'Judul wajib diisi' }, { status: 400 });
    if (!file || typeof file === 'string') return Response.json({ error: 'File PDF materi wajib diunggah' }, { status: 400 });
    if (file.type !== 'application/pdf') return Response.json({ error: 'File harus berformat PDF' }, { status: 400 });
    if (file.size > MAKS_PDF) return Response.json({ error: `Ukuran file maksimal ${MAKS_PDF / (1024 * 1024)}MB` }, { status: 400 });

    if (!existsSync(DIR)) await mkdir(DIR, { recursive: true });

    const [ins] = await pool.query(
      'INSERT INTO materi_sahabat (judul, deskripsi, urutan, diupload_oleh) VALUES (?, ?, ?, ?)',
      [judul, deskripsi, urutan, auth.user.id]
    );
    materiId = ins.insertId;

    const tmpPdfPath = path.join(DIR, `_tmp_${materiId}_${Date.now()}.pdf`);
    await writeFile(tmpPdfPath, Buffer.from(await file.arrayBuffer()));
    const outPrefix = path.join(DIR, `_tmp_${materiId}_page`);
    try {
      await execFileAsync('pdftoppm', ['-png', '-r', String(RESOLUSI_DPI), tmpPdfPath, outPrefix]);
    } catch (err) {
      console.error('pdftoppm gagal mengonversi PDF materi:', err);
      await unlink(tmpPdfPath).catch(() => {});
      await pool.query('DELETE FROM materi_sahabat WHERE id = ?', [materiId]);
      return Response.json({ error: 'Gagal memproses PDF — pastikan file tidak rusak atau terkunci password.' }, { status: 400 });
    }
    await unlink(tmpPdfPath).catch(() => {});

    // pdftoppm keluarin "<prefix>-<nomor halaman>.png" TANPA zero-padding
    // konsisten di semua versi poppler — jangan urut lexical (nomor 10 bisa
    // nyelip sebelum 2), parse angkanya & urut numerik.
    const prefixName = path.basename(outPrefix);
    const semuaFile = await readdir(DIR);
    const halaman = semuaFile
      .map(f => {
        const m = f.match(new RegExp(`^${prefixName}-(\\d+)\\.png$`));
        return m ? { file: f, nomor: Number(m[1]) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.nomor - b.nomor);

    if (halaman.length === 0) {
      await pool.query('DELETE FROM materi_sahabat WHERE id = ?', [materiId]);
      return Response.json({ error: 'PDF tidak menghasilkan halaman apa pun.' }, { status: 400 });
    }

    let i = 0;
    for (const h of halaman) {
      const namaBaru = `materi_${materiId}_${i}_${Date.now()}.png`;
      await rename(path.join(DIR, h.file), path.join(DIR, namaBaru));
      await pool.query(
        'INSERT INTO materi_sahabat_slide (materi_id, file_path, urutan) VALUES (?, ?, ?)',
        [materiId, namaBaru, i]
      );
      i++;
    }

    return Response.json({ message: `Materi berhasil diunggah! (${halaman.length} slide)`, id: materiId }, { status: 201 });
  } catch (error) {
    console.error(error);
    if (materiId) await pool.query('DELETE FROM materi_sahabat WHERE id = ?', [materiId]).catch(() => {});
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
