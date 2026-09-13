import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// POST /api/kalkulator-publik/ajukan — pengunjung yang udah lihat estimasi
// klik "Ajukan Budget Sekarang", sinyal minat kuat ke admin buat di-follow-up.
// body: { lead_id }
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { lead_id } = await request.json();
    if (!lead_id) return Response.json({ error: 'lead_id wajib diisi' }, { status: 400 });

    const [[lead]] = await pool.query(
      `SELECT l.*, u.name AS user_nama, t.nama AS template_nama
       FROM kalkulator_lead l
       JOIN users u ON u.id = l.user_id
       JOIN kalkulator_template_publik t ON t.id = l.template_id
       WHERE l.id = ?`,
      [lead_id]
    );
    if (!lead) return Response.json({ error: 'Estimasi tidak ditemukan' }, { status: 404 });
    if (String(lead.user_id) !== String(auth.user.id)) {
      return Response.json({ error: 'Akses ditolak. Estimasi ini bukan milik Anda.' }, { status: 403 });
    }

    if (lead.status !== 'diajukan') {
      await pool.query(`UPDATE kalkulator_lead SET status = 'diajukan', diajukan_at = CURRENT_TIMESTAMP WHERE id = ?`, [lead_id]);
      await kirimNotifikasiAdmin(pool, {
        tipe: 'kalkulator_ajuan_budget',
        judul: 'Ajuan Budget dari Kalkulator Publik',
        pesan: `${lead.user_nama} mengajukan budget untuk ${lead.template_nama} (${lead.paket} ${lead.kamar}) — Rp ${Number(lead.harga_jual).toLocaleString('id-ID')}.`,
        link: '/admin/kalkulator-leads',
      });
    }

    return Response.json({ message: 'Pengajuan budget terkirim! Tim kami akan segera menghubungi Anda.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
