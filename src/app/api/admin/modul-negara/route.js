import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/modul-negara — default cuma yang aktif, ?semua=1 semua,
// ?jenis_program=X filter, ?full=1 sertakan tiers + addons (dipakai
// kalkulator buat resolve nominal item yg modul_negara_id-nya keisi).
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const semua = searchParams.get('semua') === '1';
    const jenisProgram = searchParams.get('jenis_program');
    const full = searchParams.get('full') === '1';

    let where = semua ? ' WHERE 1=1' : ' WHERE aktif = 1';
    const params = [];
    if (jenisProgram) { where += ' AND jenis_program = ?'; params.push(jenisProgram); }
    const [modul] = await pool.query(`SELECT * FROM modul_negara ${where} ORDER BY urutan ASC, id ASC`, params);

    if (full && modul.length > 0) {
      const modulIds = modul.map(m => m.id);
      const [tiers] = await pool.query(
        'SELECT * FROM modul_negara_tier WHERE modul_negara_id IN (?) ORDER BY urutan ASC, id ASC',
        [modulIds]
      );
      const [addons] = await pool.query(
        'SELECT * FROM modul_negara_addon WHERE modul_negara_id IN (?) ORDER BY urutan ASC, id ASC',
        [modulIds]
      );
      const tiersByModul = new Map();
      for (const t of tiers) {
        if (!tiersByModul.has(t.modul_negara_id)) tiersByModul.set(t.modul_negara_id, []);
        tiersByModul.get(t.modul_negara_id).push(t);
      }
      const addonsByModul = new Map();
      for (const a of addons) {
        if (!addonsByModul.has(a.modul_negara_id)) addonsByModul.set(a.modul_negara_id, []);
        addonsByModul.get(a.modul_negara_id).push(a);
      }
      for (const m of modul) {
        m.tiers = tiersByModul.get(m.id) || [];
        m.addons = addonsByModul.get(m.id) || [];
      }
    }

    return Response.json({ modul });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah modul negara baru
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { jenis_program, nama, mata_uang, pakai_periode, pakai_hotel_star, info_hotel, pakai_city_tour_opsi, urutan, itinerary_per_hari, tl_gratis_min_pax } = await request.json();
    if (!jenis_program?.trim() || !nama?.trim()) {
      return Response.json({ error: 'Jenis program & nama wajib diisi' }, { status: 400 });
    }
    const [result] = await pool.query(
      'INSERT INTO modul_negara (jenis_program, nama, mata_uang, pakai_periode, pakai_hotel_star, info_hotel, pakai_city_tour_opsi, urutan, itinerary_per_hari, tl_gratis_min_pax) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [jenis_program.trim(), nama.trim(), mata_uang || 'USD', pakai_periode ? 1 : 0, pakai_hotel_star ? 1 : 0, info_hotel?.trim() || null, pakai_city_tour_opsi ? 1 : 0, Number(urutan) || 0,
        itinerary_per_hari && Object.keys(itinerary_per_hari).length > 0 ? JSON.stringify(itinerary_per_hari) : null,
        Number(tl_gratis_min_pax) > 0 ? Number(tl_gratis_min_pax) : null]
    );
    return Response.json({ message: 'Modul negara ditambahkan!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update modul negara
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, jenis_program, nama, mata_uang, pakai_periode, pakai_hotel_star, info_hotel, pakai_city_tour_opsi, urutan, aktif, itinerary_per_hari, tl_gratis_min_pax } = await request.json();
    if (!id || !jenis_program?.trim() || !nama?.trim()) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [result] = await pool.query(
      'UPDATE modul_negara SET jenis_program = ?, nama = ?, mata_uang = ?, pakai_periode = ?, pakai_hotel_star = ?, info_hotel = ?, pakai_city_tour_opsi = ?, urutan = ?, aktif = ?, itinerary_per_hari = ?, tl_gratis_min_pax = ? WHERE id = ?',
      [jenis_program.trim(), nama.trim(), mata_uang || 'USD', pakai_periode ? 1 : 0, pakai_hotel_star ? 1 : 0, info_hotel?.trim() || null, pakai_city_tour_opsi ? 1 : 0, Number(urutan) || 0, aktif ? 1 : 0,
        itinerary_per_hari && Object.keys(itinerary_per_hari).length > 0 ? JSON.stringify(itinerary_per_hari) : null,
        Number(tl_gratis_min_pax) > 0 ? Number(tl_gratis_min_pax) : null, id]
    );
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Modul negara diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X — tier ikut kehapus otomatis (ON DELETE CASCADE). modul_tambahan
// di biaya_breakdown itu JSON polos (BUKAN foreign key), jadi DB gak otomatis
// nolak kayak Item Master — dicek manual dulu di sini biar gak ninggalin
// referensi mati yang bikin costing template/program diem-diem salah hitung.
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT bb.nama, bb.is_template, bb.modul_tambahan, p.name AS program_nama
       FROM biaya_breakdown bb LEFT JOIN programs p ON p.id = bb.program_id
       WHERE bb.modul_tambahan IS NOT NULL`
    );
    const pemakai = new Set();
    for (const r of rows) {
      let arr = r.modul_tambahan;
      if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
      if (!Array.isArray(arr)) arr = arr?.modul_negara_id ? [arr] : [];
      if (arr.some(e => Number(e?.modul_negara_id) === id)) {
        pemakai.add(r.is_template ? `Template "${r.nama}"` : `Program "${r.program_nama || r.nama}"`);
      }
    }
    if (pemakai.size > 0) {
      return Response.json({ error: `Modul ini masih dipakai di: ${[...pemakai].join(', ')}. Nonaktifkan aja daripada dihapus, atau lepas dulu tautannya di sana kalau memang mau dihapus permanen.` }, { status: 409 });
    }

    const [result] = await pool.query('DELETE FROM modul_negara WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Modul negara dihapus!' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return Response.json({ error: 'Modul negara ini masih ditautkan ke Item Master/breakdown biaya — nonaktifkan saja, atau lepas dulu tautannya sebelum dihapus.' }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
