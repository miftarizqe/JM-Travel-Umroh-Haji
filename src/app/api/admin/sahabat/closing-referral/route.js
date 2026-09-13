import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/closing-referral — daftar "closing Sahabat
// Baitullah" (dikonfirmasi user 2026-09-06): orang BARU yang berhasil buka
// rekening/tabungan umroh via referral anggota lain sampai aktif — BEDA dari
// "Closing Langsung" (booking program umroh, lihat closing-langsung/route.js).
// Ini closing REKRUTAN (buka rekening), itu closing PROGRAM (booking).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.kode_unik,
              perekrut.name AS perekrut_nama, perekrut.kode_unik AS perekrut_kode_unik,
              (SELECT created_at FROM pendaftaran_status_log
                 WHERE user_id = u.id AND tipe = 'sahabat_baitullah' AND status_baru = 'active'
                 ORDER BY id DESC LIMIT 1) AS tanggal_aktif,
              (SELECT COALESCE(SUM(nominal), 0) FROM komisi_ledger WHERE ref_id = u.id AND jenis = 'komisi_sahabat') AS total_dibagikan
       FROM sahabat_pendaftaran kp
       JOIN users u ON u.id = kp.user_id
       JOIN users perekrut ON perekrut.id = kp.perekrut_id
       WHERE kp.status = 'active' AND kp.perekrut_id IS NOT NULL
       ORDER BY tanggal_aktif DESC`
    );
    return Response.json({ closing: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
