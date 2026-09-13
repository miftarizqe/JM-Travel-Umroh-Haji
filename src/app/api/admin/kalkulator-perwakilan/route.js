import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kirimNotifikasi } from '@/lib/notifikasi';

// GET /api/admin/kalkulator-perwakilan             -> semua ajuan (semua status)
// GET /api/admin/kalkulator-perwakilan?status=diajukan -> filter status
// GET /api/admin/kalkulator-perwakilan?id=123      -> 1 quote (halaman detail)
// Admin biasa boleh proses ini (bukan super_admin only) — approve/reject
// ajuan itu kerja operasional, publish program resmi tetap manual & terkunci
// di /admin/programs (super_admin only, lihat migration keamanan sebelumnya).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');

    let query = `
      SELECT l.*, u.name AS perwakilan_nama, u.email AS perwakilan_email, u.wa AS perwakilan_wa,
        t.nama AS template_nama
      FROM kalkulator_perwakilan_lead l
      JOIN users u ON u.id = l.perwakilan_id
      JOIN kalkulator_template_publik t ON t.id = l.template_id
      WHERE 1=1`;
    const params = [];
    if (id) { query += ' AND l.id = ?'; params.push(id); }
    if (status) { query += ' AND l.status = ?'; params.push(status); }
    query += ' ORDER BY l.created_at DESC';

    const [rows] = await pool.query(query, params);
    if (id) {
      if (rows.length === 0) return Response.json({ error: 'Quote tidak ditemukan' }, { status: 404 });
      return Response.json({ lead: rows[0] });
    }
    return Response.json({ leads: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/kalkulator-perwakilan  body: { id, status: 'disetujui'|'ditolak', catatan_admin? }
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, status, catatan_admin } = await request.json();
    if (!id || !['disetujui', 'ditolak'].includes(status)) {
      return Response.json({ error: 'id dan status (disetujui/ditolak) wajib diisi' }, { status: 400 });
    }

    const [[lead]] = await pool.query(
      `SELECT l.*, t.nama AS template_nama FROM kalkulator_perwakilan_lead l
       JOIN kalkulator_template_publik t ON t.id = l.template_id WHERE l.id = ?`,
      [id]
    );
    if (!lead) return Response.json({ error: 'Quote tidak ditemukan' }, { status: 404 });
    if (lead.status !== 'diajukan') {
      return Response.json({ error: 'Quote ini belum diajukan atau sudah diproses.' }, { status: 400 });
    }

    await pool.query(
      `UPDATE kalkulator_perwakilan_lead SET status=?, catatan_admin=?, diproses_oleh=?, diproses_at=NOW() WHERE id=?`,
      [status, catatan_admin || null, auth.user.id, id]
    );

    await kirimNotifikasi(pool, {
      user_id: lead.perwakilan_id,
      tipe: status === 'disetujui' ? 'kalkulator_perwakilan_disetujui' : 'kalkulator_perwakilan_ditolak',
      judul: status === 'disetujui' ? 'Ajuan Kalkulator Disetujui' : 'Ajuan Kalkulator Ditolak',
      pesan: status === 'disetujui'
        ? `Ajuan quote ${lead.template_nama} (${lead.paket} ${lead.kamar}) disetujui admin — akan ditindaklanjuti jadi program resmi.`
        : `Ajuan quote ${lead.template_nama} (${lead.paket} ${lead.kamar}) belum bisa dilanjutkan.${catatan_admin ? ' Catatan: ' + catatan_admin : ''}`,
      link: '/perwakilan/kalkulator',
    });

    return Response.json({ message: status === 'disetujui' ? 'Quote disetujui.' : 'Quote ditolak.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
