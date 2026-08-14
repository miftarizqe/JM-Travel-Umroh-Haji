import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 5 * 1024 * 1024; // 5MB

// GET /api/admin/berita — semua post + foto masing-masing, terbaru dulu
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [posts] = await pool.query('SELECT * FROM berita_kegiatan ORDER BY tanggal DESC, created_at DESC');
    const [fotoRows] = await pool.query("SELECT * FROM galeri_foto WHERE tipe = 'kegiatan' AND berita_id IS NOT NULL ORDER BY urutan, id");
    const fotoByBerita = new Map();
    fotoRows.forEach(f => {
      if (!fotoByBerita.has(f.berita_id)) fotoByBerita.set(f.berita_id, []);
      fotoByBerita.get(f.berita_id).push(f);
    });
    const rows = posts.map(p => ({ ...p, foto: fotoByBerita.get(p.id) || [] }));
    return Response.json({ rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/berita (multipart: judul, deskripsi, tanggal, files[])
// Bikin 1 post berita/kegiatan sekaligus foto-fotonya (opsional, boleh 0).
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const judul = String(formData.get('judul') || '').trim();
    const deskripsi = String(formData.get('deskripsi') || '').trim();
    const tanggal = formData.get('tanggal') || null;
    const files = formData.getAll('files');

    if (!judul) return Response.json({ error: 'Judul wajib diisi' }, { status: 400 });

    const [result] = await pool.query(
      'INSERT INTO berita_kegiatan (judul, deskripsi, tanggal) VALUES (?, ?, ?)',
      [judul, deskripsi || null, tanggal || null]
    );
    const beritaId = result.insertId;

    const validFiles = files.filter(f => typeof f !== 'string');
    if (validFiles.length > 0) {
      const dir = path.join(process.cwd(), 'public', 'uploads', 'galeri');
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });

      let urutan = 0;
      for (const file of validFiles) {
        if (!TIPE_OK.includes(file.type)) {
          return Response.json({ error: `${file.name}: harus JPG atau PNG` }, { status: 400 });
        }
        if (file.size > MAKS) {
          return Response.json({ error: `${file.name}: ukuran maksimal 5MB` }, { status: 400 });
        }
        const ext = path.extname(file.name || '') || '.jpg';
        const nama = `berita_${beritaId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));
        const fotoPath = `/uploads/galeri/${nama}`;

        await pool.query(
          'INSERT INTO galeri_foto (batch_judul, foto_path, tipe, berita_id, urutan) VALUES (?, ?, ?, ?, ?)',
          [judul, fotoPath, 'kegiatan', beritaId, urutan]
        );
        urutan++;
      }
    }

    return Response.json({ message: 'Berita/kegiatan berhasil dipasang!', id: beritaId }, { status: 201 });
  } catch (error) {
    console.error('Buat berita gagal:', error);
    return Response.json({ error: 'Gagal membuat berita' }, { status: 500 });
  }
}

// DELETE /api/admin/berita?id=xxx — hapus post + foto-fotonya
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    await pool.query('DELETE FROM galeri_foto WHERE berita_id = ?', [id]);
    await pool.query('DELETE FROM berita_kegiatan WHERE id = ?', [id]);
    return Response.json({ message: 'Berita dihapus' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
