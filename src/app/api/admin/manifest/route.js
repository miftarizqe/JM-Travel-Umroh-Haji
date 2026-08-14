import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { statusJamaah } from '@/app/api/admin/database/route';

// Manifest = 1 baris per JAMAAH per BOOKING program ini (bukan dedup per
// orang seperti Database Jamaah) — kalau orang yang sama umroh 2x di program
// yang sama (jarang tapi mungkin), dia harus tetap muncul 2x krn manifest
// dipakai buat keperluan visa/pesawat per keberangkatan.
export async function ambilManifest(programName) {
  const [progRows] = await pool.query(
    `SELECT name, type, kategori, tanggal_berangkat FROM programs WHERE name = ? ORDER BY created_at DESC LIMIT 1`,
    [programName]
  );
  const [bookings] = await pool.query(
    `SELECT b.id AS booking_id, b.status AS booking_status, b.jamaah_data, b.jumlah_jamaah,
            b.created_at, u.name AS pemesan_nama
     FROM bookings b LEFT JOIN users u ON u.id = b.user_id
     WHERE b.prog_name = ? ORDER BY b.created_at ASC`,
    [programName]
  );

  const rows = [];
  bookings.forEach(b => {
    const status = statusJamaah(b.booking_status);
    if (status === 'Cancel Program') return; // dikecualikan sesuai permintaan

    let jd = b.jamaah_data;
    if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
    const entries = Array.isArray(jd) && jd.length > 0 ? jd : Array.from({ length: b.jumlah_jamaah || 1 }, () => ({}));

    entries.forEach((j, idx) => {
      rows.push({
        nama: j.nama || '(formulir belum diisi)',
        jk: j.jk || '-',
        tl: j.tl || '-',
        ttl: j.ttl || null,
        paspor: j.paspor || '-',
        exp_mulai: j.exp_mulai || null,
        exp_paspor: j.exp_paspor || null,
        tkp: j.tkp || '-',
        mahram: j.mahram || '-',
        hub_mahram: j.hub_mahram || '-',
        nik: j.nik || '-',
        alamat: j.alamat || '-',
        wa: j.wa || '-',
        email: j.email || '-',
        pkj: j.pkj || '-',
        penyakit: j.penyakit || '-',
        kdnama: j.kdnama || '-',
        kdwa: j.kdwa || '-',
        kdhub: j.kdhub || '-',
        doc_paspor: j.doc_paspor || null,
        doc_kk: j.doc_kk || null,
        doc_ktp: j.doc_ktp || null,
        doc_vaksin: j.doc_vaksin || null,
        doc_foto: j.doc_foto || null,
        status_jamaah: status,
        pemesan_nama: b.pemesan_nama || '-',
        booking_id: b.booking_id,
        idx,
      });
    });
  });

  return {
    program: progRows[0] || { name: programName, type: null, kategori: null, tanggal_berangkat: null },
    rows,
  };
}

// GET /api/admin/manifest?program=<nama>
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const program = searchParams.get('program');
    if (!program) return Response.json({ error: 'Parameter program wajib diisi' }, { status: 400 });
    const data = await ambilManifest(program);
    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
