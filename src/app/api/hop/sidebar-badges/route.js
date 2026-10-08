import pool from '@/lib/db';
import { wajibHopSahabat } from '@/lib/hopAuth';

// GET /api/hop/sidebar-badges
// Badge angka merah di sidebar HOP (dikonfirmasi user 2026-10-08, extend
// dari fitur sama punya admin -- lihat /api/admin/sidebar-badges). HOP
// "baca saja", gak bisa aksi apa-apa, tapi tetap mau di-kasih tau kalau
// ada update/antrian biar bisa di-follow-up manual ke admin.
export async function GET(request) {
  const auth = await wajibHopSahabat(request);
  if (auth.error) return auth.error;

  const badges = {};
  try {
    // Sama persis kriteria badge admin '/admin/sahabat' -- sahabat yang
    // udah lengkap syarat & siap di-ACC. HOP gak bisa klik ACC-nya, tapi
    // perlu tau biar bisa dorong admin buat follow up.
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM sahabat_pendaftaran kp
       JOIN users u ON u.id = kp.user_id
       WHERE kp.status = 'menunggu_sk_cif' AND u.setuju_pks
         AND kp.bukti_tf_verified_at IS NOT NULL
         AND (NULLIF(u.no_rekening_tabungan_umroh, '') IS NOT NULL OR u.bantuan_bsi_manual_disetujui_at IS NOT NULL)
         AND u.setuju_sk_cif_pemblokiran_at IS NOT NULL`
    );
    if (row.n > 0) badges['/admin/sahabat'] = Number(row.n);
  } catch (err) {
    console.error('sidebar-badges hop (siap acc):', err.message);
  }

  try {
    // Sahabat baru daftar, belum unggah bukti TF -- sama persis cluster
    // "Perlu Perhatian" dashboard admin, informasional buat HOP.
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM sahabat_pendaftaran
       WHERE status = 'pending' AND bukti_tf_path IS NULL`
    );
    if (row.n > 0) badges['/dashboard/sahabat/hop'] = Number(row.n);
  } catch (err) {
    console.error('sidebar-badges hop (baru daftar):', err.message);
  }

  return Response.json({ badges });
}
