import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const DIR = path.join(process.cwd(), 'private-uploads', 'materi-koperasi');

// PATCH /api/admin/sahabat/materi/[id]  body: { judul?, deskripsi?, urutan?, aktif? }
export async function PATCH(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const [[existing]] = await pool.query('SELECT id FROM materi_sahabat WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Materi tidak ditemukan' }, { status: 404 });

    const fields = [];
    const vals = [];
    if (body.judul !== undefined) { fields.push('judul = ?'); vals.push(String(body.judul).trim()); }
    if (body.deskripsi !== undefined) { fields.push('deskripsi = ?'); vals.push(body.deskripsi ? String(body.deskripsi).trim() : null); }
    if (body.urutan !== undefined) { fields.push('urutan = ?'); vals.push(Number(body.urutan) || 0); }
    if (body.aktif !== undefined) { fields.push('aktif = ?'); vals.push(body.aktif ? 1 : 0); }
    if (fields.length === 0) return Response.json({ error: 'Tidak ada perubahan' }, { status: 400 });

    await pool.query(`UPDATE materi_sahabat SET ${fields.join(', ')} WHERE id = ?`, [...vals, id]);
    return Response.json({ message: 'Materi diperbarui.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/sahabat/materi/[id] — hapus materi + semua slide fisiknya
export async function DELETE(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [slides] = await pool.query('SELECT file_path FROM materi_sahabat_slide WHERE materi_id = ?', [id]);
    await pool.query('DELETE FROM materi_sahabat WHERE id = ?', [id]); // CASCADE hapus baris slide

    for (const s of slides) {
      const p = path.join(DIR, s.file_path);
      if (existsSync(p)) await unlink(p).catch(() => {});
    }

    return Response.json({ message: 'Materi dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
