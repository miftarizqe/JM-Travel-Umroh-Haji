import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { hitungSaldoAkhirPeriode } from '@/lib/cashflow';

// GET — detail 1 periode: status + saldo awal + saldo akhir per akun + anggaran vs realisasi
export async function GET(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });

    const saldo = await hitungSaldoAkhirPeriode(pool, id);

    // Anggaran vs Realisasi — acuan-nya Pengajuan Dana bulan yang sama
    // (diutamain yang 'disetujui'), dibandingin ke transaksi OUT beneran di
    // periode ini per kategori. Bukan hitungan ke-cashflow_periode LAIN,
    // cuma ke bulan yang PERSIS sama (bulan char(7) di dua2nya format sama,
    // YYYY-MM) — kalau bulan itu gak punya Pengajuan Dana sama sekali,
    // anggaran = null (bukan 0, biar kebedain dari "diajukan tapi Rp 0").
    const [[pengajuan]] = await pool.query(
      `SELECT id, status FROM pengajuan_dana WHERE bulan = ?
       ORDER BY FIELD(status, 'disetujui', 'diajukan', 'draft', 'ditolak'), created_at DESC LIMIT 1`,
      [periode.bulan]
    );
    let anggaran = null;
    if (pengajuan) {
      const [budgetRows] = await pool.query(
        `SELECT i.kategori_id, k.nama AS kategori_nama, SUM(i.nominal) AS budget
         FROM pengajuan_dana_item i LEFT JOIN cashflow_kategori k ON k.id = i.kategori_id
         WHERE i.pengajuan_id = ? GROUP BY i.kategori_id, k.nama`,
        [pengajuan.id]
      );
      const [aktualRows] = await pool.query(
        `SELECT t.kategori_id, k.nama AS kategori_nama, SUM(t.nominal) AS aktual
         FROM cashflow_transaksi t LEFT JOIN cashflow_kategori k ON k.id = t.kategori_id
         WHERE t.periode_id = ? AND t.tipe = 'out' AND t.kategori_id IS NOT NULL
         GROUP BY t.kategori_id, k.nama`,
        [id]
      );
      const perKategori = new Map();
      for (const b of budgetRows) {
        perKategori.set(b.kategori_id, { kategori_id: b.kategori_id, kategori_nama: b.kategori_nama || '(tanpa kategori)', budget: Number(b.budget), aktual: 0 });
      }
      for (const a of aktualRows) {
        const cur = perKategori.get(a.kategori_id) || { kategori_id: a.kategori_id, kategori_nama: a.kategori_nama || '(tanpa kategori)', budget: 0, aktual: 0 };
        cur.aktual = Number(a.aktual);
        perKategori.set(a.kategori_id, cur);
      }
      anggaran = {
        pengajuan_id: pengajuan.id, pengajuan_status: pengajuan.status,
        per_kategori: [...perKategori.values()].sort((x, y) => (y.aktual - y.budget) - (x.aktual - x.budget)),
      };
    }

    return Response.json({ periode, saldo, anggaran });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE — hapus periode yang SALAH BIKIN (dikonfirmasi user 2026-10-01).
// Dibatasi ketat biar gak ngerusak rantai saldo antar bulan:
//  1. Harus masih 'draft' — yang sudah 'submitted' itu pembukuan terkunci,
//     "Buka Kembali" dulu (POST .../submit DELETE) baru bisa dihapus.
//  2. Gak boleh ada transaksi sama sekali — hapus transaksinya dulu manual,
//     biar jelas apa yang hilang (bukan auto-cascade diam-diam).
//  3. Harus periode PALING BARU (gak ada periode lain dengan `bulan` lebih
//     besar) — periode setelahnya nyimpen SNAPSHOT saldo_awal dari saldo
//     akhir periode ini; kalau dihapus, snapshot itu jadi basi & gak ada
//     yang nyegerin ulang.
export async function DELETE(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status !== 'draft') {
      return Response.json({ error: 'Periode yang sudah disubmit gak bisa dihapus — "Buka Kembali" dulu.' }, { status: 400 });
    }
    const [[{ jumlah }]] = await pool.query('SELECT COUNT(*) AS jumlah FROM cashflow_transaksi WHERE periode_id = ?', [id]);
    if (jumlah > 0) {
      return Response.json({ error: 'Periode ini sudah punya transaksi — hapus semua transaksinya dulu sebelum hapus periode.' }, { status: 400 });
    }
    const [[lebihBaru]] = await pool.query('SELECT id FROM cashflow_periode WHERE bulan > ? LIMIT 1', [periode.bulan]);
    if (lebihBaru) {
      return Response.json({ error: 'Cuma periode paling baru yang bisa dihapus — ada periode setelah ini yang rantai saldonya nyambung ke sini.' }, { status: 400 });
    }

    await pool.query('DELETE FROM cashflow_saldo_awal WHERE periode_id = ?', [id]);
    await pool.query('DELETE FROM cashflow_periode WHERE id = ?', [id]);
    return Response.json({ message: 'Periode dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
