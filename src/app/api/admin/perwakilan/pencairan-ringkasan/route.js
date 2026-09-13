import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/perwakilan/pencairan-ringkasan — mirror PERSIS pola
// /api/admin/sahabat/pencairan-ringkasan (dikonfirmasi user 2026-09-06,
// dipakai buat kartu ringkas /admin/perwakilan/pencairan & cluster reminder
// "Ujroh Perwakilan Belum Diajukan" di dashboard utama). Jenis yang dipakai
// sama kayak /api/admin/perwakilan/pengajuan-ujroh: ujroh closing langsung
// milik perwakilan sendiri + margin reseller berjenjang (upline), digabung.
const JENIS_UJROH_PERWAKILAN = ['ujroh_perwakilan', 'reseller_perwakilan'];

export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const [[{ terbayar }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS terbayar FROM komisi_ledger
       WHERE jenis IN (?) AND dikonfirmasi_at IS NOT NULL`,
      [JENIS_UJROH_PERWAKILAN]
    );
    const [[{ pendingTotal, pendingCount }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS pendingTotal, COUNT(*) AS pendingCount FROM komisi_ledger
       WHERE dikonfirmasi_at IS NULL AND jenis IN (?)`,
      [JENIS_UJROH_PERWAKILAN]
    );
    // Sama seperti versi Sahabat Baitullah: khusus yang beneran belum pernah
    // masuk pengajuan manapun DAN program-nya udah lewat tanggal berangkat
    // (gate wajib di POST /api/admin/perwakilan/pengajuan-ujroh — kalau
    // belum berangkat, pengajuan emang belum bisa dibuat, jadi jangan ikut
    // dihitung sebagai "belum diajukan" di reminder ini).
    const [[{ belumDiajukanTotal, belumDiajukanCount }]] = await pool.query(
      `SELECT COALESCE(SUM(kl.nominal),0) AS belumDiajukanTotal, COUNT(*) AS belumDiajukanCount
       FROM komisi_ledger kl
       JOIN bookings b ON b.id = kl.booking_id
       JOIN programs p ON p.id = b.prog_id
       WHERE kl.dikonfirmasi_at IS NULL AND kl.pengajuan_ujroh_perwakilan_id IS NULL
         AND kl.jenis IN (?) AND p.tanggal_berangkat IS NOT NULL AND p.tanggal_berangkat < CURDATE()`,
      [JENIS_UJROH_PERWAKILAN]
    );

    return Response.json({
      terbayar,
      pending_total: pendingTotal,
      pending_count: pendingCount,
      belum_diajukan_total: belumDiajukanTotal,
      belum_diajukan_count: belumDiajukanCount,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
