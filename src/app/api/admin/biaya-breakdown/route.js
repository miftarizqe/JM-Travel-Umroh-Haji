import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

function nilaiHeader(body) {
  return {
    nama: body.nama?.trim() || '', paket: body.paket || null,
    jenis_program: body.jenis_program || 'umroh_regular',
    modul_tambahan: body.modul_tambahan ? JSON.stringify(body.modul_tambahan) : null,
    include_items: body.include_items?.trim() || null, exclude_items: body.exclude_items?.trim() || null,
    itinerary: Array.isArray(body.itinerary) && body.itinerary.length > 0 ? JSON.stringify(body.itinerary) : null,
    itinerary_modul: Array.isArray(body.itinerary_modul) && body.itinerary_modul.length > 0 ? JSON.stringify(body.itinerary_modul) : null,
    pax_jamaah: Number(body.pax_jamaah) || 0, pax_tl: Number(body.pax_tl) || 0,
    pax_mutawwif: Number(body.pax_mutawwif) || 0, pax_mutawwifah: Number(body.pax_mutawwifah) || 0,
    pax_driver: Number(body.pax_driver) || 0,
    total_hari_program: Number(body.total_hari_program) || 0,
    manasik_umroh: Number(body.manasik_umroh) || 0,
    perlengkapan_jamaah: Number(body.perlengkapan_jamaah) || 0, haramain_express: Number(body.haramain_express) || 0,
    handling_jeddah: Number(body.handling_jeddah) || 0,
    city_tour_mekkah: Number(body.city_tour_mekkah) || 0, city_tour_madinah: Number(body.city_tour_madinah) || 0,
    city_tour_thaif: Number(body.city_tour_thaif) || 0, transportasi_pilihan: body.transportasi_pilihan || null,
    kurs_usd_idr: Number(body.kurs_usd_idr) || 0, kurs_sar_idr: Number(body.kurs_sar_idr) || 0,
    hotel_mode: body.hotel_mode === 'mix' ? 'mix' : 'fix',
    bintang_aktif: body.bintang_aktif && typeof body.bintang_aktif === 'object' ? JSON.stringify(body.bintang_aktif) : null,
    pembulatan: Number(body.pembulatan) || 0,
    umroh_dulu: body.umroh_dulu === false ? 0 : 1,
    hotel_list: Array.isArray(body.hotel_list) && body.hotel_list.length > 0
      ? JSON.stringify(body.hotel_list.map(h => ({ nama: h.nama?.trim() || '', bintang: Number(h.bintang) || 0, rate_double: Number(h.rate_double) || 0, rate_triple: Number(h.rate_triple) || 0, rate_quad: Number(h.rate_quad) || 0, mata_uang: h.mata_uang || 'SAR', malam: Number(h.malam) || 0 })))
      : null,
    hotel_mekkah_nama: body.hotel_mekkah_nama?.trim() || null,
    hotel_mekkah_rate_double: Number(body.hotel_mekkah_rate_double) || 0,
    hotel_mekkah_rate_triple: Number(body.hotel_mekkah_rate_triple) || 0,
    hotel_mekkah_rate_quad: Number(body.hotel_mekkah_rate_quad) || 0,
    hotel_mekkah_malam: Number(body.hotel_mekkah_malam) || 0,
    hotel_mekkah_mata_uang: body.hotel_mekkah_mata_uang || 'SAR',
    hotel_madinah_nama: body.hotel_madinah_nama?.trim() || null,
    hotel_madinah_rate_double: Number(body.hotel_madinah_rate_double) || 0,
    hotel_madinah_rate_triple: Number(body.hotel_madinah_rate_triple) || 0,
    hotel_madinah_rate_quad: Number(body.hotel_madinah_rate_quad) || 0,
    hotel_madinah_malam: Number(body.hotel_madinah_malam) || 0,
    hotel_madinah_mata_uang: body.hotel_madinah_mata_uang || 'SAR',
    tiket_pesawat_rate: Number(body.tiket_pesawat_rate) || 0, tiket_pesawat_mata_uang: body.tiket_pesawat_mata_uang || 'IDR',
    tiket_pesawat_list: Array.isArray(body.tiket_pesawat_list) && body.tiket_pesawat_list.length > 0
      ? JSON.stringify(body.tiket_pesawat_list.map(t => ({ nama: t.nama?.trim() || '', rate: Number(t.rate) || 0, mata_uang: t.mata_uang || 'IDR' })))
      : null,
    visa_rate: Number(body.visa_rate) || 0, visa_mata_uang: body.visa_mata_uang || 'IDR',
    biaya_lain_lain: Number(body.biaya_lain_lain) || 0, biaya_lain_lain_mata_uang: body.biaya_lain_lain_mata_uang || 'IDR',
    komisi_rate: Number(body.komisi_rate) || 0, margin_rate: Number(body.margin_rate) || 0,
  };
}

