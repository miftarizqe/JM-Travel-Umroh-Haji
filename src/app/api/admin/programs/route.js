import { randomUUID } from 'crypto';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

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

// Fotokopi data modul negara (tier+addon) yang dipakai program ini, dibekukan
// pas pertama kali disimpan — lihat migration-program-katalog-modul-snapshot.sql.
// Frontend yang nentuin isinya (kapan dibekukan/disinkron ulang), di sini
// cuma nulis apa adanya yang dikirim.
const SNAPSHOT = ['katalog_modul_snapshot'];

// Nama hotel Mekkah & Madinah — beda per paket krn beda bintang hotel juga.
const HOTEL = PAKET.flatMap(p => [`hotel_mekkah_${p}`, `hotel_madinah_${p}`]);

// Nilai kolom untuk INSERT/UPDATE (dipakai POST & PUT biar konsisten)
function mapVals(cols, body) {
  return cols.map(c => {
    if (
      c === 'name' || c === 'type' || c === 'jenis_program' || c === 'tanggal' || c === 'tanggal_berangkat' ||
      c === 'highlight' || c === 'publish_type' || c === 'kategori' ||
      c === 'include_items' || c === 'exclude_items' || HOTEL.includes(c)
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
    if (c === 'active') return body.active === false ? 0 : 1;
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
      return Response.json({ program: { ...rows[0], perw_ids: perwRows.map(r => r.perw_id) } });
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

// POST /api/admin/programs — buat program baru
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
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
    const cols = ['id', ...BASE, ...DETAIL, ...SNAPSHOT, ...ALL_KOMBO, ...HOTEL];
    const vals = [id, ...mapVals([...BASE, ...DETAIL, ...SNAPSHOT, ...ALL_KOMBO, ...HOTEL], body)];

    const placeholders = cols.map(() => '?').join(', ');
    await pool.query(
      `INSERT INTO programs (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );
    await sinkronPerwIds(id, body.publish_type, body.perw_ids);

    return Response.json({ message: 'Program berhasil dibuat!', id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/programs — update program (butuh body.id)
export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (!body.id) return Response.json({ error: 'id program wajib diisi' }, { status: 400 });
    if (!body.tanggal_berangkat) {
      return Response.json({ error: 'Tanggal keberangkatan wajib diisi' }, { status: 400 });
    }

    const cols = [...BASE, ...DETAIL, ...SNAPSHOT, ...ALL_KOMBO, ...HOTEL];
    const setClause = cols.map(c => `${c} = ?`).join(', ');
    const vals = mapVals(cols, body);

    await pool.query(`UPDATE programs SET ${setClause} WHERE id = ?`, [...vals, body.id]);
    await sinkronPerwIds(body.id, body.publish_type, body.perw_ids);
    return Response.json({ message: 'Program berhasil diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/programs?id=xxx
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
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
