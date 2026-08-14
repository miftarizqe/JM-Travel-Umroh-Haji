import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const KOLOM = [
  'tagline', 'deskripsi_singkat', 'profil', 'visi', 'misi',
  'org_ceo_nama', 'org_ceo_jabatan', 'org_l2_nama', 'org_l2_jabatan', 'org_l3',
  'keutamaan', 'paket_umroh', 'perlengkapan_jamaah',
  'syarat_persyaratan_umroh', 'syarat_pembatalan_umroh', 'syarat_haji_khusus',
  'layanan_umroh_mandiri', 'wisata_non_umroh', 'dinas_dalam_negeri',
  'merk_dagang', 'no_registrasi_ghapura', 'no_sk_haji', 'no_sk_ppiu', 'no_sertifikat_ppiu',
  'dokumentasi_foto_ids',
];
const KOLOM_JSON = ['org_l3', 'dokumentasi_foto_ids'];

// GET /api/admin/proposal-profile — konten statis "Company Profile" yang
// dipakai berulang di semua Proposal Corporate.
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const [[row]] = await pool.query('SELECT * FROM proposal_profile WHERE id = 1');
    return Response.json({ profile: row });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — partial update, whitelist kolom (perlengkapan_foto & legal_dokumen
// diurus endpoint upload terpisah, gak lewat sini).
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const kolomAda = KOLOM.filter(k => k in body);
    if (kolomAda.length === 0) return Response.json({ error: 'Gak ada kolom yang dikirim' }, { status: 400 });

    const set = kolomAda.map(k => `${k} = ?`).join(', ');
    const nilai = kolomAda.map(k => KOLOM_JSON.includes(k) ? JSON.stringify(body[k] || []) : (body[k] || null));
    await pool.query(`UPDATE proposal_profile SET ${set} WHERE id = 1`, nilai);
    return Response.json({ message: 'Company Profile disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
