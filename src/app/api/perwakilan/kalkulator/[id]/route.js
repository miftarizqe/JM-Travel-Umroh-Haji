import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// PATCH /api/perwakilan/kalkulator/[id]  body: { action: 'ajukan' }
// Perwakilan mengajukan quote draft ke admin buat dipertimbangkan jadi
// program resmi — TIDAK auto-publish, admin yang review & (kalau setuju)
// bikin programnya manual di /admin/programs. Pola sama persis
// src/app/api/kalkulator-publik/ajukan/route.js.
export async function PATCH(request, { params }) {
  const auth = wajibRole(request, ['perwakilan']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { action } = await request.json();
    if (action !== 'ajukan') {
      return Response.json({ error: 'action tidak dikenal' }, { status: 400 });
    }

    const [[lead]] = await pool.query(
      `SELECT l.*, u.name AS perwakilan_nama, t.nama AS template_nama
       FROM kalkulator_perwakilan_lead l
       JOIN users u ON u.id = l.perwakilan_id
       JOIN kalkulator_template_publik t ON t.id = l.template_id
       WHERE l.id = ?`,
      [id]
    );
    if (!lead) return Response.json({ error: 'Quote tidak ditemukan' }, { status: 404 });
    if (String(lead.perwakilan_id) !== String(auth.user.id)) {
      return Response.json({ error: 'Akses ditolak. Quote ini bukan milik Anda.' }, { status: 403 });
    }
    if (lead.status !== 'draft') {
      return Response.json({ error: 'Quote ini sudah diajukan/diproses sebelumnya.' }, { status: 400 });
    }

    await pool.query(`UPDATE kalkulator_perwakilan_lead SET status = 'diajukan', diajukan_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    await kirimNotifikasiAdmin(pool, {
      tipe: 'kalkulator_perwakilan_diajukan',
      judul: 'Ajuan Kalkulator dari Perwakilan',
      pesan: `${lead.perwakilan_nama} mengajukan quote ${lead.template_nama} (${lead.paket} ${lead.kamar}) — Rp ${Number(lead.harga_jual_perwakilan).toLocaleString('id-ID')} buat dipertimbangkan jadi program.`,
      link: '/admin/kalkulator-perwakilan',
    });

    return Response.json({ message: 'Quote diajukan ke admin!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
