import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// Follow-up lead cuma butuh nama/kontak/harga jual final (BUKAN config_json/
// HPP/margin) — level akses sama kayak Custom Harga (admin biasa, bukan
// super_admin-only kayak kurasi template).

// GET /api/admin/kalkulator-leads                          -> semua lead
// GET /api/admin/kalkulator-leads?status=diajukan           -> filter status
// GET /api/admin/kalkulator-leads?status_tindak_lanjut=baru -> filter follow-up
// GET /api/admin/kalkulator-leads?id=123                    -> 1 lead (halaman detail)
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const statusTindakLanjut = searchParams.get('status_tindak_lanjut');

    // LEFT JOIN template — lead tipe='custom' (ajukan sendiri, gak pilih
    // template) punya template_id NULL, JOIN biasa bakal nge-exclude baris
    // itu dari hasil sama sekali.
    // Kolom eksplisit (BUKAN l.*) — rincian_snapshot (HPP/margin/komisi)
    // sengaja DIKECUALIKAN dari endpoint level-admin ini, cuma kebuka lewat
    // /api/admin/kalkulator-leads/[id]/rincian yang super_admin-only (lihat
    // komentar file itu, dikonfirmasi user 2026-08-18).
    let query = `
      SELECT l.id, l.user_id, l.template_id, l.tipe, l.paket, l.kamar, l.tanggal_berangkat,
        l.addon_config, l.catatan_custom, l.jumlah_pax, l.harga_jual, l.status, l.status_tindak_lanjut,
        l.diajukan_at, l.catatan_admin, l.created_at,
        u.name AS user_nama, u.email AS user_email, u.wa AS user_wa, t.nama AS template_nama
      FROM kalkulator_lead l
      JOIN users u ON u.id = l.user_id
      LEFT JOIN kalkulator_template_publik t ON t.id = l.template_id
      WHERE 1=1`;
    const params = [];
    if (id) { query += ' AND l.id = ?'; params.push(id); }
    if (status) { query += ' AND l.status = ?'; params.push(status); }
    if (statusTindakLanjut) { query += ' AND l.status_tindak_lanjut = ?'; params.push(statusTindakLanjut); }
    query += ' ORDER BY l.created_at DESC';

    const [rows] = await pool.query(query, params);
    if (id) {
      if (rows.length === 0) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
      return Response.json({ lead: rows[0] });
    }
    return Response.json({ leads: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/kalkulator-leads  body: { id, status_tindak_lanjut?, catatan_admin? }
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, status_tindak_lanjut, catatan_admin } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    if (status_tindak_lanjut && !['baru', 'dihubungi', 'selesai'].includes(status_tindak_lanjut)) {
      return Response.json({ error: 'status_tindak_lanjut tidak valid' }, { status: 400 });
    }

    const set = [];
    const params = [];
    if (status_tindak_lanjut) { set.push('status_tindak_lanjut = ?'); params.push(status_tindak_lanjut); }
    if (catatan_admin !== undefined) { set.push('catatan_admin = ?'); params.push(catatan_admin?.trim() || null); }
    if (set.length === 0) return Response.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

    params.push(id);
    const [result] = await pool.query(`UPDATE kalkulator_lead SET ${set.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Lead diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
