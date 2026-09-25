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
      nama, tempat_lahir, tl, jk, ibu, foto_ktp_path,
      jalan, norumah, rt, rw, kp, kel, kec, kota, provinsi, negara,
      sama_ktp, jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom,
      pkj,
      bank, norek, pemilik,
      perekrut_id,
    } = body;

    // NIK/WA/Email SENGAJA gak diambil dari body (dikonfirmasi user
    // 2026-09-20) — data verifikasi awal yang udah dikunci sejak registrasi/
    // koreksi admin, form wizard ini cuma nampilin read-only. Sumber
    // kebenarannya SELALU dari users.
    const [[userAwal]] = await db.query(
      'SELECT role, nik, wa, email, perekrut_id, perekrut_perwakilan_jamaah_id, terverifikasi, foto_path FROM users WHERE id = ?', [user_id]
    );
    // Prasyarat dicek di server juga — gate di /daftar-perwakilan (frontend)
    // cuma tampilan, bisa dilewati dengan POST langsung ke endpoint ini.
    if (!userAwal?.terverifikasi) {
      return NextResponse.json({ error: 'Akun Anda masih menunggu verifikasi admin.' }, { status: 403 });
    }
    if (!userAwal.foto_path) {
      return NextResponse.json({ error: 'Unggah foto profil terlebih dahulu.' }, { status: 400 });
    }
    const nik = userAwal?.nik;
    const wa = userAwal?.wa;
    const email = userAwal?.email;

    if (!nama || !nik || !wa || !email) {
      return NextResponse.json({ error: 'Data wajib belum lengkap' }, { status: 400 });
    }
    if (!foto_ktp_path) {
      return NextResponse.json({ error: 'Foto KTP wajib diunggah' }, { status: 400 });
    }

    if (!/^\d{16}$/.test(String(nik).trim())) {
      return NextResponse.json({ error: 'NIK harus 16 digit angka' }, { status: 400 });
    }

    // Alamat wajib lengkap (kecuali kode pos) biar admin bisa beneran
    // ngelacak alamat jamaah/perwakilan — samain sama validStep() di
    // page.jsx, jangan cuma dicek di client (form ini bisa dipanggil
    // langsung ke API).
    const alamatOk = (j, nr, r, rw_, kl, kc, kt, p, n) =>
      !!(j?.trim() && nr?.trim() && r?.trim() && rw_?.trim() && kl?.trim() && kc?.trim() && kt?.trim() && p?.trim() && n?.trim());
    if (!alamatOk(jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara)) {
      return NextResponse.json({ error: 'Alamat KTP wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)' }, { status: 400 });
    }
    if (!sama_ktp && !alamatOk(jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom)) {
      return NextResponse.json({ error: 'Alamat domisili wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)' }, { status: 400 });
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

    // Upgrade dari jamaah dgn referral permanen (users.perekrut_perwakilan_jamaah_id,
    // dikunci sejak registrasi) -> WAJIB pakai itu, gak bisa ditimpa form
    // (form dikirim read-only utk kasus ini, lihat page.jsx). Jamaah tanpa
    // referrer permanen -> jalur lama: perekrut_id dari body, fallback ke
    // users.perekrut_id yang udah kesimpen (diisi pas register lewat link
    // referral perwakilan-ke-perwakilan) kalau body gak ngirim apa-apa —
    // sama gotcha yang udah pernah ketemu & diperbaiki di /api/daftar-sahabat:
    // form ini nge-UPDATE users.perekrut_id langsung, jadi kalau body kosong
    // ke-terima mentah2, relasi referral yang udah valid bisa ke-NULL-in
    // permanen padahal user daftar pake link referral.
    const perekrutIdFinal = userAwal?.role === 'jamaah' && userAwal?.perekrut_perwakilan_jamaah_id
      ? userAwal.perekrut_perwakilan_jamaah_id
      : (perekrut_id || userAwal?.perekrut_id || null);

    if (perekrutIdFinal) {
      const [p] = await db.query(
        "SELECT id FROM users WHERE id = ? AND (role IN ('perwakilan','admin','super_admin') OR role_kedua = 'perwakilan') AND status = 'active'",
        [perekrutIdFinal]
      );
      if (p.length === 0) {
        return NextResponse.json(
          { error: 'Perekrut tidak ditemukan atau sedang tidak aktif' },
          { status: 400 }
        );
      }
      if (String(perekrutIdFinal) === String(user_id)) {
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

    // metode/jadwal_kunjungan/alamat_kirim BELUM diisi di sini — dipindah ke
    // step /daftar-perwakilan/metode yang baru muncul SETELAH TTD digital
    // formulir & persetujuan PKS (dikonfirmasi user 2026-08-19), diisi lewat
    // PATCH /api/daftar-perwakilan/metode.
    const [result] = await db.query(
      `INSERT INTO agen_pendaftaran
        (user_id, role_diajukan, nama, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu,
         alamat, alamat_ktp, alamat_domisili, foto_ktp_path, kode_pos, wa, email, pekerjaan,
         bank, no_rekening, nama_pemilik_rekening,
         perekrut_id, jadwal_kunjungan, metode, status, created_at)
       VALUES (?, 'perwakilan', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', NOW())`,
      [
        user_id, nama, String(nik).trim(), tempat_lahir || null, tl, jk, ibu,
        alamatKtp, alamatKtp, alamatDomisili, foto_ktp_path, kp || null, wa, email, pkj || null,
        bank, norek, pemilik,
        perekrutIdFinal,
      ]
    );

    // Sync SEMUA field formulir ke users (bukan cuma sebagian kayak
    // sebelumnya) — siapkanData('formulir', ...) buat TTD digital & PDF
    // cetak-formulir-mitra baca langsung dari users, bukan agen_pendaftaran,
    // jadi kalau gak disync di sini datanya bakal kosong pas digenerate.
    // role='perwakilan' & status='pending' disamakan utk KEDUA jalur
    // onboarding (langsung daftar perwakilan ATAU upgrade dari jamaah) —
    // dibutuhkan supaya cek role di siapkanData() lolos utk jalur upgrade,
    // sekalian menyatukan perilaku dua jalur itu (dikonfirmasi via plan).
    // NIK SENGAJA gak diikutkan di sini lagi (2026-09-20) — udah dikunci,
    // nilainya emang persis sama kayak yang udah ada di users (lihat
    // userAwal di atas), gak perlu ditulis ulang.
    await db.query(
      `UPDATE users SET role = 'perwakilan', status = 'pending', reg_status = 'pending',
              reg_metode = NULL, reg_jadwal = NULL, perekrut_id = ?,
              tempat_lahir = ?, tanggal_lahir = ?, jenis_kelamin = ?, nama_ibu = ?,
              alamat_ktp = ?, alamat_domisili = ?, kode_pos = ?, pekerjaan = ?,
              bank = ?, no_rekening = ?, nama_pemilik_rekening = ?, foto_ktp_path = ?
       WHERE id = ?`,
      [
        perekrutIdFinal,
        tempat_lahir || null, tl, jk, ibu,
        alamatKtp, alamatDomisili, kp || null, pkj || null,
        bank, norek, pemilik, foto_ktp_path,
        user_id,
      ]
    );

    await db.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('perwakilan', ?, 'pending')",
      [user_id]
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
