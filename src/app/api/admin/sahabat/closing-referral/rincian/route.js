import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/closing-referral/rincian?ref_id=<user_id baru>
// Rincian SEMUA penerima dari 1 pendaftaran Sahabat Baitullah (dikonfirmasi
// user 2026-09-06) — dulu Riwayat Closing cuma nampilin 1 angka total
// ("Total Ujroh 5 Gen Dibagikan"), gampang disalahartikan seolah 1 orang
// closing dapet segitu, padahal itu jumlah dari BEBERAPA penerima beda
// (Gen1-5 + Head of Program + tabungan awal jemaah sendiri + sisa
// operasional). Baris ini yang bikin breakdown-nya kelihatan jelas.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const ref_id = searchParams.get('ref_id');
  if (!ref_id) return Response.json({ error: 'ref_id wajib' }, { status: 400 });

  try {
    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.nominal, kl.penerima_nama, u.kode_unik AS penerima_kode_unik, kl.keterangan
       FROM komisi_ledger kl
       LEFT JOIN users u ON u.id = kl.penerima_id
       WHERE kl.ref_id = ?
         AND kl.jenis IN ('komisi_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','operasional_sahabat')
       ORDER BY FIELD(kl.jenis, 'komisi_sahabat','head_of_program_registrasi','tabungan_awal_sahabat','operasional_sahabat'), kl.id`,
      [ref_id]
    );
    return Response.json({ rincian: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
