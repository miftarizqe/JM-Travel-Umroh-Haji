import pool from '@/lib/db';
import { randomUUID } from 'crypto';
import { wajibSuperAdmin } from '@/lib/auth';

// CRUD template Kalkulator Estimasi Publik — super_admin only (config_json
// isinya HPP/margin/komisi, level akses sama kayak /admin/program-costing).
//
// `tipe` = 'kurasi' (paket bernama, mis. "Umroh Berdua", browse dari daftar
// di /kalkulator) atau 'baseline' (1 per jenis_program, dipakai jalur "Umroh
// Private" — pengunjung pilih jenis program dulu, bukan browse paket
// bernama). Baseline tetap baris biasa di tabel ini, config_json/editor/
// alur hitung SAMA PERSIS kayak kurasi — cuma cara di-lookup-nya beda
// (by jenis_program, bukan browse by id) dan nama boleh kosong (auto-derive
// dari label jenis_program).
async function labelJenisProgram(jenisProgram) {
  const [[row]] = await pool.query('SELECT label FROM jenis_program_master WHERE value = ?', [jenisProgram]);
  return row?.label || jenisProgram;
}
async function namaOtomatis(jenisProgram) {
  return `Umroh Private — ${await labelJenisProgram(jenisProgram)}`;
}
async function jenisProgramValid(jenisProgram) {
  const [[row]] = await pool.query('SELECT value FROM jenis_program_master WHERE value = ?', [jenisProgram]);
  return !!row;
}

// GET /api/admin/kalkulator-template            -> semua template (termasuk nonaktif)
// GET /api/admin/kalkulator-template?id=xxx     -> detail 1 template (buat form edit)
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const [[t]] = await pool.query('SELECT * FROM kalkulator_template_publik WHERE id = ?', [id]);
      if (!t) return Response.json({ error: 'Template tidak ditemukan' }, { status: 404 });
      return Response.json({ template: t });
    }

    const [rows] = await pool.query('SELECT id, nama, tipe, jenis_program, deskripsi, gambar, aktif, urutan, created_at, updated_at FROM kalkulator_template_publik ORDER BY tipe ASC, urutan ASC, created_at DESC');
    return Response.json({ template: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/kalkulator-template
// body: { nama, deskripsi, gambar, config_json: {shared,hotel,malam,komisi,margin}, aktif, urutan, tipe?, jenis_program? }
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { nama, deskripsi, gambar, config_json, aktif, urutan, tipe, jenis_program } = await request.json();
    const tipeFinal = tipe === 'baseline' ? 'baseline' : 'kurasi';
    if (!config_json) {
      return Response.json({ error: 'config_json wajib diisi' }, { status: 400 });
    }
    if (tipeFinal === 'baseline') {
      if (!jenis_program || !(await jenisProgramValid(jenis_program))) {
        return Response.json({ error: 'Jenis program wajib dipilih buat baseline' }, { status: 400 });
      }
    } else if (!nama?.trim()) {
      return Response.json({ error: 'Nama paket wajib diisi' }, { status: 400 });
    }

    const id = randomUUID();
    const namaFinal = nama?.trim() || (tipeFinal === 'baseline' ? await namaOtomatis(jenis_program) : null);
    if (!namaFinal) return Response.json({ error: 'Nama paket wajib diisi' }, { status: 400 });

    await pool.query(
      `INSERT INTO kalkulator_template_publik (id, nama, tipe, jenis_program, deskripsi, gambar, config_json, aktif, urutan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, namaFinal, tipeFinal, tipeFinal === 'baseline' ? jenis_program : null, deskripsi?.trim() || null, gambar || null, JSON.stringify(config_json), aktif === false ? 0 : 1, Number(urutan) || 0]
    );

    return Response.json({ message: 'Template tersimpan!', id }, { status: 201 });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Baseline untuk jenis program ini sudah ada — edit yang sudah ada aja, gak bisa dobel.' }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/kalkulator-template
// body: { id, nama?, deskripsi?, gambar?, config_json?, aktif?, urutan?, tipe?, jenis_program? }
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id, nama, deskripsi, gambar, config_json, aktif, urutan, tipe, jenis_program } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    if (tipe === 'baseline' && jenis_program != null && !(await jenisProgramValid(jenis_program))) {
      return Response.json({ error: 'Jenis program tidak valid' }, { status: 400 });
    }

    const set = [];
    const params = [];
    if (nama != null) { set.push('nama = ?'); params.push(nama.trim()); }
    if (deskripsi !== undefined) { set.push('deskripsi = ?'); params.push(deskripsi?.trim() || null); }
    if (gambar !== undefined) { set.push('gambar = ?'); params.push(gambar || null); }
    if (config_json != null) { set.push('config_json = ?'); params.push(JSON.stringify(config_json)); }
    if (aktif != null) { set.push('aktif = ?'); params.push(aktif ? 1 : 0); }
    if (urutan != null) { set.push('urutan = ?'); params.push(Number(urutan) || 0); }
    if (tipe != null) {
      const tipeFinal = tipe === 'baseline' ? 'baseline' : 'kurasi';
      set.push('tipe = ?'); params.push(tipeFinal);
      set.push('jenis_program = ?'); params.push(tipeFinal === 'baseline' ? (jenis_program || null) : null);
    }
    if (set.length === 0) return Response.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });

    params.push(id);
    const [result] = await pool.query(`UPDATE kalkulator_template_publik SET ${set.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return Response.json({ error: 'Template tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Template diperbarui!' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Baseline untuk jenis program ini sudah ada — edit yang sudah ada aja, gak bisa dobel.' }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/kalkulator-template?id=xxx
// Kalau sudah pernah dipakai hitung (ada baris kalkulator_lead nempel via FK),
// gak bisa dihapus — arahkan admin buat nonaktifkan (aktif=0) lewat PUT
// ketimbang hapus riwayat lead yang udah kesimpen.
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const [result] = await pool.query('DELETE FROM kalkulator_template_publik WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Template tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Template dihapus!' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return Response.json({ error: 'Template ini sudah pernah dipakai pengunjung (ada riwayat lead) — nonaktifkan saja, jangan dihapus.' }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
