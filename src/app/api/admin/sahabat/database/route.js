import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';
import { persenKesiapan } from '@/lib/kesiapanTabungan';

// HoP gak berhak tau NIK & SEMUA rekening (bank biasa, BSI biasa, tabungan
// umroh) — PRIVASI, cuma admin/super_admin (dikonfirmasi user 2026-10-05,
// awalnya cuma rekening tabungan umroh, diperluas ke NIK & bank biasa juga).
// Plus voucher Rp1jt & bukti TF Rp1jt (dikonfirmasi sebelumnya di sesi yang
// sama). kode_unik/nama/dll TETAP ada, cuma field ini di-null-in biar gak
// bisa diintip lewat network tab (FE udah nyembunyiin tampilannya di
// database/page.jsx, ini nutup jalur baca mentahnya).
// saldo_tabungan_umroh/saldo_pending SENGAJA TETAP dikirim — FE butuh angka
// mentahnya buat hitung % progress tabungan yang HoP emang boleh liat, cuma
// rupiahnya aja yang disembunyikan di tampilan.
// metode_ttd_sahabat/rencana_kunjungan_kantor_at JUGA SENGAJA TETAP dikirim
// (dibutuhkan cluster "Janji Temu Datang ke Kantor" di Ringkasan Admin HoP,
// lihat admin/page.jsx) — baris "Metode TTD Fisik" di kartu detail Database
// Anggota disembunyikan khusus di FE (bukan di sini), biar gak dobel-fungsi.
function redaksiUntukHop(rows) {
  return rows.map(r => ({
    ...r,
    nik: null, bank: null, no_rekening: null, no_rekening_bsi_biasa: null,
    voucher_id: null, voucher_kode: null, voucher_used: null, voucher_aktif: null, voucher_disetujui_at: null,
    bukti_tf_path: null,
    no_rekening_tabungan_umroh: null, nama_pemilik_rekening_umroh: null,
  }));
}

// Jenis komisi yang masuk hitungan "saldo tabungan umroh" — 1 sumber
// dipakai di 2 tempat query di bawah (saldo per-baris & ringkasan), jangan
// sampai kedua tempat itu diam-diam beda daftar jenis.
const JENIS_SALDO = "'komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat','koreksi_saldo_sahabat'";

const SORT_KOLOM = {
  kode: 'u.kode_unik',
  nama: 'kp.nama',
  created_at: 'kp.created_at',
  saldo: 'saldo_tabungan_umroh',
  status: 'u.status',
};

