import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat — daftar semua pendaftaran sahabat buat admin,
// gabung data users yang relevan (status BSI/tabungan haji/CIF/dokumen
// fisik ada di users, bukan di sahabat_pendaftaran — lihat migration-sahabat.sql).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    // Voucher pendaftaran per orang — ambil yang TERBARU per for_user lewat
    // subquery korelasi (bukan GROUP BY, karena kolom lain vouchers gak
    // relevan buat diagregasi) biar re-issue lama gak numpuk jadi row ganda.
    const [rows] = await pool.query(
      `SELECT kp.*, u.kode_unik, u.role AS user_role, u.status AS user_status,
              u.cif_bsi, u.no_rekening_bsi_biasa, u.no_rekening_tabungan_umroh,
              u.akun_bsi_status, u.tabungan_haji_status,
              u.dokumen_spk_ak_fisik_path, u.dokumen_sk_cif_fisik_path, u.dokumen_cif_fisik_diterima_at,
              u.dokumen_surat_pemblokiran_fisik_path,
              perekrut.name AS perekrut_nama,
              v.id AS voucher_id, v.kode AS voucher_kode, v.used AS voucher_used, v.aktif AS voucher_aktif, v.disetujui_at AS voucher_disetujui_at,
              (SELECT fase FROM dokumen_signature WHERE dokumen = 'spk_ak' AND ref_id = kp.user_id
                 ORDER BY id DESC LIMIT 1) AS spk_ak_fase
       FROM sahabat_pendaftaran kp
       JOIN users u ON u.id = kp.user_id
       LEFT JOIN users perekrut ON perekrut.id = kp.perekrut_id
       LEFT JOIN vouchers v ON v.id = (
         SELECT id FROM vouchers WHERE for_user = kp.user_id AND akses_role = 'akun'
         ORDER BY created_at DESC LIMIT 1
       )
       ORDER BY kp.created_at DESC`
    );

    // spk_ak_selesai: sama persis logic GET /api/status-pendaftaran-sahabat
    // (dipakai buat validasi prasyarat advance ke menunggu_sk_cif) — surface
    // di sini juga biar admin lihat blocker SEBELUM klik tombol & kena 400.
    for (const r of rows) {
      r.spk_ak_selesai = r.spk_ak_fase === 'selesai' || !!r.dokumen_spk_ak_fisik_path;
    }

    // "Terbayar" = yang beneran udah dikonfirmasi super_admin (transfer BSI
    // udah OK) — bukan sekadar tercatat, dan gabung DUA jenis (komisi
    // rekrutan flat + closing langsung), bukan cuma komisi_sahabat lagi.
    const [[{ totalKomisi }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS totalKomisi FROM komisi_ledger
       WHERE jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat') AND dikonfirmasi_at IS NOT NULL`
    );

    return Response.json({ pendaftaran: rows, total_komisi_terbayar: totalKomisi });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
