import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { kirimNotifikasi } from '@/lib/notifikasi';

// Antrean "data bermasalah" yang ditandai Head of Program Sahabat — admin
// memverifikasi, menindaklanjuti (di halaman data sahabat), lalu menandai
// selesai + catatan (dikonfirmasi user 2026-10-01).

// GET /api/admin/sahabat/laporan-data?status=terbuka|selesai|semua
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const status = new URL(request.url).searchParams.get('status') || 'terbuka';
    const where = status === 'semua' ? '' : 'WHERE l.status = ?';
    const [rows] = await pool.query(
      `SELECT l.id, l.sahabat_id, s.name AS sahabat_nama, s.kode_unik AS sahabat_kode, s.wa AS sahabat_wa,
              l.catatan, l.status, l.catatan_admin, l.created_at, l.selesai_at,
              p.name AS dilapor_oleh_nama, a.name AS ditangani_oleh_nama
       FROM sahabat_laporan_data l
       LEFT JOIN users s ON s.id = l.sahabat_id
       LEFT JOIN users p ON p.id = l.dilapor_oleh
       LEFT JOIN users a ON a.id = l.ditangani_oleh
       ${where}
       ORDER BY l.created_at DESC
       LIMIT 300`,
      status === 'semua' ? [] : [status === 'selesai' ? 'selesai' : 'terbuka']
    );
    return Response.json({ laporan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/sahabat/laporan-data  body: { id, catatan_admin } — tandai selesai.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const id = Number(body.id);
  const catatanAdmin = String(body.catatan_admin || '').trim();
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'ID laporan tidak valid' }, { status: 400 });
  if (!catatanAdmin) return Response.json({ error: 'Catatan tindak lanjut wajib diisi' }, { status: 400 });
  try {
    const [[l]] = await pool.query(
      `SELECT l.id, l.status, l.dilapor_oleh, s.name AS sahabat_nama
       FROM sahabat_laporan_data l LEFT JOIN users s ON s.id = l.sahabat_id WHERE l.id = ?`, [id]
    );
    if (!l) return Response.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });
    if (l.status === 'selesai') return Response.json({ error: 'Laporan ini sudah ditandai selesai' }, { status: 400 });
    await pool.query(
      "UPDATE sahabat_laporan_data SET status = 'selesai', catatan_admin = ?, ditangani_oleh = ?, selesai_at = NOW() WHERE id = ? AND status = 'terbuka'",
      [catatanAdmin, auth.user.id, id]
    );
    await catatAudit(pool, {
      actor: auth.user, aksi: 'selesaikan_laporan_data_sahabat', target_type: 'sahabat_laporan_data',
      target_id: String(id), keterangan: `${l.sahabat_nama || '-'}: ${catatanAdmin}`,
    });
    try {
      await kirimNotifikasi(pool, {
        user_id: l.dilapor_oleh, tipe: 'laporan_data_selesai',
        judul: 'Laporan Data Sahabat Sudah Ditindaklanjuti',
        pesan: `${l.sahabat_nama || 'Sahabat'}: ${catatanAdmin.slice(0, 120)}`,
        link: '/dashboard/sahabat/hop',
      });
    } catch (e) { console.error('Notif HoP laporan selesai gagal:', e); }
    return Response.json({ message: 'Laporan ditandai selesai.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
