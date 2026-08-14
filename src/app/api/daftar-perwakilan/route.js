import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// Formulir pendaftaran kemitraan perwakilan (role_diajukan='perwakilan' —
// satu-satunya nilai yang masih ada sejak role agen dihapus). Perekrut
// cuma boleh perwakilan lain, konsisten dgn register/page.jsx & POST
// /api/auth/register.
export async function POST(req) {
  const auth = wajibLogin(req);
  if (auth.error) return auth.error;
  const user_id = auth.user.id;

  try {
    const body = await req.json();
    const {
      nama, nik, tempat_lahir, tl, jk, ibu, foto_ktp_path,
      jalan, norumah, rt, rw, kp, kel, kec, kota, provinsi, negara,
      sama_ktp, jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom,
      wa, email, pkj,
      bank, norek, pemilik,
      perekrut_id, jadwal, metode,
    } = body;

    if (!nama || !nik || !wa || !email) {
      return NextResponse.json({ error: 'Data wajib belum lengkap' }, { status: 400 });
    }
    if (!foto_ktp_path) {
      return NextResponse.json({ error: 'Foto KTP wajib diunggah' }, { status: 400 });
    }

    if (!/^\d{16}$/.test(String(nik).trim())) {
      return NextResponse.json({ error: 'NIK harus 16 digit angka' }, { status: 400 });
    }

    const [existing] = await db.query(
      'SELECT id FROM agen_pendaftaran WHERE user_id = ? AND status != "ditolak"',
      [user_id]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Anda sudah pernah mengajukan pendaftaran kemitraan' },
        { status: 409 }
      );
    }

    if (perekrut_id) {
      const [p] = await db.query(
        "SELECT id FROM users WHERE id = ? AND role = 'perwakilan' AND status = 'active'",
        [perekrut_id]
      );
      if (p.length === 0) {
        return NextResponse.json(
          { error: 'Perekrut tidak ditemukan atau sedang tidak aktif' },
          { status: 400 }
        );
      }
      if (String(perekrut_id) === String(user_id)) {
        return NextResponse.json(
          { error: 'Anda tidak bisa menjadi perekrut diri sendiri' },
          { status: 400 }
        );
      }
    }

    const alamatKtp = [jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara]
      .filter(Boolean).join(', ');
    const alamatDomisili = sama_ktp
      ? alamatKtp
      : [jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom]
          .filter(Boolean).join(', ');

    const [result] = await db.query(
      `INSERT INTO agen_pendaftaran
        (user_id, role_diajukan, nama, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu,
         alamat, alamat_ktp, alamat_domisili, foto_ktp_path, kode_pos, wa, email, pekerjaan,
         bank, no_rekening, nama_pemilik_rekening,
         perekrut_id, jadwal_kunjungan, metode, status, created_at)
       VALUES (?, 'perwakilan', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        user_id, nama, String(nik).trim(), tempat_lahir || null, tl, jk, ibu,
        alamatKtp, alamatKtp, alamatDomisili, foto_ktp_path, kp || null, wa, email, pkj || null,
        bank, norek, pemilik,
        perekrut_id || null, jadwal || null, metode,
      ]
    );

    await db.query(
      `UPDATE users SET reg_status = 'pending_sk_bsi', reg_metode = ?, reg_jadwal = ?, perekrut_id = ?,
              tempat_lahir = ?, alamat_ktp = ?, alamat_domisili = ? WHERE id = ?`,
      [metode || null, jadwal || null, perekrut_id || null, tempat_lahir || null, alamatKtp, alamatDomisili, user_id]
    );

    return NextResponse.json({
      success: true,
      message: 'Pendaftaran berhasil dikirim, menunggu verifikasi admin',
      id: result.insertId,
    });
  } catch (err) {
    console.error('Error daftar-perwakilan:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
