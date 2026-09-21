import { randomUUID } from 'crypto';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];

// Kumpulan kolom 9-kombinasi untuk harga jual, hpp, dan ujroh
function komboCols(prefix) {
  const cols = [];
  for (const p of PAKET) for (const k of KAMAR) cols.push(`${prefix}_${p}_${k}`);
  return cols;
}
const HARGA_COLS = komboCols('harga'); // harga_deluxe_quad, ...
const HPP_COLS = komboCols('hpp');     // hpp_deluxe_quad, ...
const UJROH_COLS = komboCols('ujroh'); // ujroh_deluxe_quad, ...
const ALL_KOMBO = [...HARGA_COLS, ...HPP_COLS, ...UJROH_COLS];

// Field dasar program
const BASE = ['name', 'type', 'jenis_program', 'durasi', 'tanggal', 'tanggal_berangkat', 'total_seat', 'dp', 'highlight', 'publish_type', 'active', 'kategori'];

// Field detail program (include/exclude teks, itinerary JSON). itinerary_modul
// = override teks per-hari buat baris yang ditarik dari Modul Negara (Turkey
// dkk) — udah jadi hak Program ini begitu diedit, gak ikut kalau modul aslinya
// diedit belakangan (lihat KalkulatorTerpadu.jsx: teksModulHari/ubahItineraryModul).
const DETAIL = ['include_items', 'exclude_items', 'itinerary', 'itinerary_modul'];

// Info Manasik — sekadar info jadwal/lokasi buat jamaah program ini, gak ada
// gate/tracking kehadiran (lihat dashboard/jamaah/page.jsx).
const MANASIK = ['manasik_tanggal', 'manasik_lokasi', 'manasik_catatan'];

// Fotokopi data modul negara (tier+addon) yang dipakai program ini, dibekukan
// pas pertama kali disimpan — lihat migration-program-katalog-modul-snapshot.sql.
// Frontend yang nentuin isinya (kapan dibekukan/disinkron ulang), di sini
// cuma nulis apa adanya yang dikirim.
const SNAPSHOT = ['katalog_modul_snapshot'];

// Nama hotel Mekkah & Madinah — beda per paket krn beda bintang hotel juga.
const HOTEL = PAKET.flatMap(p => [`hotel_mekkah_${p}`, `hotel_madinah_${p}`]);

// Custom Hotel per Kota (checkout) — jamaah pilih Bintang Mekkah/Madinah
// terpisah, rate-nya reuse HOTEL (hotel_mekkah_{paket} dkk) & harga_* yang
// sudah ada, gak perlu kolom opsi terpisah (lihat src/lib/hotelCustomPricing.js).
// margin_mode/margin_persen/komisi_mode/komisi_persen di-bake dari template
// biaya_breakdown pas admin "Pakai Template" (admin/programs/page.jsx) —
// snapshot per-program, kalau template diedit lagi belakangan program yang
// sudah diterbitkan TIDAK ikut berubah.
const CUSTOM_HOTEL = ['margin_mode', 'margin_persen', 'komisi_mode', 'komisi_persen'];

// Nominal Head of Program + nominal closer buat "Closing Langsung Sahabat
// Baitullah" (Sahabat Baitullah closing-in jamaah LAIN ke program PUBLIK —
// dikonfirmasi user 2026-09-06, SENGAJA cuma relevan buat publish_type=
// 'public', publish_type='sahabat_baitullah' emang cuma bisa dicheckout
// jamaah Sahabat Baitullah sendiri jadi gak ada skenario ini). Per-program,
// boleh kosong (NULL) supaya fallback ke default (lihat src/lib/closing.js).
const SAHABAT_CLOSING = ['sahabat_closing_langsung_hop_nominal', 'sahabat_closing_nominal_closer'];

