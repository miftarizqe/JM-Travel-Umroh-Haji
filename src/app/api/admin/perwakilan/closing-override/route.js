import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/perwakilan/closing-override — daftar margin reseller
// (jenis 'reseller_perwakilan') yang mengalir ke UPLINE saat downline-nya
// closing — histori terpisah dari Closing Langsung (dikonfirmasi user
// 2026-09-06): itu ujroh milik SI PENUTUP, ini bagian yang ngalir ke ATAS
// rantai reseller. Dibatasi 100 terbaru, sama alasan kayak closing-langsung.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT kl.id, kl.nominal, kl.keterangan, kl.created_at, kl.dikonfirmasi_at,
              penerima.name AS penerima_nama, penerima.kode_unik AS penerima_kode_unik,
              b.prog_name
       FROM komisi_ledger kl
       JOIN users penerima ON penerima.id = kl.penerima_id
       LEFT JOIN bookings b ON b.id = kl.booking_id
       WHERE kl.jenis = 'reseller_perwakilan'
       ORDER BY kl.created_at DESC
       LIMIT 100`
    );
    return Response.json({ override: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
