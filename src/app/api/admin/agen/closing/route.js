import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/agen/closing — riwayat booking yang closing lewat link
// referral agen (jenis='ujroh_agen'). Beda dari pola Perwakilan/Sahabat
// (closing-langsung + closing-override 2 seksi + rincian expand) — Agen
// cuma punya 1 jenis komisi flat, 1 penerima per booking, jadi cukup list
// datar langsung JOIN, gak perlu lazy-load rincian (dikonfirmasi user
// 2026-10-17).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT kl.id, kl.nominal, kl.jumlah_jamaah, kl.dikonfirmasi_at, kl.created_at,
              b.id AS booking_id, b.prog_name, b.status AS booking_status,
              agen.id AS agen_id, agen.name AS agen_nama, agen.kode_unik AS agen_kode_unik
       FROM komisi_ledger kl
       JOIN bookings b ON b.id = kl.booking_id
       JOIN users agen ON agen.id = kl.penerima_id
       WHERE kl.jenis = 'ujroh_agen'
       ORDER BY kl.created_at DESC
       LIMIT 100`
    );
    return Response.json({ closing: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
