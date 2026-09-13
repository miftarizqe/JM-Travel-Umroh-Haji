import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/perwakilan/closing-langsung — daftar booking yang closing
// langsung ATAS NAMA si perwakilan sendiri (referral_perw_id), mirror
// /api/admin/sahabat/closing-langsung. Ini "kerjaan utama" perwakilan (beda
// dari Sahabat Baitullah yang closing langsung itu sampingan) jadi jumlahnya
// bisa banyak — dibatasi 100 terbaru, cukup buat histori sekilas; rekap
// lengkap per-orang (filter periode/program + download) ada di tombol
// "Lihat Rekap & Download" di Database Perwakilan.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.total_harga, b.status, b.created_at,
              u.name AS pemesan_nama, u.wa AS pemesan_wa,
              perw.name AS perwakilan_nama, perw.kode_unik AS perwakilan_kode_unik
       FROM bookings b
       JOIN users perw ON perw.id = b.referral_perw_id
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.referral_perw_id IS NOT NULL
       ORDER BY b.created_at DESC
       LIMIT 100`
    );
    return Response.json({ bookings: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
