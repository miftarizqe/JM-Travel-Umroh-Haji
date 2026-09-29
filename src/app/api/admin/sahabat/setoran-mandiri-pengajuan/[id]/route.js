import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// PATCH /api/admin/sahabat/setoran-mandiri-pengajuan/[id]  body: { action, catatan_admin }
// action: 'approve' | 'reject'. Approve = admin udah cocokkan nominal &
// bukti ini sama mutasi rekening tabungan umroh jamaah beneran nambah —
// baru DI SINI baris komisi_ledger jenis='setoran_mandiri_sahabat' lahir
// (auto dikonfirmasi_at, sama persis semantik entri manual lewat
// /api/admin/sahabat/setoran-mandiri). Reject = pengajuan dibatalkan, TIDAK
// ada saldo yang ditambahkan sama sekali.
export async function PATCH(request, { params }) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const { action, catatan_admin } = await request.json();
    if (!['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'action (approve/reject) wajib diisi' }, { status: 400 });
    }

    const [[p]] = await pool.query('SELECT * FROM sahabat_setoran_mandiri_pengajuan WHERE id = ?', [id]);
    if (!p) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (p.status !== 'diajukan') return Response.json({ error: 'Pengajuan ini sudah diproses sebelumnya.' }, { status: 400 });

    if (action === 'reject') {
      await pool.query(
        `UPDATE sahabat_setoran_mandiri_pengajuan
         SET status = 'ditolak', catatan_admin = ?, diproses_oleh = ?, diproses_at = NOW()
         WHERE id = ?`,
        [catatan_admin || null, auth.user.id, id]
      );
      await catatAudit(pool, {
        actor: auth.user, aksi: 'sahabat_setoran_mandiri_pengajuan_tolak',
        target_type: 'setoran_mandiri_pengajuan', target_id: String(id),
        keterangan: `Tolak pengajuan setoran mandiri Rp${Number(p.nominal).toLocaleString('id-ID')} — ${catatan_admin || 'tanpa catatan'}`,
      });
      return Response.json({ message: 'Pengajuan ditolak.' });
    }

    const [[u]] = await pool.query('SELECT name FROM users WHERE id = ?', [p.user_id]);
    const [result] = await pool.query(
      `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan, dikonfirmasi_at)
       VALUES (NULL, ?, ?, ?, 'setoran_mandiri_sahabat', 1, ?, ?, NOW())`,
      [p.user_id, p.user_id, u?.name || null, p.nominal, `Setoran mandiri jamaah — via pengajuan #${id}, bukti terlampir`]
    );

    await pool.query(
      `UPDATE sahabat_setoran_mandiri_pengajuan
       SET status = 'disetujui', catatan_admin = ?, diproses_oleh = ?, diproses_at = NOW(), komisi_ledger_id = ?
       WHERE id = ?`,
      [catatan_admin || null, auth.user.id, result.insertId, id]
    );

    await catatAudit(pool, {
      actor: auth.user, aksi: 'sahabat_setoran_mandiri_pengajuan_setujui',
      target_type: 'setoran_mandiri_pengajuan', target_id: String(id),
      keterangan: `Setujui setoran mandiri Rp${Number(p.nominal).toLocaleString('id-ID')} untuk ${u?.name || p.user_id}`,
    });

    return Response.json({ message: 'Pengajuan disetujui, saldo sudah ditambahkan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
