import pool from '@/lib/db';

// sk_cif / spk_ak / spk_ak_nonis (dan surat_pemblokiran) SENGAJA gak ada —
// teks resminya dari template PDF (src/lib/dokumenTemplate.js), 2026-10-01.
// Catatan: route ini gak dipakai di prod (Caddy kirim /api/pasal ke Go).
const DOKUMEN_VALID = ['spka', 'spka_ins', 'spkl', 'jamaah', 'ganti_target_sahabat'];

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
