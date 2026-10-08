import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/jamaah/sidebar-badges
// Badge angka merah di sidebar jamaah (dikonfirmasi user 2026-10-08, extend
// dari fitur sama punya admin -- lihat /api/admin/sidebar-badges, pola
// dipertahankan sama: key = path sidebar, cuma antrian yang BENERAN perlu
// tindakan akun ini sendiri, bukan total data).
export async function GET(request) {
  const auth = wajibRole(request, ['jamaah']);
  if (auth.error) return auth.error;

  const badges = {};
  try {
    // Booking milik sendiri (user_id) ATAU yang di-order-in dia (ordered_by)
    // yang masih butuh tindakan: formulir jamaah belum lengkap (stage 1-2),
    // ATAU formulir udah lengkap tapi Perjanjian Jamaah belum disetujui
    // (stage 3) -- SAMA PERSIS kriteria getStage() di
    // src/lib/bookingStage.js, cuma gak butuh dokumen_signature join karena
    // begitu setuju_pks terisi, itu udah "nunggu admin", bukan tindakan
    // jamaah lagi. Booking checkout mandiri Sahabat Baitullah
    // (publish_type 'sahabat_baitullah') DIKECUALIKAN dari syarat
    // perjanjian (gak pernah ada tahap itu, lihat perjanjianSelesai() di
    // bookingStage.js).
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM bookings b
       LEFT JOIN programs p ON p.id = b.prog_id
       WHERE (b.user_id = ? OR b.ordered_by = ?) AND b.status = 'active'
         AND (
           b.form_filled < b.form_total
           OR (b.form_filled >= b.form_total AND b.dp_status = 'confirmed' AND NOT b.setuju_pks
               AND (p.publish_type IS NULL OR p.publish_type <> 'sahabat_baitullah'))
         )`,
      [auth.user.id, auth.user.id]
    );
    if (row.n > 0) badges['/dashboard/jamaah'] = Number(row.n);
  } catch (err) {
    console.error('sidebar-badges jamaah:', err.message);
  }

  return Response.json({ badges });
}
