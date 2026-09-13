import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { wajibLogin } from '@/lib/auth';
import { resolveOwnerId, KATEGORI_TERPROTEKSI } from '@/lib/dokumenProteksi';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.pdf': 'application/pdf',
};

// GET /api/dokumen/<kategori>/<filename> — satu-satunya jalan baca dokumen
// pribadi/legal (KTP, paspor, bukti transfer, dst) sejak 2026-09-03. File
// fisiknya ada di private-uploads/<kategori>/ (DI LUAR public/), jadi gak
// ada cara buka file ini selain lewat route ini — beda dari sisa upload
// lain di aplikasi (galeri, promo, dst) yang memang sengaja publik dan
// TETAP di public/uploads/ apa adanya.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { slug } = await params;
    if (!Array.isArray(slug) || slug.length !== 2) {
      return Response.json({ error: 'Path dokumen tidak valid' }, { status: 400 });
    }
    const [category, filename] = slug;
    if (!KATEGORI_TERPROTEKSI.has(category)) {
      return Response.json({ error: 'Kategori dokumen tidak dikenal' }, { status: 404 });
    }

    const isStaff = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    if (!isStaff) {
      const urlPath = `/api/dokumen/${category}/${filename}`;
      const ownerId = await resolveOwnerId(category, filename, urlPath);
      if (ownerId === null || (ownerId !== 'admin_only' && String(ownerId) !== String(auth.user.id))) {
        return Response.json({ error: 'Anda tidak berhak mengakses dokumen ini' }, { status: 403 });
      }
      if (ownerId === 'admin_only') {
        return Response.json({ error: 'Anda tidak berhak mengakses dokumen ini' }, { status: 403 });
      }
    }

    const filePath = path.join(process.cwd(), 'private-uploads', category, filename);
    // Cegah path traversal — filename dari URL dinamis Next.js udah didecode,
    // pastikan hasil resolve tetap di dalam folder kategori yang dimaksud.
    const dirResolved = path.resolve(process.cwd(), 'private-uploads', category);
    if (!path.resolve(filePath).startsWith(dirResolved + path.sep)) {
      return Response.json({ error: 'Path tidak valid' }, { status: 400 });
    }
    if (!existsSync(filePath)) {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 404 });
    }

    const ext = path.extname(filename).toLowerCase();
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
