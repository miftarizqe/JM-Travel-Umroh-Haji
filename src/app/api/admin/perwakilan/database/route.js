import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const JENIS_KOMISI = "'ujroh_perwakilan','reseller_perwakilan'";

const SORT_KOLOM = {
  kode: 'u.kode_unik',
  nama: 'u.name',
  created_at: 'u.created_at',
  komisi: 'total_komisi',
  status: 'u.status',
};

// GET /api/admin/perwakilan/database — profil lengkap Perwakilan buat admin,
// mirror /api/admin/sahabat/database (list+expand-row di frontend, termasuk
// search/filter/sort/pagination server-side — dikonfirmasi user 2026-09-06,
// Perwakilan disamain persis ke gaya Sahabat Baitullah, bukan sebaliknya).
//
// Query params OPSIONAL, sama pola kayak /api/admin/sahabat/database:
//   page, per_page  — tanpa `page`, balikin SEMUA baris apa adanya.
//   q               — cari nama/kode_unik/wa/nik.
//   status          — filter status akun ('semua' = semua).
//   sort, dir       — nama|created_at|komisi|status, asc|desc (default nama asc).
//
// Total komisi per-orang diagregasi lewat LEFT JOIN + subquery GROUP BY
// (bukan query terpisah per baris) — sama alasan performa kayak saldo
// tabungan umroh Sahabat Baitullah.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const perPage = Math.min(Math.max(Number(searchParams.get('per_page')) || 25, 1), 200);
    const page = Math.max(Number(pageParam) || 1, 1);
    const q = (searchParams.get('q') || '').trim();
    const status = searchParams.get('status') || 'semua';
    // Default sort: kode_unik ASC (dikonfirmasi user 2026-09-06 — apapun
    // halaman database-nya, default-nya urut kode, bukan nama/tanggal lagi).
    const orderCol = SORT_KOLOM[searchParams.get('sort')] || SORT_KOLOM.kode;
    const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';

    const where = ["(u.role = 'perwakilan' OR u.role_kedua = 'perwakilan')"];
    const params = [];
    if (status !== 'semua') { where.push('u.status = ?'); params.push(status); }
    if (q) {
      where.push('(u.name LIKE ? OR u.kode_unik LIKE ? OR u.wa LIKE ? OR u.nik LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const baseFrom = `
       FROM users u
       LEFT JOIN users perekrut ON perekrut.id = u.perekrut_id
       LEFT JOIN agen_pendaftaran ap ON ap.id = (
         SELECT id FROM agen_pendaftaran WHERE user_id = u.id AND role_diajukan = 'perwakilan' ORDER BY id DESC LIMIT 1
       )
       LEFT JOIN (
         SELECT penerima_id,
                COALESCE(SUM(CASE WHEN dikonfirmasi_at IS NOT NULL THEN nominal ELSE 0 END), 0) AS total_komisi,
                COALESCE(SUM(CASE WHEN dikonfirmasi_at IS NULL THEN nominal ELSE 0 END), 0) AS total_komisi_pending,
                COALESCE(SUM(CASE WHEN dikonfirmasi_at IS NOT NULL AND YEAR(created_at) = YEAR(CURDATE()) THEN nominal ELSE 0 END), 0) AS total_komisi_tahun_ini
         FROM komisi_ledger WHERE jenis IN (${JENIS_KOMISI})
         GROUP BY penerima_id
       ) kl ON kl.penerima_id = u.id
    `;
    // Field status pendaftaran (metode/jadwal/TTD formulir/PKS) — SUDAH ada
    // di /api/admin/perwakilan (Pendaftaran) tapi belum ikut ditampilkan di
    // Database, disamain ke sini juga (dikonfirmasi user 2026-09-06: apapun
    // data yang ada di Sahabat Baitullah, hadirin juga versi Perwakilan-nya
    // kalau memang ada). Read-only info — aksi lanjut/tolak tetap di halaman
    // Pendaftaran, sama kayak riwayat ujroh di bawah.
    const selectCols = `
       u.id AS user_id, u.role, u.role_kedua, u.name AS nama, u.kode_unik, u.nik, u.email, u.wa, u.status, u.wilayah,
       u.bank, u.no_rekening, u.nama_pemilik_rekening, u.alamat, u.alamat_ktp, u.alamat_domisili, u.alamat_kirim,
       u.foto_ktp_path, u.pekerjaan, u.tempat_lahir, u.nama_ibu,
       u.tanggal_lahir, u.jenis_kelamin, u.kode_pos, u.no_perjanjian_kerjasama, u.setuju_pks,
       perekrut.name AS perekrut_nama, u.created_at,
       ap.id AS pendaftaran_id, ap.jadwal_kunjungan, ap.metode AS pendaftaran_metode, ap.status AS pendaftaran_status,
       (SELECT fase FROM dokumen_signature WHERE dokumen = 'formulir' AND ref_id = u.id ORDER BY id DESC LIMIT 1) AS formulir_fase,
       COALESCE(kl.total_komisi, 0) AS total_komisi,
       COALESCE(kl.total_komisi_pending, 0) AS total_komisi_pending,
       COALESCE(kl.total_komisi_tahun_ini, 0) AS total_komisi_tahun_ini
    `;

    // Ringkasan SELALU dari SELURUH data (bukan hasil filter/halaman aktif).
    const [ringkasanRows] = await pool.query(
      `SELECT u.status ${baseFrom} WHERE (u.role = 'perwakilan' OR u.role_kedua = 'perwakilan')`
    );
    const ringkasan = {
      total: ringkasanRows.length,
      aktif: ringkasanRows.filter(r => r.status === 'active').length,
      proses: ringkasanRows.filter(r => !['active', 'rejected', 'nonaktif'].includes(r.status)).length,
    };

    const [[{ totalKomisi }]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS totalKomisi FROM komisi_ledger
       WHERE jenis IN (${JENIS_KOMISI}) AND dikonfirmasi_at IS NOT NULL`
    );

    const finalize = (rows) => rows.map(u => ({
      ...u,
      alamat_ktp: u.alamat_ktp || u.alamat,
      alamat_domisili: u.alamat_domisili || u.alamat,
      formulir_ttd_selesai: u.formulir_fase === 'selesai',
      pks_disetujui: !!u.setuju_pks,
    }));

    if (!pageParam) {
      const [rows] = await pool.query(
        `SELECT ${selectCols} ${baseFrom} WHERE (u.role = 'perwakilan' OR u.role_kedua = 'perwakilan') ORDER BY u.kode_unik ASC`
      );
      return Response.json({ perwakilan: finalize(rows), total_komisi_terbayar: totalKomisi, ringkasan });
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params
    );
    const [rows] = await pool.query(
      `SELECT ${selectCols} ${baseFrom} ${whereSql} ORDER BY ${orderCol} ${dir} LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    return Response.json({
      perwakilan: finalize(rows), total, page, per_page: perPage,
      total_komisi_terbayar: totalKomisi, ringkasan,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
