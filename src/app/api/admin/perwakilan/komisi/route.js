import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/perwakilan/komisi?user_id=xxx — riwayat ujroh 1 perwakilan
// (read-only, mirror /api/admin/sahabat/komisi). BEDA dari Sahabat Baitullah:
// SEMUA baris ujroh perwakilan wajib lewat pipeline pengajuan_ujroh_perwakilan
// (gak ada jalur konfirmasi lepas) — makanya konfirmasi dilakukan di
// /admin/perwakilan/pencairan, bukan di sini.
//
// Filter OPSIONAL buat rekap per-periode (dikonfirmasi user 2026-09-06):
//   tahun   — YEAR(created_at) = ?
//   bulan   — MONTH(created_at) = ? (cuma dipakai kalau `tahun` juga dikirim)
//   prog_id — filter ke 1 program (lewat booking_id -> bookings.prog_id)
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });
    const tahun = searchParams.get('tahun');
    const bulan = searchParams.get('bulan');
    const progId = searchParams.get('prog_id');

    const where = ['kl.penerima_id = ?', "kl.jenis IN ('ujroh_perwakilan','reseller_perwakilan')"];
    const params = [userId];
    if (tahun) { where.push('YEAR(kl.created_at) = ?'); params.push(tahun); }
    if (tahun && bulan) { where.push('MONTH(kl.created_at) = ?'); params.push(bulan); }
    if (progId) { where.push('b.prog_id = ?'); params.push(progId); }

    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.nominal, kl.keterangan, kl.dikonfirmasi_at, kl.bukti_tf_admin_path, kl.created_at,
              b.prog_id, b.prog_name
       FROM komisi_ledger kl
       LEFT JOIN bookings b ON b.id = kl.booking_id
       WHERE ${where.join(' AND ')}
       ORDER BY kl.created_at DESC`,
      params
    );

    // Daftar program yang PERNAH kasih ujroh ke orang ini — buat isi dropdown
    // filter "Per Program" di UI, independen dari filter yang lagi aktif.
    const [progRows] = await pool.query(
      `SELECT DISTINCT b.prog_id, b.prog_name
       FROM komisi_ledger kl JOIN bookings b ON b.id = kl.booking_id
       WHERE kl.penerima_id = ? AND kl.jenis IN ('ujroh_perwakilan','reseller_perwakilan') AND b.prog_id IS NOT NULL
       ORDER BY b.prog_name`,
      [userId]
    );

    return Response.json({ komisi: rows, program_tersedia: progRows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
