import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { kirimNotifikasi } from '@/lib/notifikasi';

// POST { action: 'setujui'|'tolak', catatan? } — cuma super_admin ("bos")
// yang boleh mutusin, cuma pengajuan berstatus 'diajukan' yang bisa diputus.
export async function POST(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { action, catatan } = await request.json();
    if (!['setujui', 'tolak'].includes(action)) {
      return Response.json({ error: 'action harus setujui atau tolak' }, { status: 400 });
    }

    const [[p]] = await pool.query('SELECT * FROM pengajuan_dana WHERE id = ?', [id]);
    if (!p) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (p.status !== 'diajukan') {
      return Response.json({ error: 'Cuma pengajuan yang statusnya "diajukan" yang bisa diputus.' }, { status: 400 });
    }

    const statusBaru = action === 'setujui' ? 'disetujui' : 'ditolak';
    await pool.query(
      `UPDATE pengajuan_dana SET status = ?, diputuskan_oleh = ?, diputuskan_at = NOW(), catatan_keputusan = ? WHERE id = ?`,
      [statusBaru, auth.user.id, catatan || null, id]
    );

    const [[{ total }]] = await pool.query('SELECT COALESCE(SUM(nominal),0) AS total FROM pengajuan_dana_item WHERE pengajuan_id = ?', [id]);
    if (p.diajukan_oleh) {
      await kirimNotifikasi(pool, {
        user_id: p.diajukan_oleh,
        tipe: `pengajuan_dana_${statusBaru}`,
        judul: `Pengajuan Dana ${statusBaru === 'disetujui' ? 'Disetujui' : 'Ditolak'}`,
        pesan: `Pengajuan dana bulan ${p.bulan} (Rp ${Number(total).toLocaleString('id-ID')}) ${statusBaru}.${catatan ? ' Catatan: ' + catatan : ''}`,
        link: `/admin/laporan/pengajuan-dana/${id}`,
      });
    }

    return Response.json({ message: `Pengajuan ${statusBaru}.` });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
