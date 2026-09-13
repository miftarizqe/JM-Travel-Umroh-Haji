import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/perwakilan — daftar semua kandidat/anggota Perwakilan buat
// halaman Pendaftaran (mirror /api/admin/sahabat). SUMBER dari `users`
// (bukan agen_pendaftaran) — LEFT JOIN ke baris agen_pendaftaran TERBARU
// (role_diajukan='perwakilan') supaya 2 kasus tetap kebaca:
//  1. akun legacy status='pending' yang belum pernah punya baris
//     agen_pendaftaran (pra-fitur formulir digital), pendaftaran_id NULL.
//  2. akun dual-role (role_kedua='perwakilan', lihat migration-role-kedua.sql)
//     yang role UTAMANYA bukan 'perwakilan' — makanya filter WHERE pakai
//     (role='perwakilan' OR role_kedua='perwakilan'), bukan cuma role=.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT u.id AS user_id, u.name AS nama, u.kode_unik, u.email, u.wa,
              u.status AS user_status, u.role, u.role_kedua, u.perekrut_id,
              u.terverifikasi, u.foto_path, u.setuju_pks,
              perekrut.name AS perekrut_nama,
              ap.id AS pendaftaran_id, ap.status AS pendaftaran_status,
              ap.metode AS pendaftaran_metode, ap.untuk_role_kedua,
              (SELECT fase FROM dokumen_signature WHERE dokumen = 'formulir' AND ref_id = u.id
                 ORDER BY id DESC LIMIT 1) AS formulir_fase
       FROM users u
       LEFT JOIN users perekrut ON perekrut.id = u.perekrut_id
       LEFT JOIN agen_pendaftaran ap ON ap.id = (
         SELECT id FROM agen_pendaftaran WHERE user_id = u.id AND role_diajukan = 'perwakilan'
         ORDER BY id DESC LIMIT 1
       )
       WHERE u.role = 'perwakilan' OR u.role_kedua = 'perwakilan'
       ORDER BY u.created_at DESC`
    );

    const list = rows.map(r => ({
      ...r,
      // Status buat pengelompokan cluster funnel — pakai status baris
      // pendaftaran kalau ada, fallback ke status akun buat legacy row
      // yang gak punya agen_pendaftaran (lihat komentar di atas).
      status: r.pendaftaran_id
        ? r.pendaftaran_status
        : (r.user_status === 'rejected' ? 'ditolak' : (r.user_status === 'active' ? 'active' : 'pending')),
      formulir_ttd_selesai: r.formulir_fase === 'selesai',
      pks_disetujui: !!r.setuju_pks,
    }));

    const [[{ totalKomisi }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS totalKomisi FROM komisi_ledger
       WHERE jenis IN ('ujroh_perwakilan','reseller_perwakilan') AND dikonfirmasi_at IS NOT NULL`
    );

    return Response.json({ pendaftaran: list, total_komisi_terbayar: totalKomisi });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
