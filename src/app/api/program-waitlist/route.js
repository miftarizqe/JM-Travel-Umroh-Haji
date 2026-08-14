import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// POST /api/program-waitlist — daftar minat "infokan jika ada slot kosong"
// buat Program yang seat-nya lagi 0 (lihat CartPaketKamar.jsx). Dipakai
// SEKALIGUS oleh checkout jamaah, order-jamaah (admin/perwakilan
// pesenin atas nama jamaah), dan dashboard jamaah — makanya wajibLogin
// generik, bukan role tertentu.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { program_id } = await request.json();
    if (!program_id) return Response.json({ error: 'program_id wajib diisi' }, { status: 400 });

    const [progRows] = await pool.query('SELECT id FROM programs WHERE id = ?', [program_id]);
    if (progRows.length === 0) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });

    // INSERT IGNORE — UNIQUE(program_id, user_id) nyegah dobel daftar,
    // klik ulang tombolnya gak error, cuma no-op.
    await pool.query(
      'INSERT IGNORE INTO program_waitlist (program_id, user_id) VALUES (?, ?)',
      [program_id, auth.user.id]
    );
    return Response.json({ message: 'Kamu bakal dikabarin begitu ada slot kosong.' }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// GET /api/program-waitlist?program_id=X — cek udah kedaftar apa belum
// (dipakai UI buat nunjukin "✓ Sudah Terdaftar" gak nyoba POST ulang).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get('program_id');
    if (!programId) return Response.json({ error: 'program_id wajib diisi' }, { status: 400 });
    const [rows] = await pool.query(
      'SELECT id FROM program_waitlist WHERE program_id = ? AND user_id = ?',
      [programId, auth.user.id]
    );
    return Response.json({ terdaftar: rows.length > 0 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
