import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/closing-langsung — daftar booking yang atribusi
// ke anggota sahabat (referral_sahabat_id) lewat closing langsung
// (bukan jalur nabung). MURNI visibilitas read-only — split rekening
// pribadi/rekening umroh dihitung & ditransfer MANUAL oleh admin di luar
// sistem, tidak ada kalkulasi otomatis di sini (dikonfirmasi user).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.total_harga,
              b.dp_status, b.pelunasan_status, b.status, b.created_at,
              u.name AS pemesan_nama, u.wa AS pemesan_wa,
              k.name AS sahabat_nama, k.kode_unik AS sahabat_kode_unik
       FROM bookings b
       JOIN users k ON k.id = b.referral_sahabat_id
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.referral_sahabat_id IS NOT NULL
       ORDER BY b.created_at DESC`
    );
    return Response.json({ bookings: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
