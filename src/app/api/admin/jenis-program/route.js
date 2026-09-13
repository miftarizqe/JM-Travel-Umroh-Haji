import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// jenis_program_master — dulu daftar hardcode JENIS_PROGRAM_LIST di
// src/lib/kalkulatorBiaya.js, sekarang admin yang kelola sendiri (nambah
// kategori baru gak perlu developer edit kode lagi). `value` dipakai sebagai
// identifier stabil di kalkulator_template_publik.jenis_program,
// programs.jenis_program — jadi diturunkan
// OTOMATIS dari label pas dibuat & TIDAK BISA diubah lagi setelahnya (biar
// referensi yang udah ada gak nyasar).
function slugify(label) {
  return String(label || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// GET /api/admin/jenis-program — default cuma yang aktif, ?semua=1 semua
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const semua = searchParams.get('semua') === '1';
    const where = semua ? '' : ' WHERE aktif = 1';
    const [rows] = await pool.query(`SELECT * FROM jenis_program_master${where} ORDER BY urutan ASC, value ASC`);
    return Response.json({ jenis_program: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah kategori baru
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { label, punya_umroh, boleh_modul_negara, tipe_program, urutan } = await request.json();
    if (!label?.trim()) return Response.json({ error: 'Nama kategori wajib diisi' }, { status: 400 });
    const value = slugify(label);
    if (!value) return Response.json({ error: 'Nama kategori tidak valid' }, { status: 400 });

    const [[ada]] = await pool.query('SELECT value FROM jenis_program_master WHERE value = ?', [value]);
    if (ada) return Response.json({ error: `Kategori dengan nama serupa ("${value}") sudah ada` }, { status: 409 });

    await pool.query(
      'INSERT INTO jenis_program_master (value, label, punya_umroh, boleh_modul_negara, tipe_program, urutan) VALUES (?, ?, ?, ?, ?, ?)',
      [value, label.trim(), punya_umroh ? 1 : 0, boleh_modul_negara ? 1 : 0, tipe_program?.trim() || 'Umroh', Number(urutan) || 0]
    );
    return Response.json({ message: 'Kategori jenis program ditambahkan!', value }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update kategori (value TIDAK BISA diubah, cuma label/flag/urutan/aktif)
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { value, label, punya_umroh, boleh_modul_negara, tipe_program, urutan, aktif } = await request.json();
    if (!value || !label?.trim()) return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    const [result] = await pool.query(
      'UPDATE jenis_program_master SET label = ?, punya_umroh = ?, boleh_modul_negara = ?, tipe_program = ?, urutan = ?, aktif = ? WHERE value = ?',
      [label.trim(), punya_umroh ? 1 : 0, boleh_modul_negara ? 1 : 0, tipe_program?.trim() || 'Umroh', Number(urutan) || 0, aktif === false ? 0 : 1, value]
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Kategori tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Kategori jenis program diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?value=X — kategori ini gak boleh dihapus kalau masih dipakai
// PROGRAM beneran (booking asli, jamaah nyata — itu yang wajib dilindungi).
// Kalkulator Acuan (tipe='baseline') BEDA — itu bukan "template" independen,
// cuma 1 config yang NEMPEL ke jenis program ini doang (1:1, auto-kebuat pas
// pertama kali di-save di Master Data → Jenis Program), jadi gak ada
// alasan dianggap "masih dipakai" pas mau hapus jenis programnya sendiri —
// ikut kehapus bareng aja (dikonfirmasi user 2026-08-18, sebelumnya
// keblokir nunjuk ke template yang jelas-jelas gak independen).
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const value = searchParams.get('value');
    if (!value) return Response.json({ error: 'Parameter value wajib diisi' }, { status: 400 });

    const [[{ n: nProgram }]] = await pool.query('SELECT COUNT(*) AS n FROM programs WHERE jenis_program = ?', [value]);
    if (nProgram > 0) {
      return Response.json({ error: `Kategori ini masih dipakai di: ${nProgram} program. Nonaktifkan aja daripada dihapus.` }, { status: 409 });
    }

    // Kalkulator Acuan (baseline) ikut kehapus bareng (lihat komentar di
    // atas) — TAPI kalkulator_lead (riwayat jamaah pernah coba hitung pakai
    // baseline ini) punya FK ke situ, jadi harus dibersihin duluan biar gak
    // ke-block "foreign key constraint fails" (bug nyata yang nongol sebagai
    // 500 generic, dikonfirmasi user 2026-08-18 — riwayat lead-nya ikut
    // kehapus juga karena udah gak ada template yang direferensiin lagi).
    const [templateBaseline] = await pool.query("SELECT id FROM kalkulator_template_publik WHERE jenis_program = ? AND tipe = 'baseline'", [value]);
    if (templateBaseline.length > 0) {
      await pool.query('DELETE FROM kalkulator_lead WHERE template_id IN (?)', [templateBaseline.map(t => t.id)]);
      await pool.query("DELETE FROM kalkulator_template_publik WHERE jenis_program = ? AND tipe = 'baseline'", [value]);
    }
    const [result] = await pool.query('DELETE FROM jenis_program_master WHERE value = ?', [value]);
    if (result.affectedRows === 0) return Response.json({ error: 'Kategori tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Kategori jenis program dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
