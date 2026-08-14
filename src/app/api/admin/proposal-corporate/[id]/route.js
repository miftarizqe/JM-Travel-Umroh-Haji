import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/proposal-corporate/[id] — detail + data program yang diinclude,
// buat halaman cetak.
export async function GET(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[proposal]] = await pool.query('SELECT * FROM proposal_corporate WHERE id = ?', [id]);
    if (!proposal) return Response.json({ error: 'Proposal tidak ditemukan' }, { status: 404 });

    // program_ids tersimpan JSON — driver bisa balikin sudah ter-parse atau
    // masih string tergantung versi, normalisasi dulu biar aman dua-duanya.
    let programIds = proposal.program_ids || [];
    if (typeof programIds === 'string') {
      try { programIds = JSON.parse(programIds); } catch { programIds = []; }
    }
    if (!Array.isArray(programIds)) programIds = [];
    let programs = [];
    if (programIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT * FROM programs WHERE id IN (${programIds.map(() => '?').join(',')})`,
        programIds
      );
      // urutan ikut program_ids, bukan urutan hasil query
      programs = programIds.map(pid => rows.find(r => r.id === pid)).filter(Boolean);
    }

    // Company Profile (statis, edit sekali) — digabung di sini biar halaman
    // cetak cukup 1x fetch.
    const [[profile]] = await pool.query('SELECT * FROM proposal_profile WHERE id = 1');

    // Dokumentasi — pakai foto yang dipilih manual di Company Profile kalau
    // ada, kalau kosong fallback ke 6 foto terbaru dari Galeri.
    let dokumentasiIds = profile?.dokumentasi_foto_ids || [];
    if (typeof dokumentasiIds === 'string') {
      try { dokumentasiIds = JSON.parse(dokumentasiIds); } catch { dokumentasiIds = []; }
    }
    if (!Array.isArray(dokumentasiIds)) dokumentasiIds = [];

    let dokumentasi;
    if (dokumentasiIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT id, foto_path FROM galeri_foto WHERE id IN (${dokumentasiIds.map(() => '?').join(',')})`,
        dokumentasiIds
      );
      dokumentasi = dokumentasiIds.map(fid => rows.find(r => r.id === fid)).filter(Boolean);
    } else {
      [dokumentasi] = await pool.query(
        "SELECT id, foto_path FROM galeri_foto WHERE tipe = 'keberangkatan' ORDER BY created_at DESC LIMIT 6"
      );
    }

    return Response.json({ proposal, programs, profile, dokumentasi });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/proposal-corporate/[id]
export async function DELETE(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    await pool.query('DELETE FROM proposal_corporate WHERE id = ?', [id]);
    return Response.json({ message: 'Proposal dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
