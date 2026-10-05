import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';
import { groupJamaahAktif } from '@/lib/jamaahHarga';

// Jenis yang BENERAN ujroh (komisi) — BUKAN duit pribadi jamaah (beda dari
// JENIS_SALDO di /api/admin/sahabat/database yang nyampur semuanya jadi
// 1 "saldo tabungan"). Dipakai khusus endpoint ini.
const JENIS_UJROH = ['komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat', 'head_of_program_registrasi'];

// GET /api/admin/sahabat/[user_id]/ujroh-ringkasan — khusus buat HoP
// (dikonfirmasi user 2026-10-05): "HoP gak berhak liat total saldo tabungan
// jamaah, tapi boleh liat total ujroh yang didapat." Beda dari
// saldo_tabungan_umroh/saldo_pending di list Database Anggota (itu nyampur
// ujroh + duit pribadi jamaah yang nabung sendiri/tabungan_awal) -- endpoint
// ini CUMA ujroh:
//   - sudah_cair  = ujroh yang udah dikonfirmasi admin (beneran di-TF)
//   - pending     = ujroh yang udah "nggantung" (tercatat) tapi belum
//                    dikonfirmasi, nunggu periode pencairan berikutnya
//   - forecast    = ujroh yang BAHKAN belum nggantung -- proyeksi dari (a)
//                    downline Gen1-5 yang masih di funnel (belum aktif) dan
//                    (b) booking jamaah yang di-closing-in akun ini tapi
//                    belum 'selesai' (tanggal berangkat belum lewat).
//                    Logic SAMA PERSIS /api/sahabat/dashboard, dipangkas ke
//                    angka total doang (gak perlu rincian per-item di sini).
export async function GET(request, { params }) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const { user_id } = await params;
    const [[akun]] = await pool.query('SELECT id FROM users WHERE id = ? AND role = ?', [user_id, 'sahabat_baitullah']);
    if (!akun) return Response.json({ error: 'Akun sahabat tidak ditemukan' }, { status: 404 });

    const [ujroh] = await pool.query(
      `SELECT nominal, dikonfirmasi_at FROM komisi_ledger
       WHERE penerima_id = ? AND jenis IN (${JENIS_UJROH.map(() => '?').join(',')})`,
      [user_id, ...JENIS_UJROH]
    );
    const sudahCair = ujroh.filter(r => r.dikonfirmasi_at).reduce((s, r) => s + Number(r.nominal || 0), 0);
    const pending = ujroh.filter(r => !r.dikonfirmasi_at).reduce((s, r) => s + Number(r.nominal || 0), 0);

    const [[pengaturan]] = await pool.query(
      `SELECT sahabat_gen1_nominal, sahabat_gen2_nominal, sahabat_gen3_nominal, sahabat_gen4_nominal, sahabat_gen5_nominal,
              sahabat_closing_langsung_hop_nominal, head_of_program_user_id
       FROM pengaturan WHERE id = 1`
    );
    const genNominal = [1, 2, 3, 4, 5].map(g => Number(pengaturan?.[`sahabat_gen${g}_nominal`] || 0));
    const isHopAkun = !!(pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(user_id));

    // Forecast (a) — downline Gen1-5 yang masih di funnel (belum aktif).
    let forecastDownline = 0;
    let currentLevelIds = [user_id];
    let level = 1;
    while (currentLevelIds.length > 0 && level <= 5) {
      const placeholders = currentLevelIds.map(() => '?').join(',');
      const [rows] = await pool.query(`SELECT id, status FROM users WHERE perekrut_id IN (${placeholders})`, currentLevelIds);
      if (rows.length === 0) break;
      for (const r of rows) if (r.status !== 'active') forecastDownline += genNominal[level - 1];
      currentLevelIds = rows.map(r => r.id);
      level++;
    }

    // Forecast (b) — booking yang di-closing-in akun ini, masih aktif (belum 'selesai').
    const [bookingLangsungAktif] = await pool.query(
      `SELECT b.id, b.total_harga, b.jamaah_data, b.paket, b.kamar,
              p.sahabat_closing_nominal_closer,
              p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
              p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
              p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
       FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.referral_sahabat_id = ? AND b.status IN ('active','menunggu_batal')`,
      [user_id]
    );
    let forecastClosing = bookingLangsungAktif.reduce((s, b) => {
      if (!isHopAkun) return s + Number(b.sahabat_closing_nominal_closer ?? 1_000_000);
      let hppTotal = 0;
      for (const g of groupJamaahAktif(b)) {
        const paketG = String(g.paket || 'deluxe').toLowerCase();
        hppTotal += Number(b[`hpp_${paketG}_${g.kamarKey}`] || 0) * g.count;
      }
      return s + ((b.total_harga || 0) - hppTotal);
    }, 0);

    const [bookingReferralAktif] = await pool.query(
      `SELECT b.id FROM bookings b LEFT JOIN users u ON u.id = b.user_id LEFT JOIN programs p ON p.id = b.prog_id
       WHERE u.perekrut_sahabat_jamaah_id = ? AND u.role = 'jamaah'
         AND b.status IN ('active','menunggu_batal') AND (p.publish_type IS NULL OR p.publish_type != 'sahabat_baitullah')`,
      [user_id]
    );
    forecastClosing += bookingReferralAktif.length * 1_000_000;

    if (isHopAkun) {
      const [bookingOrangLainAktif] = await pool.query(
        `SELECT b.id, p.sahabat_closing_langsung_hop_nominal
         FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
         WHERE b.referral_sahabat_id IS NOT NULL AND b.referral_sahabat_id != ? AND b.status IN ('active','menunggu_batal')`,
        [user_id]
      );
      forecastClosing += bookingOrangLainAktif.reduce((s, b) => s + Number(b.sahabat_closing_langsung_hop_nominal ?? pengaturan?.sahabat_closing_langsung_hop_nominal ?? 0), 0);
    }

    return Response.json({
      sudah_cair: sudahCair,
      pending,
      forecast: forecastDownline + forecastClosing,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