// Nilai kolom untuk INSERT/UPDATE (dipakai POST & PUT biar konsisten)
function mapVals(cols, body) {
  return cols.map(c => {
    if (
      c === 'name' || c === 'type' || c === 'jenis_program' || c === 'tanggal' || c === 'tanggal_berangkat' ||
      c === 'highlight' || c === 'publish_type' || c === 'kategori' ||
      c === 'include_items' || c === 'exclude_items' || HOTEL.includes(c) || MANASIK.includes(c)
    ) {
      return body[c] ?? null;
    }
    if (c === 'itinerary') {
      return body.itinerary ? JSON.stringify(body.itinerary) : null;
    }
    if (c === 'itinerary_modul') {
      return body.itinerary_modul ? JSON.stringify(body.itinerary_modul) : null;
    }
    if (c === 'katalog_modul_snapshot') {
      return body.katalog_modul_snapshot ? JSON.stringify(body.katalog_modul_snapshot) : null;
    }
    if (c === 'margin_mode' || c === 'komisi_mode') {
      return body[c] === 'persen' ? 'persen' : 'flat';
    }
    if (c === 'margin_persen' || c === 'komisi_persen') {
      return body[c] !== '' && body[c] != null ? Number(body[c]) : null;
    }
    if (c === 'active') return body.active === false ? 0 : 1;
    if (c === 'sahabat_closing_langsung_hop_nominal' || c === 'sahabat_closing_nominal_closer') {
      return body[c] !== '' && body[c] != null ? Number(body[c]) : null;
    }
    return Number(body[c] || 0);
  });
}

