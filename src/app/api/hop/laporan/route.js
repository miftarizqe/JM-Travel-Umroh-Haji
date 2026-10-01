import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat, wajibHopSahabat } from '@/lib/hopAuth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// Tandaan "data bermasalah" dari Head of Program Sahabat (dikonfirmasi user
// 2026-10-01): HoP menandai sahabat + catatan; verifikasi & tindak lanjut
// final oleh admin (/api/admin/sahabat/laporan-data). HoP gak bisa ubah data.

// GET /api/hop/laporan — riwayat tandaan (terbaru dulu). HoP & admin.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.sahabat_id, s.name AS sahabat_nama, s.kode_unik AS sahabat_kode,
              l.catatan, l.status, l.catatan_admin, l.created_at, l.selesai_at,
              p.name AS dilapor_oleh_nama, a.name AS ditangani_oleh_nama
       FROM sahabat_laporan_data l
       LEFT JOIN users s ON s.id = l.sahabat_id
       LEFT JOIN users p ON p.id = l.dilapor_oleh
       LEFT JOIN users a ON a.id = l.ditangani_oleh
       ORDER BY l.status = 'terbuka' DESC, l.created_at DESC
       LIMIT 200`
    );
    return Response.json({ laporan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/hop/laporan  body: { sahabat_id, catatan } — KHUSUS HoP.
export async function POST(request) {
  const auth = await wajibHopSahabat(request);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const sahabatId = String(body.sahabat_id || '');
  const catatan = String(body.catatan || '').trim();
  if (!sahabatId) return Response.json({ error: 'Sahabat wajib dipilih' }, { status: 400 });
  if (catatan.length < 5) return Response.json({ error: 'Catatan minimal 5 karakter — jelaskan data apa yang bermasalah' }, { status: 400 });
  if (catatan.length > 1000) return Response.json({ error: 'Catatan maksimal 1000 karakter' }, { status: 400 });
  try {
    const [[s]] = await pool.query("SELECT id, name FROM users WHERE id = ? AND role = 'sahabat_baitullah'", [sahabatId]);
    if (!s) return Response.json({ error: 'Sahabat tidak ditemukan' }, { status: 404 });
    await pool.query(
      'INSERT INTO sahabat_laporan_data (sahabat_id, dilapor_oleh, catatan) VALUES (?, ?, ?)',
      [sahabatId, auth.user.id, catatan]
    );
    try {
      await kirimNotifikasiAdmin(pool, {
        tipe: 'laporan_data_sahabat',
        judul: 'Laporan Data Sahabat dari Head of Program',
        pesan: `${s.name}: ${catatan.slice(0, 120)}`,
        link: '/admin/sahabat/laporan-data',
      });
    } catch (e) { console.error('Notif admin laporan data gagal:', e); }
    return Response.json({ message: 'Laporan terkirim ke admin.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
