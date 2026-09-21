import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

const JENIS_SALDO = ['komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat', 'tabungan_awal_sahabat', 'head_of_program_registrasi', 'pemakaian_saldo_sahabat', 'setoran_mandiri_sahabat', 'koreksi_saldo_sahabat'];

// GET /api/admin/sahabat/komisi?user_id=xxx — riwayat earning sahabat
// (komisi rekrutan flat + closing langsung) buat 1 anggota, admin biasa
// boleh LIHAT (cuma super_admin yang boleh confirm, lihat PATCH .../[id]).
//
// Filter OPSIONAL buat rekap per-periode (dikonfirmasi user 2026-09-06):
//   tahun  — YEAR(created_at) = ?
//   bulan  — MONTH(created_at) = ? (cuma dipakai kalau `tahun` juga dikirim)
//   jenis  — 1 jenis transaksi spesifik (bukan "per program" — banyak jenis
//            saldo sahabat gak nempel ke booking manapun, mis. komisi
//            rekrutan/tabungan awal, beda dari ujroh perwakilan yang
//            selalu per-closing).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });
    const tahun = searchParams.get('tahun');
    const bulan = searchParams.get('bulan');
    const jenis = searchParams.get('jenis');

    const where = ['penerima_id = ?', `jenis IN (${JENIS_SALDO.map(() => '?').join(',')})`];
    const params = [userId, ...JENIS_SALDO];
    if (tahun) { where.push('YEAR(created_at) = ?'); params.push(tahun); }
    if (tahun && bulan) { where.push('MONTH(created_at) = ?'); params.push(bulan); }
    if (jenis) { where.push('jenis = ?'); params.push(jenis); }

    const [rows] = await pool.query(
      `SELECT id, jenis, nominal, keterangan, dikonfirmasi_at, bukti_tf_admin_path, created_at
       FROM komisi_ledger
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );
    return Response.json({ komisi: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
