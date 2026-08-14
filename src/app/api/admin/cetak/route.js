import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/cetak?jenis=<jenis>&id=<id>
// jenis: perwakilan | jamaah | pks_perwakilan | pks_jamaah
// Semua cetakan ADMIN ONLY.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const jenis = searchParams.get('jenis');
    const id = searchParams.get('id');
    if (!jenis || !id) {
      return Response.json({ error: 'jenis dan id wajib diisi' }, { status: 400 });
    }

    switch (jenis) {
      case 'perwakilan':
      case 'pks_perwakilan': {
        const [rows] = await pool.query(
          `SELECT pp.*, u.name AS user_nama, u.email AS user_email, u.foto_path, u.kode_unik
           FROM perwakilan_pendaftaran pp
           LEFT JOIN users u ON u.id = pp.user_id
           WHERE pp.id = ?`, [id]
        );
        if (rows.length === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
        return Response.json({ jenis, data: rows[0] });
      }

      case 'jamaah':
      case 'pks_jamaah': {
        const [rows] = await pool.query(
          `SELECT b.*, u.name AS pemesan_nama, u.email AS pemesan_email, u.wa AS pemesan_wa
           FROM bookings b LEFT JOIN users u ON u.id = b.user_id
           WHERE b.id = ?`, [id]
        );
        if (rows.length === 0) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
        const b = rows[0];
        if (typeof b.jamaah_data === 'string') {
          try { b.jamaah_data = JSON.parse(b.jamaah_data); } catch { b.jamaah_data = []; }
        }
        return Response.json({ jenis, data: b });
      }

      default:
        return Response.json({ error: 'Jenis dokumen tidak dikenal' }, { status: 400 });
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
