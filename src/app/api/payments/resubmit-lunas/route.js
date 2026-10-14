import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// POST /api/payments/resubmit-lunas — kirim ulang bukti transfer buat
// payment PELUNASAN/CICILAN yang DITOLAK admin. Sama pola kayak
// resubmit-dp (dikonfirmasi user 2026-10-14, "jangan malah jadi kayak
// nambah baru") — UPDATE baris yang sama, balik ke status 'pending',
// BUKAN insert payment baru. Sebelum fix ini (ditemukan via audit
// notifikasi 2026-10-14), pelunasan/cicilan yang ditolak GAK PUNYA jalur
// benerin sama sekali — jamaah cuma lihat dashboard generic tanpa tau
// kenapa & gimana cara benerinnya.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { payment_id, bukti_path, bukti_nama } = await request.json();
    if (!payment_id || !bukti_path) {
      return Response.json({ error: 'payment_id dan bukti_path wajib diisi' }, { status: 400 });
    }

    const [[payment]] = await pool.query('SELECT * FROM payments WHERE id = ?', [payment_id]);
    if (!payment) return Response.json({ error: 'Payment tidak ditemukan' }, { status: 404 });
    if (payment.type !== 'lunas' || payment.status !== 'rejected') {
      return Response.json({ error: 'Payment ini bukan pelunasan yang ditolak, tidak bisa diajukan ulang.' }, { status: 400 });
    }

    const [[booking]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [payment.booking_id]);
    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    const pemilik = booking && (booking.user_id === auth.user.id || booking.ordered_by === auth.user.id);
    if (!isAdmin && !pemilik) {
      return Response.json({ error: 'Anda tidak punya akses ke payment ini' }, { status: 403 });
    }

    // Harus payment lunas TERAKHIR buat booking ini — konsisten sama
    // resubmit-dp, jaga-jaga kalau somehow ada cicilan lebih baru yang
    // udah nutup/menggantikan yang ditolak ini.
    const [[terbaru]] = await pool.query(
      `SELECT id FROM payments WHERE booking_id = ? AND type = 'lunas' ORDER BY created_at DESC LIMIT 1`,
      [payment.booking_id]
    );
    if (terbaru?.id !== payment.id) {
      return Response.json({ error: 'Pelunasan ini sudah bukan yang terbaru untuk booking ini.' }, { status: 400 });
    }

    await pool.query(
      `UPDATE payments SET status = 'pending', bukti_path = ?, bukti_nama = ?, bukti_uploaded_at = NOW(), reject_reason = NULL WHERE id = ?`,
      [bukti_path, bukti_nama || null, payment_id]
    );
    // Sama kayak submission pelunasan baru (POST /api/payments) — booking
    // balik nunggu konfirmasi admin.
    await pool.query("UPDATE bookings SET pelunasan_status = 'pending_confirm' WHERE id = ?", [payment.booking_id]);

    await kirimNotifikasiAdmin(pool, {
      tipe: 'pembayaran_baru',
      judul: 'Bukti Pelunasan Diajukan Ulang',
      pesan: `${auth.user.name || 'Jamaah'} mengirim ulang bukti pelunasan untuk booking ${payment.booking_id} (sebelumnya ditolak).`,
      link: '/admin?tab=payments',
    });

    return Response.json({ message: 'Bukti pelunasan baru terkirim! Menunggu konfirmasi admin.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
