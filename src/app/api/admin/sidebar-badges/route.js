import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { DOC_KEYS, parseJamaahData, statusDokumen } from '@/lib/dokumenPendukung';

// GET /api/admin/sidebar-badges
// Badge angka merah di sidebar admin (dikonfirmasi user 2026-10-08): CUMA
// antrian yang nunggu tindakan admin & bisa turun ke 0 begitu dikerjakan —
// bukan total data. Key = `path` item sidebar persis di Layout.jsx; key yang
// 0 gak dikirim (badge hilang). Kriterianya SENGAJA disamain sama halaman
// tujuannya masing-masing (lihat komentar per item) — kalau aturan halaman
// itu berubah, ubah di sini juga biar angka badge gak beda sama isi halaman.
// Tiap hitungan dibungkus sendiri: 1 tabel/kolom bermasalah cuma bikin badge
// itu kosong, bukan seluruh sidebar.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  const superAdmin = auth.user.role === 'super_admin';

  const badges = {};
  async function hitung(path, fn) {
    try {
      const n = Number(await fn()) || 0;
      if (n > 0) badges[path] = (badges[path] || 0) + n;
    } catch (err) {
      console.error(`sidebar-badges ${path}:`, err.message);
    }
  }
  const count = async (sql, params = []) => {
    const [[row]] = await pool.query(sql, params);
    return row.n;
  };

  await Promise.all([
    // Pembayaran nunggu konfirmasi (sama kayak cluster dashboard).
    hitung('/admin?tab=payments', () => count(
      "SELECT COUNT(*) AS n FROM payments WHERE status = 'pending'")),

    // Pembatalan: ajuan baru + refund udah disetujui tapi bukti TF belum
    // diunggah (lihat daftarRefundBelumDitransfer di src/lib/perjanjianJamaah.js).
    hitung('/admin?tab=pembatalan', () => count(
      `SELECT COUNT(*) AS n FROM pembatalan
       WHERE status = 'menunggu'
          OR (status = 'disetujui' AND refund_nominal > 0 AND bukti_refund_path IS NULL)`)),

    // Dokumen pendukung 'menunggu' — status ada di dalam JSON jamaah_data,
    // jadi dihitung di JS (sama persis GET /api/admin/dokumen-pendukung).
    hitung('/admin/dokumen-pendukung', async () => {
      const [rows] = await pool.query(
        `SELECT jamaah_data FROM bookings
         WHERE status NOT IN ('dibatalkan') AND jamaah_data IS NOT NULL`
      );
      let n = 0;
      for (const b of rows) {
        for (const j of parseJamaahData(b.jamaah_data)) {
          for (const key of DOC_KEYS) if (statusDokumen(j, key)?.status === 'menunggu') n++;
        }
      }
      return n;
    }),

    // Janji temu kantor yang belum ditandai selesai & tanggalnya HARI INI
    // atau udah lewat (section "Terlewat" + "Hari Ini" di halamannya) — yang
    // masih akan datang belum perlu tindakan.
    hitung('/admin/janji-temu-kantor', () => count(
      `SELECT
         (SELECT COUNT(*) FROM users u
          WHERE u.metode_ttd_sahabat = 'kantor' AND u.janji_temu_kantor_selesai_at IS NULL
            AND u.rencana_kunjungan_kantor_at < CURDATE() + INTERVAL 1 DAY
            AND EXISTS (SELECT 1 FROM sahabat_pendaftaran kp WHERE kp.user_id = u.id))
       + (SELECT COUNT(*) FROM users u
          JOIN agen_pendaftaran ap ON ap.id = (
            SELECT id FROM agen_pendaftaran WHERE user_id = u.id AND role_diajukan = 'perwakilan'
            ORDER BY id DESC LIMIT 1)
          WHERE (u.role = 'perwakilan' OR u.role_kedua = 'perwakilan')
            AND ap.metode = 'kantor' AND u.janji_temu_kantor_selesai_at IS NULL
            AND ap.jadwal_kunjungan < CURDATE() + INTERVAL 1 DAY) AS n`)),

    // Sahabat 'Menunggu ACC Admin' yang udah SIAP diaktifkan — kriteria
    // persis gate action=advance ke 'active' di
    // /api/status-pendaftaran-sahabat (setuju SPK-AK + TF verified +
    // rekening/bantuan BSI manual + setuju SK-CIF). SPK-AK selesai (TTD
    // fisik) SENGAJA bukan syarat (SPK_AK_SEMENTARA_FISIK, nyusul setelah
    // aktif) — dulu ikut disyaratkan lewat scan dokumen_spk_ak_fisik_path
    // yang udah dicabut dari sisi jamaah, jadi badge-nya gak pernah muncul
    // (ditemukan user 2026-10-08). Yang masih kurang syarat = nunggu jamaah.
    hitung('/admin/sahabat', () => count(
      `SELECT COUNT(*) AS n FROM sahabat_pendaftaran kp
       JOIN users u ON u.id = kp.user_id
       WHERE kp.status = 'menunggu_sk_cif' AND u.setuju_pks
         AND kp.bukti_tf_verified_at IS NOT NULL
         AND (NULLIF(u.no_rekening_tabungan_umroh, '') IS NOT NULL OR u.bantuan_bsi_manual_disetujui_at IS NOT NULL)
         AND u.setuju_sk_cif_pemblokiran_at IS NOT NULL`)),

    // Perwakilan 'Verifikasi Data oleh Admin' yang syaratnya udah lengkap
    // (formulir TTD + PKS + metode) — lihat syaratBelum di /admin/perwakilan.
    hitung('/admin/perwakilan', () => count(
      `SELECT COUNT(*) AS n FROM users u
       JOIN agen_pendaftaran ap ON ap.id = (
         SELECT id FROM agen_pendaftaran WHERE user_id = u.id AND role_diajukan = 'perwakilan'
         ORDER BY id DESC LIMIT 1)
       WHERE (u.role = 'perwakilan' OR u.role_kedua = 'perwakilan')
         AND ap.status = 'pending' AND ap.metode IS NOT NULL AND u.setuju_pks
         AND (SELECT fase FROM dokumen_signature WHERE dokumen = 'formulir' AND ref_id = u.id
              ORDER BY id DESC LIMIT 1) = 'selesai'`)),

    hitung('/admin/sahabat/setoran-mandiri-pengajuan', () => count(
      "SELECT COUNT(*) AS n FROM sahabat_setoran_mandiri_pengajuan WHERE status = 'diajukan'")),

    hitung('/admin/sahabat/ganti-target', () => count(
      "SELECT COUNT(*) AS n FROM sahabat_pendaftaran WHERE target_ganti_status IN ('diajukan', 'pembatalan_diajukan')")),

    hitung('/admin/sahabat/laporan-data', () => count(
      "SELECT COUNT(*) AS n FROM sahabat_laporan_data WHERE status = 'terbuka'")),

    // 4 antrian di bawah = kriteria persis cluster "Perlu Perhatian" di
    // /api/admin/dashboard (custom_harga, kalkulator_lead,
    // kalkulator_perwakilan_pending, akun_verifikasi).
    hitung('/admin?tab=customharga', () => count(
      "SELECT COUNT(*) AS n FROM custom_harga_request WHERE status = 'pending'")),
    hitung('/admin/kalkulator-leads', () => count(
      `SELECT COUNT(*) AS n FROM kalkulator_lead l JOIN users u ON u.id = l.user_id
       WHERE l.status = 'diajukan' AND l.status_tindak_lanjut = 'baru'`)),
    hitung('/admin/kalkulator-perwakilan', () => count(
      `SELECT COUNT(*) AS n FROM kalkulator_perwakilan_lead l
       JOIN users u ON u.id = l.perwakilan_id
       JOIN kalkulator_template_publik t ON t.id = l.template_id
       WHERE l.status = 'diajukan'`)),
    hitung('/admin?tab=users', () => count(
      `SELECT COUNT(*) AS n FROM users
       WHERE COALESCE(terverifikasi, 0) = 0 AND role NOT IN ('admin', 'super_admin', 'hop')
         AND COALESCE(status, '') <> 'rejected'`)),

    // Pencairan komisi: 'draft' = admin perlu cetak & ajukan; 'diajukan' =
    // nunggu keputusan + bukti TTD yang cuma bisa diunggah super_admin
    // (AKSI_SUPER_ADMIN_ONLY di pengajuan-ujroh/[id]) — jadi cuma dihitung
    // buat super_admin, admin biasa gak bisa ngapa-ngapain di tahap itu.
    hitung('/admin/sahabat/pencairan', () => count(
      `SELECT COUNT(*) AS n FROM pengajuan_ujroh WHERE status IN (?)`,
      [superAdmin ? ['draft', 'diajukan'] : ['draft']])),
    hitung('/admin/perwakilan/pencairan', () => count(
      `SELECT COUNT(*) AS n FROM pengajuan_ujroh_perwakilan WHERE status IN (?)`,
      [superAdmin ? ['draft', 'diajukan'] : ['draft']])),
  ]);

  return Response.json({ badges });
}