// GET /api/admin/biaya-breakdown?is_template=1  atau  ?program_id=X  atau  ?template_group=X  atau  ?id=X
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const isTemplate = searchParams.get('is_template');
    const programId = searchParams.get('program_id');
    const templateGroup = searchParams.get('template_group');

    if (id) {
      const [[breakdown]] = await pool.query('SELECT * FROM biaya_breakdown WHERE id = ?', [id]);
      if (!breakdown) return Response.json({ error: 'Kalkulator tidak ditemukan' }, { status: 404 });
      const [items] = await pool.query('SELECT * FROM biaya_breakdown_item WHERE breakdown_id = ? ORDER BY urutan ASC, id ASC', [id]);
      return Response.json({ breakdown: { ...breakdown, items } });
    }

    if (templateGroup) {
      const [rows] = await pool.query('SELECT * FROM biaya_breakdown WHERE template_group = ? ORDER BY paket ASC', [templateGroup]);
      return Response.json({ breakdown: rows });
    }

    let where = ' WHERE 1=1';
    const params = [];
    if (isTemplate) { where += ' AND is_template = 1'; }
    if (programId) { where += ' AND program_id = ?'; params.push(programId); }
    const [rows] = await pool.query(`SELECT * FROM biaya_breakdown ${where} ORDER BY created_at DESC`, params);

    if (isTemplate) {
      // Template Umroh Regular disimpan sebagai 3 row (1 per bintang) yang berbagi
      // template_group — kelompokin jadi 1 entri representatif per grup buat list/dropdown.
      // Row lama tanpa template_group (kalau ada) tetap tampil apa adanya (fallback ke id).
      const dilihat = new Set();
      const hasil = [];
      for (const row of rows) {
        const kunci = row.template_group || `id:${row.id}`;
        if (dilihat.has(kunci)) continue;
        dilihat.add(kunci);
        hasil.push({ ...row, id: row.template_group || row.id });
      }
      return Response.json({ breakdown: hasil });
    }
    return Response.json({ breakdown: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — buat kalkulator baru (template ATAU breakdown program), sekalian item-itemnya
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const h = nilaiHeader(body);
    if (!h.nama) return Response.json({ error: 'Nama wajib diisi' }, { status: 400 });

    const [result] = await pool.query(
      `INSERT INTO biaya_breakdown (nama, is_template, template_group, jenis_program, modul_tambahan, include_items, exclude_items, itinerary, itinerary_modul, program_id, paket, hotel_mode, bintang_aktif, pembulatan, umroh_dulu, pax_jamaah, pax_tl, pax_mutawwif, pax_mutawwifah, pax_driver,
        total_hari_program, manasik_umroh, perlengkapan_jamaah, haramain_express, handling_jeddah,
        city_tour_mekkah, city_tour_madinah, city_tour_thaif, transportasi_pilihan,
        kurs_usd_idr, kurs_sar_idr,
        hotel_mekkah_nama, hotel_mekkah_rate_double, hotel_mekkah_rate_triple, hotel_mekkah_rate_quad, hotel_mekkah_malam, hotel_mekkah_mata_uang,
        hotel_madinah_nama, hotel_madinah_rate_double, hotel_madinah_rate_triple, hotel_madinah_rate_quad, hotel_madinah_malam, hotel_madinah_mata_uang, hotel_list,
        tiket_pesawat_rate, tiket_pesawat_mata_uang, tiket_pesawat_list, visa_rate, visa_mata_uang, biaya_lain_lain, biaya_lain_lain_mata_uang, komisi_rate, margin_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [h.nama, body.is_template ? 1 : 0, body.template_group || null, h.jenis_program, h.modul_tambahan, h.include_items, h.exclude_items, h.itinerary, h.itinerary_modul, body.program_id || null, h.paket, h.hotel_mode, h.bintang_aktif, h.pembulatan, h.umroh_dulu, h.pax_jamaah, h.pax_tl, h.pax_mutawwif, h.pax_mutawwifah, h.pax_driver,
        h.total_hari_program, h.manasik_umroh, h.perlengkapan_jamaah, h.haramain_express, h.handling_jeddah,
        h.city_tour_mekkah, h.city_tour_madinah, h.city_tour_thaif, h.transportasi_pilihan,
        h.kurs_usd_idr, h.kurs_sar_idr,
        h.hotel_mekkah_nama, h.hotel_mekkah_rate_double, h.hotel_mekkah_rate_triple, h.hotel_mekkah_rate_quad, h.hotel_mekkah_malam, h.hotel_mekkah_mata_uang,
        h.hotel_madinah_nama, h.hotel_madinah_rate_double, h.hotel_madinah_rate_triple, h.hotel_madinah_rate_quad, h.hotel_madinah_malam, h.hotel_madinah_mata_uang, h.hotel_list,
        h.tiket_pesawat_rate, h.tiket_pesawat_mata_uang, h.tiket_pesawat_list, h.visa_rate, h.visa_mata_uang, h.biaya_lain_lain, h.biaya_lain_lain_mata_uang, h.komisi_rate, h.margin_rate]
    );
    const breakdownId = result.insertId;

    for (const [i, item] of (body.items || []).entries()) {
      if (!item.nama?.trim()) continue;
      await pool.query(
        'INSERT INTO biaya_breakdown_item (breakdown_id, master_item_id, kelompok, nama, nominal, mata_uang, basis, trigger_kunci, modul_negara_id, urutan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [breakdownId, item.master_item_id || null, item.kelompok?.trim() || 'Lain-lain', item.nama.trim(), Number(item.nominal) || 0, item.mata_uang || 'IDR', item.basis || 'jamaah', item.trigger_kunci || null, item.modul_negara_id || null, i]
      );
    }

    return Response.json({ message: 'Kalkulator biaya disimpan!', id: breakdownId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update kalkulator (body.id wajib) — item-item lama diganti total sama yang baru
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    const h = nilaiHeader(body);
    if (!h.nama) return Response.json({ error: 'Nama wajib diisi' }, { status: 400 });

    await pool.query(
      `UPDATE biaya_breakdown SET nama = ?, template_group = ?, jenis_program = ?, modul_tambahan = ?, include_items = ?, exclude_items = ?, itinerary = ?, itinerary_modul = ?, paket = ?, hotel_mode = ?, bintang_aktif = ?, pembulatan = ?, umroh_dulu = ?, pax_jamaah = ?, pax_tl = ?, pax_mutawwif = ?, pax_mutawwifah = ?, pax_driver = ?,
        total_hari_program = ?, manasik_umroh = ?, perlengkapan_jamaah = ?, haramain_express = ?, handling_jeddah = ?,
        city_tour_mekkah = ?, city_tour_madinah = ?, city_tour_thaif = ?, transportasi_pilihan = ?,
        kurs_usd_idr = ?, kurs_sar_idr = ?,
        hotel_mekkah_nama = ?, hotel_mekkah_rate_double = ?, hotel_mekkah_rate_triple = ?, hotel_mekkah_rate_quad = ?, hotel_mekkah_malam = ?, hotel_mekkah_mata_uang = ?,
        hotel_madinah_nama = ?, hotel_madinah_rate_double = ?, hotel_madinah_rate_triple = ?, hotel_madinah_rate_quad = ?, hotel_madinah_malam = ?, hotel_madinah_mata_uang = ?, hotel_list = ?,
        tiket_pesawat_rate = ?, tiket_pesawat_mata_uang = ?, tiket_pesawat_list = ?, visa_rate = ?, visa_mata_uang = ?, biaya_lain_lain = ?, biaya_lain_lain_mata_uang = ?, komisi_rate = ?, margin_rate = ?
       WHERE id = ?`,
      [h.nama, body.template_group || null, h.jenis_program, h.modul_tambahan, h.include_items, h.exclude_items, h.itinerary, h.itinerary_modul, h.paket, h.hotel_mode, h.bintang_aktif, h.pembulatan, h.umroh_dulu, h.pax_jamaah, h.pax_tl, h.pax_mutawwif, h.pax_mutawwifah, h.pax_driver,
        h.total_hari_program, h.manasik_umroh, h.perlengkapan_jamaah, h.haramain_express, h.handling_jeddah,
        h.city_tour_mekkah, h.city_tour_madinah, h.city_tour_thaif, h.transportasi_pilihan,
        h.kurs_usd_idr, h.kurs_sar_idr,
        h.hotel_mekkah_nama, h.hotel_mekkah_rate_double, h.hotel_mekkah_rate_triple, h.hotel_mekkah_rate_quad, h.hotel_mekkah_malam, h.hotel_mekkah_mata_uang,
        h.hotel_madinah_nama, h.hotel_madinah_rate_double, h.hotel_madinah_rate_triple, h.hotel_madinah_rate_quad, h.hotel_madinah_malam, h.hotel_madinah_mata_uang, h.hotel_list,
        h.tiket_pesawat_rate, h.tiket_pesawat_mata_uang, h.tiket_pesawat_list, h.visa_rate, h.visa_mata_uang, h.biaya_lain_lain, h.biaya_lain_lain_mata_uang, h.komisi_rate, h.margin_rate, id]
    );

    await pool.query('DELETE FROM biaya_breakdown_item WHERE breakdown_id = ?', [id]);
    for (const [i, item] of (body.items || []).entries()) {
      if (!item.nama?.trim()) continue;
      await pool.query(
        'INSERT INTO biaya_breakdown_item (breakdown_id, master_item_id, kelompok, nama, nominal, mata_uang, basis, trigger_kunci, modul_negara_id, urutan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, item.master_item_id || null, item.kelompok?.trim() || 'Lain-lain', item.nama.trim(), Number(item.nominal) || 0, item.mata_uang || 'IDR', item.basis || 'jamaah', item.trigger_kunci || null, item.modul_negara_id || null, i]
      );
    }

    return Response.json({ message: 'Kalkulator biaya diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X  atau  ?template_group=X (hapus semua row grup itu)
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const templateGroup = searchParams.get('template_group');
    if (templateGroup) {
      const [result] = await pool.query('DELETE FROM biaya_breakdown WHERE template_group = ?', [templateGroup]);
      if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
      return Response.json({ message: 'Kalkulator biaya dihapus!' });
    }
    const id = Number(searchParams.get('id'));
    if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });
    const [result] = await pool.query('DELETE FROM biaya_breakdown WHERE id = ?', [id]);
    if (result.affectedRows === 0) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    return Response.json({ message: 'Kalkulator biaya dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
