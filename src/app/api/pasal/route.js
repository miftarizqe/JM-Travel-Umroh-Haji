import pool from '@/lib/db';

const DOKUMEN_VALID = ['spka', 'spka_ins', 'spkl', 'jamaah', 'spk_ak', 'sk_cif'];

// GET /api/pasal?dokumen=spka — PUBLIK. Dipakai /pks (baca sebelum setuju),
// /admin/cetak-pks-mitra & /admin/cetak-perjanjian (cetak dokumen final).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dokumen = searchParams.get('dokumen');
  if (!DOKUMEN_VALID.includes(dokumen)) {
    return Response.json({ error: 'Parameter dokumen tidak valid' }, { status: 400 });
  }
  try {
    const [rows] = await pool.query(
      'SELECT nomor, judul, isi FROM dokumen_pasal WHERE dokumen = ? ORDER BY nomor ASC',
      [dokumen]
    );
    return Response.json({ pasal: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
