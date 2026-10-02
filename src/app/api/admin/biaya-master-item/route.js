import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/biaya-master-item?semua=1 — default cuma yang aktif
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const semua = searchParams.get('semua') === '1';
    const [rows] = await pool.query(
      `SELECT * FROM biaya_master_item ${semua ? '' : 'WHERE aktif = 1'} ORDER BY kelompok ASC, urutan ASC, id ASC`
    );
    return Response.json({ item: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah item master baru
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { kelompok, nama, keterangan, harga_default, mata_uang, basis_default, trigger_kunci, modul_negara_id, urutan, frekuensi, baseline_umroh, baseline_wisata } = await request.json();
    if (!kelompok?.trim() || !nama?.trim()) return Response.json({ error: 'Kelompok & nama wajib diisi' }, { status: 400 });
    const [result] = await pool.query(
      'INSERT INTO biaya_master_item (kelompok, nama, keterangan, harga_default, mata_uang, basis_default, trigger_kunci, modul_negara_id, urutan, frekuensi, baseline_umroh, baseline_wisata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [kelompok.trim(), nama.trim(), keterangan?.trim() || null, Number(harga_default) || 0, mata_uang || 'IDR', basis_default || 'jamaah', trigger_kunci || null, modul_negara_id || null, Number(urutan) || 0, frekuensi || null, baseline_umroh ? 1 : 0, baseline_wisata ? 1 : 0]
    );
    return Response.json({ message: 'Item master ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update item master
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, kelompok, nama, keterangan, harga_default, mata_uang, basis_default, trigger_kunci, modul_negara_id, urutan, aktif, frekuensi, baseline_umroh, baseline_wisata } = await request.json();
    if (!id || !kelompok?.trim() || !nama?.trim()) return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    const [result] = await pool.query(
      'UPDATE biaya_master_item SET kelompok = ?, nama = ?, keterangan = ?, harga_default = ?, mata_uang = ?, basis_default = ?, trigger_kunci = ?, modul_negara_id = ?, urutan = ?, aktif = ?, frekuensi = ?, baseline_umroh = ?, baseline_wisata = ? WHERE id = ?',
      [kelompok.trim(), nama.trim(), keterangan?.trim() || null, Number(harga_default) || 0, mata_uang || 'IDR', basis_default || 'jamaah', trigger_kunci || null, modul_negara_id || null, Number(urutan) || 0, aktif ? 1 : 0, frekuensi || null, baseline_umroh ? 1 : 0, baseline_wisata ? 1 : 0, id]
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Item master diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X&paksa=1 — hard delete beneran (dikonfirmasi user 2026-10-02,
// sebelumnya UI cuma punya "Nonaktifkan"). biaya_breakdown_item.nominal/nama
// SNAPSHOT independen (bukan live-join ke master item), jadi harga program
// yang SUDAH DIBUAT (biaya_breakdown.program_id IS NOT NULL) gak pernah
// kesentuh walau master item-nya diedit/dihapus — FK master_item_id ke situ
// cuma SET NULL (lepas link traceability-nya doang, lihat migrasi 205).
//
// Baris breakdown milik DRAFT/TEMPLATE (program_id IS NULL) beda — itu
// IKUT DIHAPUS beneran, bukan cuma lepas link (dikonfirmasi user, draft
// emang boleh berubah). Tanpa `paksa=1`, kalau item ini masih dipakai di
// mana pun (draft atau published), balas 409 + jumlah pemakaian dulu biar
// FE bisa kasih reminder sebelum beneran hapus.
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    const paksa = searchParams.get('paksa') === '1';
    if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });

    const [[item]] = await pool.query('SELECT id, nama FROM biaya_master_item WHERE id = ?', [id]);
    if (!item) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });

    const [[usage]] = await pool.query(
      `SELECT
         SUM(CASE WHEN bb.program_id IS NULL THEN 1 ELSE 0 END) AS draft_count,
         SUM(CASE WHEN bb.program_id IS NOT NULL THEN 1 ELSE 0 END) AS published_count
       FROM biaya_breakdown_item bbi
       JOIN biaya_breakdown bb ON bb.id = bbi.breakdown_id
       WHERE bbi.master_item_id = ?`,
      [id]
    );
    const draftCount = Number(usage?.draft_count || 0);
    const publishedCount = Number(usage?.published_count || 0);

    if ((draftCount > 0 || publishedCount > 0) && !paksa) {
      return Response.json({
        confirm_required: true,
        draft_count: draftCount,
        published_count: publishedCount,
      }, { status: 409 });
    }

    if (draftCount > 0) {
      await pool.query(
        `DELETE bbi FROM biaya_breakdown_item bbi
         JOIN biaya_breakdown bb ON bb.id = bbi.breakdown_id
         WHERE bbi.master_item_id = ? AND bb.program_id IS NULL`,
        [id]
      );
    }

    const [result] = await pool.query('DELETE FROM biaya_master_item WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Item master dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
