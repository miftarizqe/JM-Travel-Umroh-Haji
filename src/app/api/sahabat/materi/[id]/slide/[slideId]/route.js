import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const DIR = path.join(process.cwd(), 'private-uploads', 'materi-koperasi');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// GET /api/sahabat/materi/[id]/slide/[slideId] — satu-satunya jalan buat
// ambil BYTE gambar slide. Anggota sahabat biasa cuma boleh lihat slide
// dari materi yang `aktif=1` (admin/super_admin boleh preview materi
// nonaktif juga, buat cek sebelum dipublish). Header sengaja `inline`
// (bukan `attachment`) supaya langsung dirender browser, dan endpoint ini
// TIDAK PERNAH dipanggil langsung sebagai <a href> biasa di UI — selalu
// lewat fetch()+blob URL (lihat halaman viewer), jadi gak ada link mentah
// yang gampang di-copy/paste buat dibagikan ke luar.
export async function GET(request, { params }) {
  const auth = wajibRole(request, ['sahabat_baitullah', 'admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, slideId } = await params;

    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    // Sama kayak /api/sahabat/materi — status di JWT bisa basi, cek ulang
    // ke DB (dikonfirmasi user 2026-09-19).
    if (!isAdmin) {
      const [[me]] = await pool.query('SELECT status FROM users WHERE id = ?', [auth.user.id]);
      if (me?.status !== 'active') return Response.json({ error: 'Akun belum aktif' }, { status: 403 });
    }
    const [[materi]] = await pool.query('SELECT id, aktif FROM materi_sahabat WHERE id = ?', [id]);
    if (!materi) return Response.json({ error: 'Materi tidak ditemukan' }, { status: 404 });
    if (!isAdmin && !materi.aktif) return Response.json({ error: 'Materi ini belum dipublish' }, { status: 403 });

    const [[slide]] = await pool.query('SELECT file_path FROM materi_sahabat_slide WHERE id = ? AND materi_id = ?', [slideId, id]);
    if (!slide) return Response.json({ error: 'Slide tidak ditemukan' }, { status: 404 });

    const filePath = path.join(DIR, slide.file_path);
    if (!existsSync(filePath)) return Response.json({ error: 'File slide tidak ditemukan di server' }, { status: 404 });

    const ext = path.extname(slide.file_path).toLowerCase();
    const buf = await readFile(filePath);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
