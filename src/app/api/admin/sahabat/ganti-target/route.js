import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { hargaTermurahProgram } from '@/lib/harga';

// GET /api/admin/sahabat/ganti-target — daftar pengajuan ganti target yang
// masih menunggu ACC (baik pengajuan ganti BARU 'diajukan', maupun
// pengajuan PEMBATALAN 'pembatalan_diajukan', dikonfirmasi user 2026-09-30),
// buat admin/super_admin review. `tipe` diikutkan biar FE bisa bedain
// tampilan/tombolnya.
export async function GET(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT sp.id, sp.user_id, u.name AS user_name, u.kode_unik,
              sp.program_id AS target_lama_id, pl.name AS target_lama_name,
              sp.target_ganti_program_id AS target_baru_id, pb.name AS target_baru_name,
              sp.target_ganti_status AS tipe, sp.target_ganti_diajukan_at
       FROM sahabat_pendaftaran sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN programs pl ON pl.id = sp.program_id
       LEFT JOIN programs pb ON pb.id = sp.target_ganti_program_id
       WHERE sp.target_ganti_status IN ('diajukan', 'pembatalan_diajukan')
       ORDER BY sp.target_ganti_diajukan_at ASC`
    );
    return Response.json({ pengajuan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/sahabat/ganti-target  body: { user_id, action, catatan_admin }
// action: 'approve' | 'reject' — ARTINYA BEDA tergantung tipe pengajuan yang
// lagi aktif (dikonfirmasi user 2026-09-30):
//  - status 'diajukan' (pengajuan ganti target BARU): approve = program_id/
//    target_minat/target_estimasi_harga beneran ditimpa ke program baru
//    (nominal dihitung ulang server-side pakai hargaTermurahProgram, SAMA
//    PERSIS cara wizard daftar-sahabat.jsx). reject = pengajuan dibatalkan,
//    target lama tetap berlaku.
//  - status 'pembatalan_diajukan' (jamaah minta batal pengajuan yang lagi
//    jalan): approve = target_ganti_status balik NULL, target lama (yang
//    emang gak pernah disentuh) otomatis aktif lagi. reject = balik
//    'diajukan' (pengajuan ganti yang asli lanjut jalan lagi, gak jadi batal).
// SEMUA case SENGAJA TIDAK menyentuh dokumen legal yang udah ditandatangani
// ataupun data blokir rekening yang udah terkunci (dikonfirmasi user
// 2026-09-29 — perubahan target gak butuh perjanjian baru).
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { user_id, action, catatan_admin } = await request.json();
    if (!user_id || !['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'user_id dan action (approve/reject) wajib diisi' }, { status: 400 });
    }

    const [[pendaftaran]] = await pool.query(
      'SELECT id, target_ganti_program_id, target_ganti_status FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [user_id]
    );
    if (!pendaftaran) return Response.json({ error: 'Data pendaftaran tidak ditemukan' }, { status: 404 });
    if (!['diajukan', 'pembatalan_diajukan'].includes(pendaftaran.target_ganti_status)) {
      return Response.json({ error: 'Tidak ada pengajuan ganti target yang menunggu diproses untuk akun ini.' }, { status: 400 });
    }

    // Meninjau PEMBATALAN — approve = beneran batal (balik ke target lama),
    // reject = pengajuan ganti yang asli lanjut jalan lagi.
    if (pendaftaran.target_ganti_status === 'pembatalan_diajukan') {
      if (action === 'approve') {
        await pool.query(
          `UPDATE sahabat_pendaftaran
           SET target_ganti_status = 'dibatalkan', target_ganti_diproses_at = NOW(), target_ganti_catatan_admin = ?
           WHERE id = ?`,
          [catatan_admin || null, pendaftaran.id]
        );
        return Response.json({ message: 'Pembatalan disetujui — target lama aktif kembali.' });
      }
      await pool.query(
        `UPDATE sahabat_pendaftaran
         SET target_ganti_status = 'diajukan', target_ganti_diproses_at = NULL, target_ganti_catatan_admin = ?
         WHERE id = ?`,
        [catatan_admin || null, pendaftaran.id]
      );
      return Response.json({ message: 'Pembatalan ditolak — pengajuan ganti target sebelumnya lanjut menunggu ACC.' });
    }

    if (action === 'reject') {
      await pool.query(
        `UPDATE sahabat_pendaftaran
         SET target_ganti_status = 'ditolak', target_ganti_diproses_at = NOW(), target_ganti_catatan_admin = ?
         WHERE id = ?`,
        [catatan_admin || null, pendaftaran.id]
      );
      return Response.json({ message: 'Pengajuan ganti target ditolak.' });
    }

    // approve
    const [[program]] = await pool.query(
      "SELECT id, name FROM programs WHERE id = ? AND publish_type = 'sahabat_baitullah' AND active = 1",
      [pendaftaran.target_ganti_program_id]
    );
    if (!program) {
      return Response.json({ error: 'Program tujuan sudah tidak valid/aktif — tolak pengajuan ini dan minta jamaah mengajukan ulang.' }, { status: 400 });
    }
    const [[programFull]] = await pool.query('SELECT * FROM programs WHERE id = ?', [program.id]);
    const nominal = hargaTermurahProgram(programFull);

    await pool.query(
      `UPDATE sahabat_pendaftaran
       SET program_id = ?, target_minat = ?, target_estimasi_harga = ?, target_set_at = NOW(),
           target_ganti_status = 'disetujui', target_ganti_diproses_at = NOW(), target_ganti_catatan_admin = ?
       WHERE id = ?`,
      [program.id, program.name, nominal, catatan_admin || null, pendaftaran.id]
    );
    return Response.json({ message: `Target impian diperbarui ke "${program.name}".` });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
