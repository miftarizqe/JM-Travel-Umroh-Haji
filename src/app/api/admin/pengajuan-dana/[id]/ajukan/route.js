import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// POST /api/admin/pengajuan-dana/[id]/ajukan — kunci draft, kirim buat
// diputuskan super_admin. Gak bisa diedit lagi sesudah ini (lihat guard
// status==='draft' di PUT [id]).
export async function POST(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[p]] = await pool.query('SELECT * FROM pengajuan_dana WHERE id = ?', [id]);
    if (!p) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (p.status !== 'draft') return Response.json({ error: 'Pengajuan ini udah diajukan/diputuskan.' }, { status: 400 });

    const [[{ jml }]] = await pool.query('SELECT COUNT(*) AS jml FROM pengajuan_dana_item WHERE pengajuan_id = ?', [id]);
    if (jml === 0) return Response.json({ error: 'Tambahin minimal 1 baris kebutuhan dulu sebelum diajukan.' }, { status: 400 });

    await pool.query(
      "UPDATE pengajuan_dana SET status = 'diajukan', diajukan_oleh = ?, diajukan_at = NOW() WHERE id = ?",
      [auth.user.id, id]
    );

    const [[{ total }]] = await pool.query('SELECT COALESCE(SUM(nominal),0) AS total FROM pengajuan_dana_item WHERE pengajuan_id = ?', [id]);
    await kirimNotifikasiAdmin(pool, {
      tipe: 'pengajuan_dana_baru',
      judul: 'Pengajuan Dana Baru',
      pesan: `Pengajuan dana bulan ${p.bulan} senilai Rp ${Number(total).toLocaleString('id-ID')} menunggu persetujuan.`,
      link: `/admin/laporan/pengajuan-dana/${id}`,
    });

    return Response.json({ message: 'Pengajuan dikirim, menunggu persetujuan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
