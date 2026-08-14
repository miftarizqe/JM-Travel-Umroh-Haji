import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/pengajuan-dana/[id] — detail + item + daftar reimburse
// belum dibayar yang BELUM ditarik ke pengajuan manapun (buat tombol
// "+ Tarik Reimburse Pending" di form, biar gak dobel klaim across dokumen).
export async function GET(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[pengajuan]] = await pool.query(
      `SELECT p.*, u1.name AS created_by_nama, u2.name AS diajukan_oleh_nama, u3.name AS diputuskan_oleh_nama
       FROM pengajuan_dana p
       LEFT JOIN users u1 ON u1.id = p.created_by
       LEFT JOIN users u2 ON u2.id = p.diajukan_oleh
       LEFT JOIN users u3 ON u3.id = p.diputuskan_oleh
       WHERE p.id = ?`, [id]
    );
    if (!pengajuan) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });

    const [items] = await pool.query(
      `SELECT i.*, k.nama AS kategori_nama
       FROM pengajuan_dana_item i LEFT JOIN cashflow_kategori k ON k.id = i.kategori_id
       WHERE i.pengajuan_id = ? ORDER BY i.urutan ASC, i.id ASC`, [id]
    );

    const [reimbursePending] = await pool.query(
      `SELECT r.* FROM cashflow_reimburse r
       WHERE r.status = 'belum_dibayar'
         AND r.id NOT IN (SELECT reimburse_id FROM pengajuan_dana_item WHERE reimburse_id IS NOT NULL)
       ORDER BY r.tanggal_pengeluaran ASC`
    );

    // Kategori (tipe 'out') buat dropdown item — diambil di sini langsung
    // (bukan manggil /api/admin/cashflow/kategori) biar gak nambah round-trip.
    const [kategoriOut] = await pool.query(
      "SELECT id, nama FROM cashflow_kategori WHERE tipe = 'out' AND aktif = 1 ORDER BY urutan ASC, id ASC"
    );

    // Referensi bulan sebelumnya — biar admin gampang liat apa aja yang
    // diajukan bulan lalu (yang masih relevan tinggal "Pakai Lagi", yang
    // gak kepake dibuang, yang angka gelondongan dirincikin lagi jadi
    // beberapa baris) daripada ngetik dari nol tiap bulan. Diutamain yang
    // statusnya 'disetujui' (paling valid buat acuan), fallback ke status
    // lain kalau bulan lalu gak ada yang disetujui.
    const [y, m] = pengajuan.bulan.split('-').map(Number);
    const dBulanLalu = new Date(y, m - 2, 1); // m-1 = bulan ini (0-based), -1 lagi = bulan lalu
    const bulanLalu = `${dBulanLalu.getFullYear()}-${String(dBulanLalu.getMonth() + 1).padStart(2, '0')}`;
    const [[pengajuanLalu]] = await pool.query(
      `SELECT id, status FROM pengajuan_dana WHERE bulan = ?
       ORDER BY FIELD(status, 'disetujui', 'diajukan', 'draft', 'ditolak'), created_at DESC LIMIT 1`,
      [bulanLalu]
    );
    let referensiBulanLalu = null;
    if (pengajuanLalu) {
      const [itemLalu] = await pool.query(
        `SELECT i.id, i.kategori_id, k.nama AS kategori_nama, i.keterangan, i.nominal
         FROM pengajuan_dana_item i LEFT JOIN cashflow_kategori k ON k.id = i.kategori_id
         WHERE i.pengajuan_id = ? ORDER BY i.urutan ASC, i.id ASC`,
        [pengajuanLalu.id]
      );
      referensiBulanLalu = { bulan: bulanLalu, status: pengajuanLalu.status, items: itemLalu };
    }

    // Referensi REALISASI Cashflow bulan lalu (bukan pengajuan/RAB-nya,
    // tapi UANG YANG BENERAN KELUAR per kategori) — lebih bisa diandalkan
    // buat acuan drafting RAB bulan ini, karena selalu ada begitu Cashflow
    // bulan itu udah diisi (gak kayak referensi pengajuan di atas yang cuma
    // ada kalau bulan lalu emang pernah diajukan). Dikonfirmasi user 2026-07-28.
    const [[periodeLalu]] = await pool.query(
      'SELECT id FROM cashflow_periode WHERE bulan = ?', [bulanLalu]
    );
    let referensiCashflowBulanLalu = null;
    if (periodeLalu) {
      const [perKategori] = await pool.query(
        `SELECT t.kategori_id, k.nama AS kategori_nama, SUM(t.nominal) AS total
         FROM cashflow_transaksi t LEFT JOIN cashflow_kategori k ON k.id = t.kategori_id
         WHERE t.periode_id = ? AND t.tipe = 'out' AND t.kategori_id IS NOT NULL
         GROUP BY t.kategori_id, k.nama ORDER BY total DESC`,
        [periodeLalu.id]
      );
      referensiCashflowBulanLalu = { bulan: bulanLalu, per_kategori: perKategori };
    }

    return Response.json({
      pengajuan, items, reimburse_pending: reimbursePending, kategori_out: kategoriOut,
      referensi_bulan_lalu: referensiBulanLalu,
      referensi_cashflow_bulan_lalu: referensiCashflowBulanLalu,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT { catatan?, items: [{kategori_id, keterangan, nominal, sumber, reimburse_id}] }
// Replace-all item (sama pola kayak biaya_breakdown_item) — CUMA boleh
// selama status masih draft, biar dokumen yang udah diajukan/diputuskan gak
// bisa diutak-atik lagi diam-diam.
export async function PUT(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { catatan, items } = await request.json();

    const [[existing]] = await pool.query('SELECT status FROM pengajuan_dana WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (existing.status !== 'draft') {
      return Response.json({ error: 'Cuma draft yang bisa diedit — pengajuan ini udah diajukan/diputuskan.' }, { status: 400 });
    }

    await pool.query('UPDATE pengajuan_dana SET catatan = ? WHERE id = ?', [catatan || null, id]);

    await pool.query('DELETE FROM pengajuan_dana_item WHERE pengajuan_id = ?', [id]);
    for (const [i, it] of (items || []).entries()) {
      if (!it.keterangan?.trim()) continue;
      await pool.query(
        `INSERT INTO pengajuan_dana_item (pengajuan_id, kategori_id, keterangan, nominal, urutan, sumber, reimburse_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, it.kategori_id || null, it.keterangan.trim(), Number(it.nominal) || 0, i,
         it.sumber === 'reimburse' ? 'reimburse' : 'manual', it.sumber === 'reimburse' ? (it.reimburse_id || null) : null]
      );
    }

    return Response.json({ message: 'Pengajuan disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/pengajuan-dana/[id] — CUMA draft yang boleh dihapus.
export async function DELETE(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[existing]] = await pool.query('SELECT status FROM pengajuan_dana WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
    if (existing.status !== 'draft') {
      return Response.json({ error: 'Cuma draft yang bisa dihapus.' }, { status: 400 });
    }
    await pool.query('DELETE FROM pengajuan_dana WHERE id = ?', [id]);
    return Response.json({ message: 'Draft dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
