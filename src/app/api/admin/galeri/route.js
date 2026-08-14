import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png'];
const MAKS = 5 * 1024 * 1024; // 5MB

// GET /api/admin/galeri — semua foto keberangkatan, dikelompokkan per batch
// di sisi client. Foto kegiatan/booth sekarang diurus lewat /admin/berita
// (tipe='kegiatan' + berita_id, bukan lewat sini lagi).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM galeri_foto WHERE tipe = 'keberangkatan' ORDER BY batch_tanggal DESC, batch_judul, urutan, id"
    );
    return Response.json({ rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/galeri (multipart: batch_judul, batch_tanggal, files[])
// Bisa unggah beberapa foto sekaligus ke satu batch keberangkatan.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const batchJudul = String(formData.get('batch_judul') || '').trim();
    const batchTanggal = formData.get('batch_tanggal') || null;
    const files = formData.getAll('files');

    if (!batchJudul) return Response.json({ error: 'Judul wajib diisi' }, { status: 400 });
    if (!files.length || typeof files[0] === 'string') {
      return Response.json({ error: 'Pilih minimal 1 foto' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'public', 'uploads', 'galeri');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    // Urutan lanjut dari yang terakhir di batch ini, biar foto baru nambah
    // di belakang bukan nyelip/nimpa urutan lama.
    const [maxRow] = await pool.query(
      'SELECT COALESCE(MAX(urutan), -1) AS maxUrutan FROM galeri_foto WHERE batch_judul = ?',
      [batchJudul]
    );
    let urutan = maxRow[0].maxUrutan + 1;

    const disimpan = [];
    for (const file of files) {
      if (typeof file === 'string') continue;
      if (!TIPE_OK.includes(file.type)) {
        return Response.json({ error: `${file.name}: harus JPG atau PNG` }, { status: 400 });
      }
      if (file.size > MAKS) {
        return Response.json({ error: `${file.name}: ukuran maksimal 5MB` }, { status: 400 });
      }
      const ext = path.extname(file.name || '') || '.jpg';
      const nama = `galeri_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));
      const fotoPath = `/uploads/galeri/${nama}`;

      const [result] = await pool.query(
        'INSERT INTO galeri_foto (batch_judul, batch_tanggal, foto_path, urutan) VALUES (?, ?, ?, ?)',
        [batchJudul, batchTanggal || null, fotoPath, urutan]
      );
      disimpan.push({ id: result.insertId, foto_path: fotoPath });
      urutan++;
    }

    return Response.json({ message: `${disimpan.length} foto berhasil diunggah`, rows: disimpan });
  } catch (error) {
    console.error('Upload galeri gagal:', error);
    return Response.json({ error: 'Gagal mengunggah foto' }, { status: 500 });
  }
}

// DELETE /api/admin/galeri  body: { id } (hapus 1 foto) ATAU { batch_judul } (hapus semua foto di batch itu)
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { id, batch_judul } = await request.json();
    if (id) {
      await pool.query('DELETE FROM galeri_foto WHERE id = ?', [id]);
      return Response.json({ message: 'Foto dihapus' });
    }
    if (batch_judul) {
      await pool.query('DELETE FROM galeri_foto WHERE batch_judul = ?', [batch_judul]);
      return Response.json({ message: 'Batch dihapus' });
    }
    return Response.json({ error: 'id atau batch_judul wajib diisi' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
