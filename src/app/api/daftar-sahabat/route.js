import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// Formulir data diri pendaftaran sahabat (funnel "Program Sahabat Bisa
// Umroh & Haji" kerja sama BSI) — tabel staging SENDIRI (sahabat_pendaftaran),
// BUKAN numpang di agen_pendaftaran, karena funnel-nya linear 1 jalur (beda
// bentuk dari agen_pendaftaran/status-pendaftaran perwakilan yang 2-cabang
// kantor/paket). Perekrut cuma boleh anggota sahabat lain, konsisten
// dengan register/page.jsx & POST /api/auth/register.
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
      perekrut_id,
      target_minat, target_estimasi_harga,
    } = body;

    if (!nama || !nik || !wa) {
      return NextResponse.json({ error: 'Data wajib belum lengkap' }, { status: 400 });
    }
    if (!/^\d{16}$/.test(String(nik).trim())) {
      return NextResponse.json({ error: 'NIK harus 16 digit angka' }, { status: 400 });
    }

    const alamatOk = (j, nr, r, rw_, kl, kc, kt, p, n) =>
      !!(j?.trim() && nr?.trim() && r?.trim() && rw_?.trim() && kl?.trim() && kc?.trim() && kt?.trim() && p?.trim() && n?.trim());
    if (!alamatOk(jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara)) {
      return NextResponse.json({ error: 'Alamat KTP wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)' }, { status: 400 });
    }
    if (!sama_ktp && !alamatOk(jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom)) {
      return NextResponse.json({ error: 'Alamat domisili wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)' }, { status: 400 });
    }

    const [existing] = await db.query('SELECT id FROM sahabat_pendaftaran WHERE user_id = ?', [user_id]);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Anda sudah pernah mengisi data diri pendaftaran sahabat' }, { status: 409 });
    }

    // Fallback ke perekrut_id yang udah kesimpen di users (diisi pas
    // register) kalau body gak ngirim apa-apa — form ini cuma bisa
    // disubmit SEKALI (lihat guard `existing` di atas), jadi kalau body
    // kosong ke-terima mentah2 di sini, relasi referral bisa ke-NULL-in
    // permanen padahal user daftar pake link referral yang valid.
    const [[userSaatIni]] = await db.query('SELECT perekrut_id FROM users WHERE id = ?', [user_id]);
    const perekrutIdFinal = perekrut_id || userSaatIni?.perekrut_id || null;

    if (perekrutIdFinal) {
      const [p] = await db.query(
        "SELECT id FROM users WHERE id = ? AND (role = 'sahabat_baitullah' OR role_kedua = 'sahabat_baitullah') AND status = 'active'",
        [perekrutIdFinal]
      );
      if (p.length === 0) {
        return NextResponse.json({ error: 'Perekrut tidak ditemukan atau sedang tidak aktif' }, { status: 400 });
      }
      if (String(perekrutIdFinal) === String(user_id)) {
        return NextResponse.json({ error: 'Anda tidak bisa menjadi perekrut diri sendiri' }, { status: 400 });
      }
    }

    const alamatKtp = [jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara].filter(Boolean).join(', ');
    const alamatDomisili = sama_ktp
      ? alamatKtp
      : [jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom].filter(Boolean).join(', ');

    const [result] = await db.query(
      `INSERT INTO sahabat_pendaftaran
        (user_id, nama, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu,
         alamat, alamat_ktp, alamat_domisili, kode_pos, wa, email, pekerjaan,
         bank, no_rekening, nama_pemilik_rekening, foto_ktp_path, perekrut_id,
         target_minat, target_estimasi_harga, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        user_id, nama, String(nik).trim(), tempat_lahir || null, tl || null, jk || null, ibu || null,
        alamatKtp, alamatKtp, alamatDomisili, kp || null, wa, email || null, pkj || null,
        bank || null, norek || null, pemilik || null, foto_ktp_path || null, perekrutIdFinal,
        target_minat || null, target_estimasi_harga ? Number(target_estimasi_harga) : null,
      ]
    );

    // Sync ke users — pola sama dgn daftar-perwakilan: siapkanData('spk_ak', ...)
    // & halaman lain baca langsung dari users, bukan sahabat_pendaftaran.
    await db.query(
      `UPDATE users SET perekrut_id = ?, nik = ?, tempat_lahir = ?, tanggal_lahir = ?,
              jenis_kelamin = ?, nama_ibu = ?, alamat_ktp = ?, alamat_domisili = ?, kode_pos = ?,
              pekerjaan = ?, bank = ?, no_rekening = ?, nama_pemilik_rekening = ?
       WHERE id = ?`,
      [
        perekrutIdFinal, String(nik).trim(), tempat_lahir || null, tl || null,
        jk || null, ibu || null, alamatKtp, alamatDomisili, kp || null,
        pkj || null, bank || null, norek || null, pemilik || null,
        user_id,
      ]
    );

    await db.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('sahabat_baitullah', ?, 'pending')",
      [user_id]
    );

    return NextResponse.json({ success: true, message: 'Data diri tersimpan.', id: result.insertId });
  } catch (err) {
    console.error('Error daftar-sahabat:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
