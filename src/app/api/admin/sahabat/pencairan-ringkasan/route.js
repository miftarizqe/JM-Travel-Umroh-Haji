import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/pencairan-ringkasan — 3 angka ringkas buat
// /admin/sahabat/pencairan: sudah dibayar (dikonfirmasi_at terisi, jenis
// sama persis logic lama di /api/admin/sahabat), pending (belum
// dikonfirmasi, jenis sama kayak /api/admin/sahabat/komisi-rekap — yang
// dicetak buat pengajuan ke direktur), dan jumlah baris pending itu sendiri
// ("Pengajuan" = COUNT baris, dikonfirmasi user 2026-08-29 — bukan status
// baru, gak ada tabel/kolom tambahan).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const [[{ terbayar }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS terbayar FROM komisi_ledger
       WHERE jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat') AND dikonfirmasi_at IS NOT NULL`
    );
    const [[{ pendingTotal, pendingCount }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS pendingTotal, COUNT(*) AS pendingCount FROM komisi_ledger
       WHERE dikonfirmasi_at IS NULL
         AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi')`
    );
    // Beda dari pendingTotal/pendingCount di atas (SEMUA yang belum
    // dikonfirmasi, termasuk yang udah masuk batch & nunggu approval) —
    // ini KHUSUS yang beneran belum pernah masuk pengajuan manapun, dipakai
    // cluster reminder "Ujroh Pending Belum Diajukan" (Fase 2, 2026-08-30).
    const [[{ belumDiajukanTotal, belumDiajukanCount }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS belumDiajukanTotal, COUNT(*) AS belumDiajukanCount FROM komisi_ledger
       WHERE dikonfirmasi_at IS NULL AND pengajuan_ujroh_id IS NULL
         AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi')`
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
