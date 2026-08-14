import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { generateNomorProposal } from '@/lib/nomorProposal';

// GET /api/admin/proposal-corporate — daftar semua proposal (ringkas)
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT id, nomor_proposal, nama_perusahaan, nama_pic_perusahaan, created_at
       FROM proposal_corporate ORDER BY created_at DESC`
    );
    return Response.json({ proposal: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST { nama_perusahaan, tujuan?, alamat_perusahaan?, nama_pic_perusahaan?, kontak_pic_perusahaan?,
//        pic_kantor_nama?, pic_kantor_kontak?, kata_pengantar?, program_ids?, custom_programs? }
// struktur_organisasi gak dipakai lagi di sini — org chart sekarang sumbernya
// satu, dari proposal_profile (diedit sekali di /admin/pengaturan/proposal-profile).
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (!body.nama_perusahaan?.trim()) {
      return Response.json({ error: 'Nama perusahaan wajib diisi' }, { status: 400 });
    }

    const nomor = await generateNomorProposal(pool);
    const [result] = await pool.query(
      `INSERT INTO proposal_corporate
         (nomor_proposal, tujuan, nama_perusahaan, alamat_perusahaan, nama_pic_perusahaan, kontak_pic_perusahaan,
          pic_kantor_nama, jabatan_pic_kantor, pic_kantor_kontak, kata_pengantar, program_ids, custom_programs, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nomor,
        body.tujuan || null,
        body.nama_perusahaan.trim(),
        body.alamat_perusahaan || null,
        body.nama_pic_perusahaan || null,
        body.kontak_pic_perusahaan || null,
        body.pic_kantor_nama || null,
        body.jabatan_pic_kantor || null,
        body.pic_kantor_kontak || null,
        body.kata_pengantar || null,
        JSON.stringify(body.program_ids || []),
        JSON.stringify(body.custom_programs || []),
        auth.user.id,
      ]
    );
    return Response.json({ message: 'Proposal dibuat!', id: result.insertId, nomor }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
