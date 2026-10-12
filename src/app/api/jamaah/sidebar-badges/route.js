import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { hitungBookingPerluTindakan } from '@/lib/bookingPerluTindakan';

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
    // Booking yang butuh tindakan (formulir, perjanjian, dokumen ditolak,
    // pelunasan ditolak) — lihat src/lib/bookingPerluTindakan.js, dipakai
    // bareng sidebar Sahabat Baitullah.
    const n = await hitungBookingPerluTindakan(pool, auth.user.id);
    if (n > 0) badges['/dashboard/jamaah'] = n;
  } catch (err) {
    console.error('sidebar-badges jamaah:', err.message);
  }

  return Response.json({ badges });
}
