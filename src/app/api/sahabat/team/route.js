import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { persenKesiapan } from '@/lib/kesiapanTabungan';

const JENIS_SALDO = [
  'komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat',
  'tabungan_awal_sahabat', 'head_of_program_registrasi', 'pemakaian_saldo_sahabat', 'setoran_mandiri_sahabat', 'koreksi_saldo_sahabat',
];

// GET /api/sahabat/team?sahabat_id=xxx
// Seluruh jaringan sahabat DIRATAKAN (bukan cuma rekrutan langsung kayak
// dashboard utama) — BFS jalan ke BAWAH lewat users.perekrut_id, kebalikan
// arah dari apakahDalamJaringan() di src/lib/jaringan.js (yang jalan ke atas).
// Cap 20 level, cukup buat jaringan realistis & mencegah loop tak terduga.
//
// Akses: pemilik sahabat_id itu sendiri, admin/super_admin, ATAU Head of
// Program (dikonfirmasi user 2026-09-07 — HOP boleh liat downline SIAPAPUN,
// bukan cuma jaringan dia sendiri, itu wewenang barunya).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sahabatId = searchParams.get('sahabat_id');
    if (!sahabatId) return Response.json({ error: 'sahabat_id wajib diisi' }, { status: 400 });

    const auth = wajibLogin(request);
    if (auth.error) return auth.error;
    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    const isPemilik = String(auth.user.id) === String(sahabatId);
    if (!isAdmin && !isPemilik) {
      const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
      const isHop = pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(auth.user.id);
      if (!isHop) {
        return Response.json({ error: 'Akses ditolak. Anda hanya bisa mengakses data milik sendiri.' }, { status: 403 });
      }
    }

    const hasil = [];
    let currentLevelIds = [sahabatId];
    let level = 1;
    while (currentLevelIds.length > 0 && level <= 20) {
      const placeholders = currentLevelIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT u.id, u.name, u.kode_unik, u.status, u.created_at, u.perekrut_id,
                kp.status AS funnel_status, kp.target_estimasi_harga, kp.target_minat,
                perekrut.name AS perekrut_nama
         FROM users u
         LEFT JOIN sahabat_pendaftaran kp ON kp.user_id = u.id
         LEFT JOIN users perekrut ON perekrut.id = u.perekrut_id
         WHERE u.perekrut_id IN (${placeholders})
         ORDER BY u.created_at DESC`,
        currentLevelIds
      );
      if (rows.length === 0) break;
      for (const r of rows) hasil.push({ ...r, level });
      currentLevelIds = rows.map(r => r.id);
      level++;
    }

    // Persen kesiapan tabungan per anggota (dikonfirmasi user 2026-09-21) —
    // TANPA pernah balikin nominal saldo-nya ke client, cuma persentase.
    // Query saldo di-batch 1x buat SELURUH jaringan, bukan N+1 per anggota.
    if (hasil.length > 0) {
      const ids = hasil.map(h => h.id);
      const [saldoRows] = await pool.query(
        `SELECT penerima_id, SUM(nominal) AS saldo FROM komisi_ledger
         WHERE penerima_id IN (${ids.map(() => '?').join(',')}) AND dikonfirmasi_at IS NOT NULL
           AND jenis IN (${JENIS_SALDO.map(() => '?').join(',')})
         GROUP BY penerima_id`,
        [...ids, ...JENIS_SALDO]
      );
      const saldoMap = Object.fromEntries(saldoRows.map(r => [r.penerima_id, Number(r.saldo || 0)]));
      for (const h of hasil) {
        h.persen_kesiapan = persenKesiapan(saldoMap[h.id] || 0, h.target_estimasi_harga);
        delete h.target_estimasi_harga;
      }
    }

    return Response.json({ team: hasil });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
