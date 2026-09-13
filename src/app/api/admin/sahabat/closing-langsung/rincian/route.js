import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/closing-langsung/rincian?booking_id=<id>
// Rincian SEMUA penerima dari 1 booking closing langsung Sahabat Baitullah
// (dikonfirmasi user 2026-09-06, mirror /api/admin/perwakilan/closing-langsung/rincian)
// — 1 booking "closing jamaah lain" bayar 2 penerima sekaligus dengan jenis
// ledger yang SAMA ('closing_langsung_sahabat'): Head of Program (nominal
// per-program) + si closer (nominal fix) — dibedain di sini pakai
// pengaturan.head_of_program_user_id, bukan dari kolom jenis. Booking
// checkout-diri-sendiri cuma 1 baris (ke diri sendiri, closer=HOP).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const bookingId = searchParams.get('booking_id');
  if (!bookingId) return Response.json({ error: 'booking_id wajib' }, { status: 400 });

  try {
    const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
    const hopId = pengaturan?.head_of_program_user_id || null;

    const [rows] = await pool.query(
      `SELECT kl.id, kl.nominal, kl.penerima_id, kl.penerima_nama, u.kode_unik AS penerima_kode_unik,
              kl.keterangan, kl.dikonfirmasi_at, kl.paket, kl.jumlah_jamaah,
              b.prog_name, b.total_harga, b.jumlah_jamaah AS booking_jumlah_jamaah
       FROM komisi_ledger kl
       LEFT JOIN users u ON u.id = kl.penerima_id
       LEFT JOIN bookings b ON b.id = kl.booking_id
       WHERE kl.booking_id = ? AND kl.jenis = 'closing_langsung_sahabat'
       ORDER BY kl.id`,
      [bookingId]
    );
    const rincian = rows.map(r => ({
      ...r,
      peran: hopId && String(r.penerima_id) === String(hopId) ? 'Head of Program' : 'Closing Sendiri',
    }));
    return Response.json({ rincian });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
