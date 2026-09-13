import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { cekItemPerluDipesan, hitungKebutuhanPerItem, tambahStokMasuk } from '@/lib/perlengkapan';

// GET /api/admin/perlengkapan — daftar item + stok + status perlu-pesan.
// KHUSUS super_admin (detail stok & ambang reorder tidak boleh dilihat
// admin operasional biasa — beda dengan status pengiriman per-jamaah yang
// ada di /api/admin/perlengkapan-pengiriman, itu admin biasa boleh akses).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const [items] = await pool.query('SELECT * FROM perlengkapan_jamaah ORDER BY urutan');
    const kebutuhan = await hitungKebutuhanPerItem(pool, items);
    const perluDipesanIds = new Set((await cekItemPerluDipesan(pool)).map(i => i.id));

    const hasil = items.map(it => ({
      ...it,
      kebutuhan_mendatang: kebutuhan.get(it.id) || 0,
      perlu_dipesan: perluDipesanIds.has(it.id),
    }));
    return Response.json({ items: hasil });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/perlengkapan
// - body: { nama, deskripsi?, gender_spesifik?, kategori_program? } — bikin
//   item katalog BARU (dibedain dari stok masuk lewat ada/gaknya `nama`).
//   SEBELUM ini gak ada jalur sama sekali buat nambah item baru (cuma bisa
//   atur stok/ambang item yang udah ada) — ketauan pas nyiapin kit
//   "Program Sahabat Baitullah" yang butuh item kategori baru.
// - body: { item_id, qty, keterangan, harga_satuan?, akun_id?, program_id? }
//   — catat stok masuk (restock/pembelian), pola lama gak berubah.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();

    if (body.nama) {
      const { nama, deskripsi, gender_spesifik, kategori_program } = body;
      if (gender_spesifik && !['semua', 'laki', 'perempuan'].includes(gender_spesifik)) {
        return Response.json({ error: 'gender_spesifik tidak valid' }, { status: 400 });
      }
      if (kategori_program && !['umum', 'sahabat_baitullah'].includes(kategori_program)) {
        return Response.json({ error: 'kategori_program tidak valid' }, { status: 400 });
      }
      const [[{ maxUrutan }]] = await pool.query('SELECT COALESCE(MAX(urutan), 0) AS maxUrutan FROM perlengkapan_jamaah');
      const [result] = await pool.query(
        `INSERT INTO perlengkapan_jamaah (urutan, nama, deskripsi, gender_spesifik, kategori_program, aktif, stok_saat_ini, stok_minimum)
         VALUES (?, ?, ?, ?, ?, 1, 0, 0)`,
        [maxUrutan + 1, nama.trim(), deskripsi || null, gender_spesifik || 'semua', kategori_program || 'umum']
      );
      return Response.json({ message: 'Item baru ditambahkan!', id: result.insertId }, { status: 201 });
    }

    const { item_id, qty, keterangan, harga_satuan, akun_id, program_id } = body;
    if (!item_id || !qty) return Response.json({ error: 'item_id dan qty wajib diisi' }, { status: 400 });
    await tambahStokMasuk(pool, {
      itemId: item_id, qty: Number(qty), keterangan,
      hargaSatuan: harga_satuan, akunId: akun_id, programId: program_id,
      actorId: auth.user.id,
    });
    return Response.json({ message: 'Stok masuk dicatat!' });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}

// PUT /api/admin/perlengkapan  body: { id, stok_minimum?, gender_spesifik?, kategori_program?, nama?, deskripsi?, aktif? }
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id, stok_minimum, gender_spesifik, kategori_program, nama, deskripsi, aktif } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    if (gender_spesifik && !['semua', 'laki', 'perempuan'].includes(gender_spesifik)) {
      return Response.json({ error: 'gender_spesifik tidak valid' }, { status: 400 });
    }
    if (kategori_program && !['umum', 'sahabat_baitullah'].includes(kategori_program)) {
      return Response.json({ error: 'kategori_program tidak valid' }, { status: 400 });
    }

    const set = [];
    const params = [];
    if (stok_minimum != null) { set.push('stok_minimum = ?'); params.push(Number(stok_minimum)); }
    if (gender_spesifik) { set.push('gender_spesifik = ?'); params.push(gender_spesifik); }
    if (kategori_program) { set.push('kategori_program = ?'); params.push(kategori_program); }
    if (nama != null) { set.push('nama = ?'); params.push(String(nama).trim()); }
    if (deskripsi != null) { set.push('deskripsi = ?'); params.push(deskripsi || null); }
    if (aktif != null) { set.push('aktif = ?'); params.push(aktif ? 1 : 0); }
    if (set.length === 0) return Response.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

    params.push(id);
    const [result] = await pool.query(`UPDATE perlengkapan_jamaah SET ${set.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Item diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