// GET /api/admin/sahabat/database — 1 baris per Jamaah Sahabat Baitullah,
// SUPERSET dari yang dulunya kepencar di /api/admin/sahabat (funnel
// pendaftaran) — digabung ke sini 2026-08-29 biar Database Jamaah jadi 1
// halaman profil lengkap (saldo+target+funnel+dokumen).
//
// Query params OPSIONAL (dikonfirmasi user 2026-09-06, disiapin dari awal
// buat skala besar walau belum mendesak sekarang):
//   page, per_page  — kalau `page` gak dikirim, balikin SEMUA baris apa
//                      adanya (dipertahankan buat /api/admin/sahabat yang
//                      nyisir SELURUH data buat cluster reminder "Siap
//                      Berangkat"/"Di Bawah Progress" — jangan dipaginasi).
//   q               — cari nama/kode_unik/wa/nik (substring, case-insensitive).
//   status          — filter status akun (active/pending/rejected/nonaktif,
//                      'semua' = semua) — dikonfirmasi user 2026-09-07,
//                      SEBELUMNYA filter ini pakai status funnel pendaftaran
//                      (kp.status: pending/menunggu_verifikasi_tf/
//                      menunggu_bsi/menunggu_sk_cif/active/ditolak), beda
//                      sumber dari Database Perwakilan (yang dari awal udah
//                      pakai u.status) — sekarang disamain biar tab-nya
//                      konsisten (Aktif/Pending/Ditolak/Nonaktif), sub-tahap
//                      funnel tetap kelihatan di halaman Pendaftaran (/admin/sahabat).
//   sort, dir       — nama|created_at|saldo|status, asc|desc (default saldo desc).
//
// Saldo diagregasi lewat LEFT JOIN + subquery GROUP BY (bukan correlated
// subquery 3x per baris kayak sebelumnya) — biar query TETAP ringan walau
// datanya sudah ribuan baris, dihitung SEKALI per keseluruhan tabel
// komisi_ledger, bukan sekali per baris jamaah.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const perPage = Math.min(Math.max(Number(searchParams.get('per_page')) || 25, 1), 200);
    const page = Math.max(Number(pageParam) || 1, 1);
    const q = (searchParams.get('q') || '').trim();
    const userId = searchParams.get('user_id') || '';
    const status = searchParams.get('status') || 'semua';
    // Filter tambahan (dikonfirmasi user 2026-09-07) — independen dari
    // status akun, buat kartu ringkasan "≥80% Siap Berangkat" biar bisa
    // diklik juga kayak Total/Aktif/Dalam Proses. Beda dari status, ini
    // dihitung dari saldo vs target (persenKesiapan), bukan enum kolom.
    const siapBerangkat = searchParams.get('siap_berangkat') === '1';
    // Default sort: kode_unik ASC (dikonfirmasi user 2026-09-06 — apapun
    // halaman database-nya, default-nya urut kode, bukan saldo/tanggal lagi).
    const orderCol = SORT_KOLOM[searchParams.get('sort')] || SORT_KOLOM.kode;
    const dir = searchParams.get('dir') ? (searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC') : 'ASC';

    const where = [];
    const params = [];
    if (userId) { where.push('kp.user_id = ?'); params.push(userId); }
    if (status !== 'semua') { where.push('u.status = ?'); params.push(status); }
    if (siapBerangkat) { where.push('kp.target_estimasi_harga > 0 AND COALESCE(sl.saldo_tabungan_umroh, 0) >= kp.target_estimasi_harga * 0.8'); }
    if (q) {
      where.push('(kp.nama LIKE ? OR u.kode_unik LIKE ? OR kp.wa LIKE ? OR kp.nik LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const baseFrom = `
       FROM sahabat_pendaftaran kp
       JOIN users u ON u.id = kp.user_id
       LEFT JOIN users perekrut ON perekrut.id = kp.perekrut_id
       LEFT JOIN programs tp ON tp.id = kp.program_id
       LEFT JOIN (
         SELECT penerima_id,
                COALESCE(SUM(CASE WHEN dikonfirmasi_at IS NOT NULL THEN nominal ELSE 0 END), 0) AS saldo_tabungan_umroh,
                MAX(CASE WHEN dikonfirmasi_at IS NOT NULL THEN dikonfirmasi_at END) AS saldo_updated_at,
                COALESCE(SUM(CASE WHEN dikonfirmasi_at IS NULL THEN nominal ELSE 0 END), 0) AS saldo_pending
         FROM komisi_ledger WHERE jenis IN (${JENIS_SALDO})
         GROUP BY penerima_id
       ) sl ON sl.penerima_id = kp.user_id
       LEFT JOIN vouchers v ON v.id = (
         SELECT id FROM vouchers WHERE for_user = kp.user_id AND akses_role = 'akun'
         ORDER BY created_at DESC LIMIT 1
       )
    `;
    const selectCols = `
       kp.*, u.kode_unik, u.role, u.role_kedua, u.status AS user_status, u.email AS user_email, u.wa AS user_wa,
       u.no_rekening_bsi_biasa, u.no_rekening_tabungan_umroh, u.nama_pemilik_rekening_umroh, u.bantuan_bsi_manual_disetujui_at,
       u.setuju_sk_cif_pemblokiran_at, u.setuju_pks,
       u.dokumen_sk_cif_fisik_path, u.dokumen_cif_fisik_diterima_at,
       u.dokumen_pemblokiran_fisik_diterima_at, u.dokumen_spk_ak_fisik_diterima_at,
       u.dokumen_surat_pemblokiran_fisik_path,
       u.dokumen_spk_ak_fisik_path, u.metode_ttd_sahabat, u.rencana_kunjungan_kantor_at, u.janji_temu_kantor_selesai_at, u.dokumen_spk_ak_dikirim_balik_at,
       perekrut.name AS perekrut_nama, perekrut.role AS perekrut_role,
       tp.tanggal_berangkat AS target_tanggal_berangkat, tp.active AS target_program_aktif,
       v.id AS voucher_id, v.kode AS voucher_kode, v.used AS voucher_used, v.aktif AS voucher_aktif, v.disetujui_at AS voucher_disetujui_at,
       COALESCE(sl.saldo_tabungan_umroh, 0) AS saldo_tabungan_umroh,
       sl.saldo_updated_at,
       COALESCE(sl.saldo_pending, 0) AS saldo_pending
    `;

    // Ringkasan (total/aktif/proses/siap_berangkat) SELALU dihitung dari
    // SELURUH data (bukan hasil filter/halaman aktif) — sama seperti
    // perilaku lama, cuma sekarang lewat query agregat ringan, bukan
    // dari array penuh yang di-fetch ke client.
    const [ringkasanRows] = await pool.query(
      `SELECT u.status AS user_status, u.kode_unik, kp.target_estimasi_harga, COALESCE(sl.saldo_tabungan_umroh, 0) AS saldo_tabungan_umroh
       ${baseFrom}`
    );
    const ringkasan = { total: 0, aktif: 0, proses: 0, siap_berangkat: 0 };
    for (const r of ringkasanRows) {
      // "Total" cuma yang beneran punya kode_unik (dikonfirmasi user
      // 2026-10-03) -- kode_unik baru keluar begitu akun 'active', jadi
      // yang ditolak/masih proses (belum punya nomor) gak ikut dihitung.
      if (r.kode_unik) ringkasan.total++;
      if (r.user_status === 'active') ringkasan.aktif++;
      if (r.user_status === 'pending') ringkasan.proses++;
      const p = persenKesiapan(r.saldo_tabungan_umroh, r.target_estimasi_harga);
      if (p !== null && p >= 80) ringkasan.siap_berangkat++;
    }

    // Tanpa `page` -> balikin semua baris (konsumen: /api/admin/sahabat
    // buat cluster reminder yang nyisir seluruh data, bukan 1 halaman).
    // Redaksi berlaku buat SIAPAPUN yang bukan admin/super_admin asli
    // (dikonfirmasi user 2026-10-05) -- bukan cuma role 'hop' spesifik,
    // future-proof kalau nanti ada role non-admin lain yang dikasih akses
    // GET ke endpoint ini (mirror pola di komisi-rekap/route.js).
    const isHop = !['admin', 'super_admin'].includes(auth.user.role);

    if (!pageParam) {
      const [rows] = await pool.query(
        `SELECT ${selectCols} ${baseFrom} ORDER BY u.kode_unik ASC`
      );
      return Response.json({ jamaah: isHop ? redaksiUntukHop(rows) : rows, ringkasan });
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params
    );
    const [rows] = await pool.query(
      `SELECT ${selectCols} ${baseFrom} ${whereSql} ORDER BY ${orderCol} ${dir} LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    return Response.json({ jamaah: isHop ? redaksiUntukHop(rows) : rows, total, page, per_page: perPage, ringkasan });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/sahabat/database — admin update target minat/estimasi
// harga/jangka waktu 1 jamaah (BUKAN "angka fatal" kayak nominal komisi —
// bebas diedit admin biasa, ini cuma metadata buat hitung % kesiapan,
// bukan duit beneran). `target_bulan` baru 2026-08-30 (jumlah bulan, bukan
// tanggal spesifik) — dipakai hitung progres proporsional di
// src/lib/kesiapanTabungan.js. `target_set_at` di-reset ke NOW() tiap kali
// target_bulan ATAU target_estimasi_harga berubah, jadi baseline hitung
// "udah jalan berapa bulan" — BUKAN dari tanggal daftar.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { user_id, target_minat, target_estimasi_harga, target_bulan } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const [[sebelum]] = await pool.query(
      'SELECT target_estimasi_harga, target_bulan FROM sahabat_pendaftaran WHERE user_id = ?', [user_id]
    );
    if (!sebelum) return Response.json({ error: 'Data pendaftaran tidak ditemukan' }, { status: 404 });

    const hargaBaru = target_estimasi_harga === '' || target_estimasi_harga == null ? null : Number(target_estimasi_harga);
    const bulanBaru = target_bulan === '' || target_bulan == null ? null : Number(target_bulan);
    const targetBerubah = hargaBaru !== (sebelum.target_estimasi_harga ?? null) || bulanBaru !== (sebelum.target_bulan ?? null);

    await pool.query(
      `UPDATE sahabat_pendaftaran SET target_minat = ?, target_estimasi_harga = ?, target_bulan = ?
       ${targetBerubah ? ', target_set_at = NOW()' : ''} WHERE user_id = ?`,
      [target_minat || null, hargaBaru, bulanBaru, user_id]
    );
    return Response.json({ message: 'Target disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
