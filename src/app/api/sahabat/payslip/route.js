import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';

const KATEGORI_LABEL = {
  komisi_sahabat: 'Ujroh Rekrutan', closing_langsung_sahabat: 'Closing Jamaah',
  referral_closing_reguler_sahabat: 'Referral Closing Reguler',
  tabungan_awal_sahabat: 'Saldo Awal Pendaftaran', head_of_program_registrasi: 'Komisi Head of Program',
};

// GET /api/sahabat/payslip?sahabat_id=xxx — "slip gaji ujroh" per periode
// pengajuan mingguan (2026-08-30, Fase 2) — cuma baris yang UDAH DIKONFIRMASI
// (beneran ditransfer) DAN sudah masuk batch pengajuan yang ke-tag
// (pengajuan_ujroh_id) yang dianggap "1 slip". `pemakaian_saldo_sahabat`
// SENGAJA gak diikutkan — itu bukan ujroh yang diterima, tapi debit
// pemakaian saldo sendiri buat checkout mandiri.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sahabatId = searchParams.get('sahabat_id');
    if (!sahabatId) return Response.json({ error: 'sahabat_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, sahabatId);
    if (auth.error) return auth.error;

    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.nominal, kl.keterangan, kl.created_at, kl.pengajuan_ujroh_id,
              pu.periode_mulai, pu.periode_selesai, pu.status AS pengajuan_status
       FROM komisi_ledger kl
       JOIN pengajuan_ujroh pu ON pu.id = kl.pengajuan_ujroh_id
       WHERE kl.penerima_id = ? AND kl.dikonfirmasi_at IS NOT NULL
         AND kl.jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi')
       ORDER BY pu.periode_mulai DESC, kl.created_at ASC`,
      [sahabatId]
    );

    const periodeMap = new Map();
    for (const r of rows) {
      if (!periodeMap.has(r.pengajuan_ujroh_id)) {
        periodeMap.set(r.pengajuan_ujroh_id, {
          pengajuan_id: r.pengajuan_ujroh_id,
          periode_mulai: r.periode_mulai,
          periode_selesai: r.periode_selesai,
          status: r.pengajuan_status,
          items: [],
          total: 0,
        });
      }
      const grp = periodeMap.get(r.pengajuan_ujroh_id);
      grp.items.push({
        id: r.id, jenis: r.jenis, kategori_label: KATEGORI_LABEL[r.jenis] || r.jenis,
        nominal: r.nominal, keterangan: r.keterangan, created_at: r.created_at,
      });
      grp.total += Number(r.nominal || 0);
    }

    return Response.json({ periode: [...periodeMap.values()] });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
