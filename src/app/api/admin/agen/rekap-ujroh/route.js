import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/agen/rekap-ujroh?pengajuan_id=X — rekap ujroh agen buat 1
// pengajuan, mirror /api/admin/perwakilan/rekap-ujroh TAPI tanpa kolom
// bank/no_rekening (dikonfirmasi user 2026-10-17 — pencairan agen gak
// nyimpen detail rekening penerima, cuma status tracker).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const pengajuanId = searchParams.get('pengajuan_id');
    if (!pengajuanId) return Response.json({ error: 'pengajuan_id wajib diisi' }, { status: 400 });

    const [[pengajuan]] = await pool.query(
      `SELECT pua.*, p.name AS prog_name, p.tanggal_berangkat
       FROM pengajuan_ujroh_agen pua
       LEFT JOIN programs p ON p.id = pua.prog_id
       WHERE pua.id = ?`,
      [pengajuanId]
    );
    if (!pengajuan) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });

    const [rows] = await pool.query(
      `SELECT kl.id, kl.nominal, kl.jumlah_jamaah, kl.keterangan, kl.created_at, kl.dikonfirmasi_at,
              u.id AS penerima_id, u.name AS penerima_nama, u.kode_unik
       FROM komisi_ledger kl
       JOIN users u ON u.id = kl.penerima_id
       WHERE kl.pengajuan_ujroh_agen_id = ?
       ORDER BY u.name ASC, kl.created_at ASC`,
      [pengajuanId]
    );

    const kelompokMap = new Map();
    for (const r of rows) {
      if (!kelompokMap.has(r.penerima_id)) {
        kelompokMap.set(r.penerima_id, {
          penerima_id: r.penerima_id, penerima_nama: r.penerima_nama, kode_unik: r.kode_unik,
          items: [], subtotal: 0,
        });
      }
      const grp = kelompokMap.get(r.penerima_id);
      grp.items.push({
        id: r.id, nominal: r.nominal, jumlah_jamaah: r.jumlah_jamaah,
        keterangan: r.keterangan, created_at: r.created_at, dikonfirmasi_at: r.dikonfirmasi_at,
      });
      grp.subtotal += Number(r.nominal || 0);
    }
    const kelompok = [...kelompokMap.values()];
    const grandTotal = kelompok.reduce((s, k) => s + k.subtotal, 0);

    return Response.json({ kelompok, jumlah_baris: rows.length, grand_total: grandTotal, pengajuan });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
