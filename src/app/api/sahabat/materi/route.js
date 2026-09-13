import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/sahabat/materi — daftar materi presentasi yang aktif, buat
// anggota sahabat. SENGAJA cuma balikin id slide + urutan (bukan
// file_path) — path fisik file cuma pernah kebuka lewat endpoint streaming
// /api/sahabat/materi/[id]/slide/[slideId] yang ngecek role di server tiap
// request, biar gak ada satupun URL statis yang bisa diakses tanpa login.
export async function GET(request) {
  const auth = wajibRole(request, ['sahabat_baitullah', 'admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const [materi] = await pool.query(
      `SELECT id, judul, deskripsi, urutan FROM materi_sahabat WHERE aktif = 1 ORDER BY urutan ASC, created_at DESC`
    );
    if (materi.length === 0) return Response.json({ materi: [] });

    const ids = materi.map(m => m.id);
    const [slides] = await pool.query(
      `SELECT id, materi_id, urutan FROM materi_sahabat_slide WHERE materi_id IN (?) ORDER BY urutan ASC`,
      [ids]
    );
    const byMateri = new Map();
    for (const s of slides) {
      if (!byMateri.has(s.materi_id)) byMateri.set(s.materi_id, []);
      byMateri.get(s.materi_id).push({ id: s.id, urutan: s.urutan });
    }
    const hasil = materi.map(m => ({ ...m, slides: byMateri.get(m.id) || [] }));
    return Response.json({ materi: hasil });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
