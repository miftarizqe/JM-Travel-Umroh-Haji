import { readFile, stat } from 'fs/promises';
import path from 'path';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

// GET /uploads/<...path> — fallback penyaji file upload publik (galeri,
// promo, berita, dst) yang ditulis ke public/uploads/ SAAT RUNTIME.
// `next start` cuma ngindeks isi public/ sekali waktu server start, jadi
// file yang diunggah admin setelahnya 404 sampai container di-restart
// (foto Dokumentasi landing page gak ke-load). File yang udah ada waktu
// start tetap disajikan Next.js langsung; yang baru jatuh ke route ini.
export async function GET(request, { params }) {
  const { path: segs } = await params;
  const baseDir = path.resolve(process.cwd(), 'public', 'uploads');
  const filePath = path.resolve(baseDir, ...(segs || []));
  // Cegah path traversal — hasil resolve wajib tetap di dalam public/uploads.
  if (!filePath.startsWith(baseDir + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response('Not found', { status: 404 });
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': String(info.size),
        // Nama file upload selalu unik (timestamp + random), aman di-cache lama.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
