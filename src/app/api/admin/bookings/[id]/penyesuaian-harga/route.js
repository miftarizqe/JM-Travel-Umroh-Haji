import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kirimNotifikasi } from '@/lib/notifikasi';

// POST /api/admin/bookings/[id]/penyesuaian-harga  body: { harga_baru, alasan }
// Admin ajukan penyesuaian harga (kenaikan tiket, force majeure, dll) — jamaah
// WAJIB setuju eksplisit (lihat /penyesuaian-harga) sebelum bisa lanjut
// pelunasan (gate di src/app/pelunasan/page.jsx). Cuma boleh 1 pengajuan
// 'pending' aktif per booking pada satu waktu.
export async function POST(request, { params }) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const { harga_baru, alasan } = await request.json();
    if (!harga_baru || Number(harga_baru) <= 0 || !alasan?.trim()) {
      return Response.json({ error: 'Harga baru dan alasan wajib diisi' }, { status: 400 });
    }

    const [[booking]] = await pool.query('SELECT id, total_harga, user_id, ordered_by FROM bookings WHERE id = ?', [id]);
    if (!booking) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });

    const [[pending]] = await pool.query(
      "SELECT id FROM booking_penyesuaian_harga WHERE booking_id = ? AND status = 'pending'",
      [id]
    );
    if (pending) {
      return Response.json({ error: 'Masih ada pengajuan penyesuaian harga yang menunggu persetujuan jamaah' }, { status: 400 });
    }

    const [result] = await pool.query(
      `INSERT INTO booking_penyesuaian_harga (booking_id, harga_lama, harga_baru, alasan, diajukan_oleh)
       VALUES (?, ?, ?, ?, ?)`,
      [id, booking.total_harga, Number(harga_baru), alasan.trim(), auth.user.id]
    );

    const signerId = booking.ordered_by || booking.user_id;
    if (signerId) {
      await kirimNotifikasi(pool, {
        user_id: signerId,
        tipe: 'penyesuaian_harga',
        judul: 'Ada Penyesuaian Harga pada Booking Anda',
        pesan: `Harga booking ${id} disesuaikan menjadi Rp ${Number(harga_baru).toLocaleString('id-ID')}. Mohon tinjau & setujui sebelum melunasi.`,
        link: `/penyesuaian-harga?booking_id=${id}`,
      });
    }

    return Response.json({ message: 'Pengajuan penyesuaian harga terkirim ke jamaah.', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
