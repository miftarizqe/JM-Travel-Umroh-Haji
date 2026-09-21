import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { persenKesiapan } from '@/lib/kesiapanTabungan';

const JENIS_SALDO = [
  'komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat',
  'tabungan_awal_sahabat', 'head_of_program_registrasi', 'pemakaian_saldo_sahabat', 'setoran_mandiri_sahabat', 'koreksi_saldo_sahabat',
];

// GET /api/sahabat/riwayat-closing?sahabat_id=xxx
// Versi jaringan-sendiri dari /admin/sahabat/riwayat-closing (dikonfirmasi
// user 2026-09-21) — cuma nyakup dia + SELURUH downline-nya (bukan
// company-wide kayak punya admin), dan SENGAJA gak nampilin nominal
// tabungan/ujroh siapa pun (termasuk dirinya sendiri di sini) — cuma jumlah
// closing & persentase kesiapan ke goal tabungan masing-masing orang. Detail
// nominal tetap ada di /dashboard/sahabat (punya sendiri) & /dashboard/sahabat/team.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sahabatId = searchParams.get('sahabat_id');
    if (!sahabatId) return Response.json({ error: 'sahabat_id wajib diisi' }, { status: 400 });
    // Filter periode opsional (dikonfirmasi user 2026-09-21) — 'dari'
    // inklusif dari awal hari, 'sampai' inklusif sampai akhir hari.
    const dari = searchParams.get('dari') || null;
    const sampai = searchParams.get('sampai') || null;

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

    // BFS ke bawah lewat perekrut_id — sama persis pola /api/sahabat/team,
    // ngumpulin SELURUH id downline (cap 20 level buat jaga-jaga).
    const downlineIds = [];
    let currentLevelIds = [sahabatId];
    let level = 1;
    while (currentLevelIds.length > 0 && level <= 20) {
      const placeholders = currentLevelIds.map(() => '?').join(',');
      const [rows] = await pool.query(`SELECT id FROM users WHERE perekrut_id IN (${placeholders})`, currentLevelIds);
      if (rows.length === 0) break;
      for (const r of rows) downlineIds.push(r.id);
      currentLevelIds = rows.map(r => r.id);
      level++;
    }
    const jaringanIds = [sahabatId, ...downlineIds];
    const ph = jaringanIds.map(() => '?').join(',');

    // Closing "buka rekening" — SEMUA downline (jaringanIds tanpa diri
    // sendiri, dia gak bisa jadi rekrutannya sendiri) yang beneran udah
    // aktif, plus target tabungan masing2 buat dihitung persen kesiapan.
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.kode_unik, u.status, u.created_at,
              kp.status AS funnel_status, kp.target_estimasi_harga, kp.target_minat,
              perekrut.name AS perekrut_nama, perekrut.kode_unik AS perekrut_kode_unik,
              (SELECT created_at FROM pendaftaran_status_log
                 WHERE user_id = u.id AND tipe = 'sahabat_baitullah' AND status_baru = 'active'
                 ORDER BY id DESC LIMIT 1) AS tanggal_aktif
       FROM users u
       LEFT JOIN sahabat_pendaftaran kp ON kp.user_id = u.id
       LEFT JOIN users perekrut ON perekrut.id = u.perekrut_id
       WHERE u.id IN (${downlineIds.length ? downlineIds.map(() => '?').join(',') : 'NULL'})
       ORDER BY tanggal_aktif DESC`,
      downlineIds
    );

    // Saldo tabungan umroh per orang (buat persen kesiapan doang, gak pernah
    // dikirim balik nominalnya ke client — cuma dipakai hitung di server).
    let saldoMap = {};
    if (downlineIds.length > 0) {
      const [saldoRows] = await pool.query(
        `SELECT penerima_id, SUM(nominal) AS saldo FROM komisi_ledger
         WHERE penerima_id IN (${downlineIds.map(() => '?').join(',')}) AND dikonfirmasi_at IS NOT NULL
           AND jenis IN (${JENIS_SALDO.map(() => '?').join(',')})
         GROUP BY penerima_id`,
        [...downlineIds, ...JENIS_SALDO]
      );
      saldoMap = Object.fromEntries(saldoRows.map(r => [r.penerima_id, Number(r.saldo || 0)]));
    }

    let closingReferral = rows.map(r => ({
      id: r.id, name: r.name, kode_unik: r.kode_unik, status: r.status,
      funnel_status: r.funnel_status, tanggal_aktif: r.tanggal_aktif,
      perekrut_nama: r.perekrut_nama, perekrut_kode_unik: r.perekrut_kode_unik,
      target_minat: r.target_minat,
      persen_kesiapan: persenKesiapan(saldoMap[r.id] || 0, r.target_estimasi_harga),
    }));

    // Closing Langsung (booking) — dia sendiri ATAU siapa pun di jaringannya
    // yang jadi referral_sahabat_id-nya, TANPA nominal ujroh (dikonfirmasi
    // user 2026-09-21, halaman ini murni performa/jumlah, bukan rekap duit).
    const filtroTanggal = dari && sampai ? 'AND b.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)' : '';
    const [closingLangsungRows] = await pool.query(
      `SELECT b.id, b.prog_name, b.paket, b.jumlah_jamaah, b.status, b.dp_status, b.pelunasan_status, b.created_at,
              k.name AS sahabat_nama, k.kode_unik AS sahabat_kode_unik
       FROM bookings b
       JOIN users k ON k.id = b.referral_sahabat_id
       WHERE b.referral_sahabat_id IN (${ph}) ${filtroTanggal}
       ORDER BY b.created_at DESC`,
      dari && sampai ? [...jaringanIds, dari, sampai] : jaringanIds
    );

    // Filter periode buat closing referral (yang beneran udah closing/aktif
    // aja yang dicek terhadap tanggal_aktif — di-filter di JS, bukan SQL,
    // soalnya tanggal_aktif hasil subquery correlated, dataset-nya juga
    // sekecil jaringan 1 orang jadi gak masalah performa).
    if (dari && sampai) {
      const dariMs = new Date(dari).getTime();
      const sampaiMs = new Date(sampai).getTime() + 24 * 60 * 60 * 1000;
      closingReferral = closingReferral.filter(c => {
        if (!c.tanggal_aktif) return false;
        const t = new Date(c.tanggal_aktif).getTime();
        return t >= dariMs && t < sampaiMs;
      });
    }

    return Response.json({
      ringkasan: {
        jumlah_jaringan: downlineIds.length,
        total_closing_referral: closingReferral.filter(c => c.status === 'active').length,
        total_closing_langsung: closingLangsungRows.length,
      },
      closing_referral: closingReferral,
      closing_langsung: closingLangsungRows,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