// GET /api/admin/programs  atau  ?id=xxx untuk satu program
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (id) {
      const [rows] = await pool.query('SELECT * FROM programs WHERE id = ?', [id]);
      if (rows.length === 0) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });
      const [perwRows] = await pool.query('SELECT perw_id FROM program_perwakilan WHERE program_id = ?', [id]);
      const [privateRows] = await pool.query('SELECT user_id FROM program_private_akun WHERE program_id = ?', [id]);
      return Response.json({ program: { ...rows[0], perw_ids: perwRows.map(r => r.perw_id), private_ids: privateRows.map(r => r.user_id) } });
    }
    const [rows] = await pool.query('SELECT * FROM programs ORDER BY created_at DESC');
    return Response.json({ programs: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// Sinkron daftar perwakilan yang diotorisasi closing program 'perwakilan'
// (replace-all: hapus semua baris lama, insert daftar yang baru) — dipanggil
// abis INSERT/UPDATE programs, di dalam try/catch yang sama.
async function sinkronPerwIds(programId, publishType, perwIds) {
  await pool.query('DELETE FROM program_perwakilan WHERE program_id = ?', [programId]);
  if (publishType !== 'perwakilan' || !Array.isArray(perwIds) || perwIds.length === 0) return;
  for (const perwId of new Set(perwIds)) {
    await pool.query('INSERT INTO program_perwakilan (program_id, perw_id) VALUES (?, ?)', [programId, perwId]);
  }
}

// Sinkron daftar akun jamaah yang ditunjuk admin buat lihat+checkout sendiri
// program 'private' (dikonfirmasi user 2026-09-06) — mirror PERSIS
// sinkronPerwIds di atas, bedanya nunjuk akun jamaah spesifik bukan role.
async function sinkronPrivateIds(programId, publishType, privateIds) {
  await pool.query('DELETE FROM program_private_akun WHERE program_id = ?', [programId]);
  if (publishType !== 'private' || !Array.isArray(privateIds) || privateIds.length === 0) return;
  for (const userId of new Set(privateIds)) {
    await pool.query('INSERT INTO program_private_akun (program_id, user_id) VALUES (?, ?)', [programId, userId]);
  }
}

// POST /api/admin/programs — buat program baru
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) {
      return Response.json({ error: 'Nama program wajib diisi' }, { status: 400 });
    }
    // tanggal_berangkat menentukan kapan booking program ini boleh ditandai
    // closing (lihat cekSyaratClosing di src/lib/closing.js) — tanpa ini
    // booking bakal nyangkut selamanya di status 'active'.
    if (!body.tanggal_berangkat) {
      return Response.json({ error: 'Tanggal keberangkatan wajib diisi' }, { status: 400 });
    }

    // programs.id adalah UUID (DEFAULT uuid()), bukan auto_increment — generate
    // eksplisit di sini biar bisa langsung dikembalikan ke frontend
    // (result.insertId TIDAK berlaku untuk kolom UUID, selalu 0).
    const id = randomUUID();
    const cols = ['id', ...BASE, ...DETAIL, ...SNAPSHOT, ...ALL_KOMBO, ...HOTEL, ...CUSTOM_HOTEL, ...MANASIK, ...SAHABAT_CLOSING];
    const vals = [id, ...mapVals([...BASE, ...DETAIL, ...SNAPSHOT, ...ALL_KOMBO, ...HOTEL, ...CUSTOM_HOTEL, ...MANASIK, ...SAHABAT_CLOSING], body)];

    const placeholders = cols.map(() => '?').join(', ');
    await pool.query(
      `INSERT INTO programs (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );
    await sinkronPerwIds(id, body.publish_type, body.perw_ids);
    await sinkronPrivateIds(id, body.publish_type, body.private_ids);

    // Link-back opsional ke ajuan Kalkulator Perwakilan asal (kalau program ini
    // dibuat lewat tombol "Buat Program Eksklusif dari Quote Ini") — murni
    // penanda administratif, gak mempengaruhi otorisasi (itu sudah beres lewat
    // sinkronPerwIds di atas berdasarkan body.perw_ids apa adanya).
    if (body.from_lead_id) {
      await pool.query('UPDATE kalkulator_perwakilan_lead SET program_id = ? WHERE id = ?', [id, body.from_lead_id]);
    }
    // Link-back sama persis, tapi buat tombol "Buat Program Eksklusif dari
    // Target Ini" di Database Jamaah Sahabat Baitullah (2026-09-19) — murni
    // penanda administratif (gak mempengaruhi otorisasi, itu sudah beres
    // lewat sinkronPrivateIds di atas berdasarkan body.private_ids apa
    // adanya). Update baris pendaftaran TERBARU milik user itu.
    if (body.from_sahabat_id) {
      await pool.query(
        'UPDATE sahabat_pendaftaran SET program_id = ? WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [id, body.from_sahabat_id]
      );
    }

    return Response.json({ message: 'Program berhasil dibuat!', id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/programs — update program (butuh body.id)
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (!body.id) return Response.json({ error: 'id program wajib diisi' }, { status: 400 });
    if (!body.tanggal_berangkat) {
      return Response.json({ error: 'Tanggal keberangkatan wajib diisi' }, { status: 400 });
    }

    const cols = [...BASE, ...DETAIL, ...SNAPSHOT, ...ALL_KOMBO, ...HOTEL, ...CUSTOM_HOTEL, ...MANASIK, ...SAHABAT_CLOSING];
    const setClause = cols.map(c => `${c} = ?`).join(', ');
    const vals = mapVals(cols, body);

    await pool.query(`UPDATE programs SET ${setClause} WHERE id = ?`, [...vals, body.id]);
    await sinkronPerwIds(body.id, body.publish_type, body.perw_ids);
    await sinkronPrivateIds(body.id, body.publish_type, body.private_ids);
    return Response.json({ message: 'Program berhasil diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/programs?id=xxx
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    // Cegah hapus kalau sudah ada booking
    const [booked] = await pool.query('SELECT COUNT(*) AS jml FROM bookings WHERE prog_id = ?', [id]);
    if (booked[0]?.jml > 0) {
      return Response.json({ error: 'Program sudah punya booking, tidak bisa dihapus. Nonaktifkan saja.' }, { status: 400 });
    }

    await pool.query('DELETE FROM programs WHERE id = ?', [id]);
    return Response.json({ message: 'Program berhasil dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
