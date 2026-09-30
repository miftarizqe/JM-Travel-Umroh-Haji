import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 5 * 1024 * 1024; // 5MB
const JENIS_OK = ['paspor', 'kk', 'ktp', 'vaksin', 'foto'];

// POST /api/upload-dokumen-jamaah  (multipart: file, jenis)
// Dokumen pendukung jamaah (scan paspor/KK/KTP/vaksin/pas foto) — OPSIONAL,
// diisi pas form-jamaah. Stateless: cuma simpan file & balikin path, gak
// nulis ke DB langsung (beda dari /api/upload-ktp) krn jamaah_data itu 1
// array berisi banyak orang per booking, path-nya digabung ke object jamaah
// yang bersangkutan di state form dulu, baru ikut ke-submit bareng field lain.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const jenis = formData.get('jenis');

    if (!JENIS_OK.includes(jenis)) {
      return Response.json({ error: 'Jenis dokumen tidak dikenal' }, { status: 400 });
    }
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 5MB' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'private-uploads', 'dokumen-jamaah');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `${jenis}_${auth.user.id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    return Response.json({ message: 'Dokumen berhasil diunggah!', path: `/api/dokumen/dokumen-jamaah/${nama}` });
  } catch (error) {
    console.error('Upload dokumen jamaah gagal:', error);
    return Response.json({ error: 'Gagal mengunggah dokumen' }, { status: 500 });
  }
}

// Nama file hasil POST di atas: <jenis>_<user_id>_<timestamp>.<ext>. Dipakai
// DELETE buat nolak path lain (path traversal / file di luar folder ini).
const NAMA_VALID = /^(paspor|kk|ktp|vaksin|foto)_([0-9a-f-]{36})_\d+\.(jpg|jpeg|png|pdf)$/i;

// DELETE /api/upload-dokumen-jamaah  body: { path }
// Hapus file fisik dokumen pendukung yang sudah dilepas/diganti di form-jamaah
// (dikonfirmasi user 2026-10-01). Dipanggil FE SETELAH formulir berhasil
// disimpan, jadi booking ini sudah gak nyimpen tautannya lagi. Aturan:
//  - cuma pengunggahnya sendiri (user_id di nama file) atau admin/super_admin;
//  - file yang MASIH dipakai booking mana pun (mis. hasil "pakai data
//    sebelumnya" yang nyalin tautan dari booking lama) TIDAK dihapus.
export async function DELETE(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    let p;
    try { ({ path: p } = await request.json()); } catch { p = null; }
    const nama = String(p || '').replace(/^\/api\/dokumen\/dokumen-jamaah\//, '');
    const cocok = nama.match(NAMA_VALID);
    if (!cocok) return Response.json({ error: 'Path dokumen tidak valid' }, { status: 400 });

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin && cocok[2] !== String(auth.user.id)) {
      return Response.json({ error: 'Anda tidak berhak menghapus dokumen ini' }, { status: 403 });
    }

    // `_` di nama file = wildcard LIKE — di-escape biar cocoknya persis.
    const namaLike = nama.replace(/[\\%_]/g, '\\$&');
    const [[dipakai]] = await pool.query(
      'SELECT COUNT(*) AS n FROM bookings WHERE jamaah_data LIKE ?', [`%${namaLike}%`]
    );
    if (dipakai.n > 0) {
      return Response.json({ message: 'Dokumen masih dipakai formulir lain, file tidak dihapus.', dihapus: false });
    }

    const file = path.join(process.cwd(), 'private-uploads', 'dokumen-jamaah', nama);
    try {
      await unlink(file);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e; // sudah gak ada = anggap beres
    }
    return Response.json({ message: 'Dokumen dihapus.', dihapus: true });
  } catch (error) {
    console.error('Hapus dokumen jamaah gagal:', error);
    return Response.json({ error: 'Gagal menghapus dokumen' }, { status: 500 });
  }
}
