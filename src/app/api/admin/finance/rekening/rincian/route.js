import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

const KATEGORI_LABEL = {
  komisi_sahabat: 'Ujroh Rekrutan', closing_langsung_sahabat: 'Closing Jamaah',
  referral_closing_reguler_sahabat: 'Referral Closing Reguler', tabungan_awal_sahabat: 'Saldo Awal Pendaftaran',
  head_of_program_registrasi: 'Komisi Head of Program', ujroh_perwakilan: 'Ujroh Perwakilan',
  reseller_perwakilan: 'Reseller Perwakilan',
};

// GET /api/admin/finance/rekening/rincian?ids=41,42 — breakdown 1 baris
// rekening_ledger yang digabung dari beberapa komisi_ledger (lihat
// /api/admin/sahabat/komisi/konfirmasi-batch — sumber_id-nya comma-joined
// ids). Dikonfirmasi user 2026-10-05, biar admin bisa klik buat ngerti
// "350.000 ini dari mana aja" tanpa harus nulis semua rincian di keterangan.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get('ids') || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return Response.json({ error: 'ids wajib diisi' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT id, jenis, nominal, keterangan, penerima_nama, dikonfirmasi_at
       FROM komisi_ledger WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const items = rows.map(r => ({ ...r, jenis_label: KATEGORI_LABEL[r.jenis] || r.jenis }));
    return Response.json({ items });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
