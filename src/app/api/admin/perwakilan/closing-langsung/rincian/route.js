import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/perwakilan/closing-langsung/rincian?booking_id=<id>
// Rincian SEMUA penerima dari 1 booking closing perwakilan (dikonfirmasi
// user 2026-09-06, mirror /api/admin/sahabat/closing-referral/rincian) —
// 1 booking bisa nge-trigger 2 jenis ujroh sekaligus: ujroh_perwakilan
// (punya si penutup sendiri) + reseller_perwakilan berjenjang ke semua
// upline-nya (lihat src/lib/closing.js) — sebelumnya dua-duanya kepisah di
// section "Closing Langsung" vs "Closing Override" tanpa ada yang
// nyambungin balik ke booking asalnya.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const bookingId = searchParams.get('booking_id');
  if (!bookingId) return Response.json({ error: 'booking_id wajib' }, { status: 400 });

  try {
    // Ikut nyertain prog_name/total_harga/jumlah_jamaah dari booking asal +
    // paket/jumlah_jamaah yang ke-snapshot di baris ledger-nya sendiri
    // (dikonfirmasi user 2026-09-06 — sebelumnya cuma nominal lump-sum,
    // bikin bingung karena gak kelihatan itu buat berapa pax & paket apa).
    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.nominal, kl.penerima_nama, u.kode_unik AS penerima_kode_unik,
              kl.keterangan, kl.dikonfirmasi_at, kl.paket, kl.jumlah_jamaah,
              b.prog_name, b.total_harga, b.jumlah_jamaah AS booking_jumlah_jamaah
       FROM komisi_ledger kl
       LEFT JOIN users u ON u.id = kl.penerima_id
       LEFT JOIN bookings b ON b.id = kl.booking_id
       WHERE kl.booking_id = ?
         AND kl.jenis IN ('ujroh_perwakilan', 'reseller_perwakilan')
       ORDER BY FIELD(kl.jenis, 'ujroh_perwakilan', 'reseller_perwakilan'), kl.id`,
      [bookingId]
    );
    return Response.json({ rincian: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
