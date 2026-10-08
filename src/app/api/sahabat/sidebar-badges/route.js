import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/sahabat/sidebar-badges
// Badge angka merah di sidebar Sahabat Baitullah (dikonfirmasi user
// 2026-10-08, extend dari fitur sama punya admin -- lihat
// /api/admin/sidebar-badges).
export async function GET(request) {
  const auth = wajibRole(request, ['sahabat_baitullah']);
  if (auth.error) return auth.error;

  const badges = {};
  try {
    // Pendaftaran akun sendiri masih kurang syarat -- bukti TF belum
    // diunggah, ATAU (rekening tabungan umroh kosong & bantuan BSI manual
    // belum disetujui), ATAU SK-CIF/Surat Kuasa Blokir belum disetujui,
    // ATAU metode TTD belum dipilih. SAMA PERSIS syarat-syarat yang dicek
    // di /status-pendaftaran-sahabat, versi ringkas (0/1 doang, bukan
    // detail per-prasyarat).
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM users u
       JOIN sahabat_pendaftaran kp ON kp.id = (SELECT MAX(id) FROM sahabat_pendaftaran WHERE user_id = u.id)
       WHERE u.id = ? AND u.status <> 'active'
         AND (
           kp.bukti_tf_path IS NULL
           OR (NULLIF(u.no_rekening_tabungan_umroh, '') IS NULL AND u.bantuan_bsi_manual_disetujui_at IS NULL)
           OR u.setuju_sk_cif_pemblokiran_at IS NULL
           OR u.metode_ttd_sahabat IS NULL
         )`,
      [auth.user.id]
    );
    if (row.n > 0) badges['/dashboard/sahabat'] = Number(row.n);
  } catch (err) {
    console.error('sidebar-badges sahabat (pendaftaran):', err.message);
  }

  try {
    // Ujroh yang udah beneran tercatat tapi belum di-acc admin -- sama
    // persis sumber data "Menunggu Konfirmasi Admin" di tab Forecast
    // /dashboard/sahabat/riwayat (dikonfirmasi user 2026-10-08, ini
    // informasional doang, jamaah gak bisa ngapa-ngapain soal ini, cuma
    // biar tau ada yang lagi diproses).
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM komisi_ledger
       WHERE penerima_id = ? AND dikonfirmasi_at IS NULL
         AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi')`,
      [auth.user.id]
    );
    if (row.n > 0) badges['/dashboard/sahabat/riwayat'] = Number(row.n);
  } catch (err) {
    console.error('sidebar-badges sahabat (pending ujroh):', err.message);
  }

  return Response.json({ badges });
}
