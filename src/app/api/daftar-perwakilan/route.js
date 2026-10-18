import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { PERWAKILAN_COMING_SOON, PESAN_PERWAKILAN_COMING_SOON } from '@/lib/fiturSementara';
import { formatAlamatSatuBaris } from '@/lib/formatAlamat';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// Validasi data diri — dipakai bareng POST (isi pertama) & PUT (perbaikan
// setelah admin "Minta Perbaikan", dikonfirmasi user 2026-10-17, mirror pola
// yang sama di /api/daftar-sahabat sejak 2026-10-11). Balikin pesan error,
// atau null kalau lolos.
function cekDataDiri(body) {
  const {
    nama, tl, ayah, pendidikan, foto_ktp_path,
    jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara,
    sama_ktp, jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom,
  } = body;
  if (!nama) return 'Data wajib belum lengkap';
  if (!foto_ktp_path) return 'Foto KTP wajib diunggah';
  // Minimal 17 tahun, Nama Ayah Kandung & Pendidikan Terakhir wajib
  // (dikonfirmasi user 2026-10-08, buat syarat Siskopatuh) — dicek
  // server-side juga, bukan cuma client. Tanggal lahir SEKARANG wajib ada
  // (dikonfirmasi user 2026-10-17, samain ke /api/daftar-sahabat 2026-10-15)
  // — sebelumnya cuma divalidasi umur KALAU tl terisi, form-nya juga masih
  // auto-default ke tanggal 17-tahun-lalu jadi applicant bisa submit tanpa
  // beneran milih tanggal lahirnya sendiri.
  const lahir = tl ? new Date(tl) : null;
  if (!lahir || isNaN(lahir)) return 'Tanggal lahir wajib diisi';
  {
    const now = new Date();
    let umur = now.getFullYear() - lahir.getFullYear();
    const m = now.getMonth() - lahir.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < lahir.getDate())) umur--;
    if (umur < 17) return 'Pendaftar Perwakilan wajib minimal berusia 17 tahun';
  }
  if (!['Laki-Laki', 'Perempuan'].includes(body.jk)) return 'Jenis kelamin wajib dipilih';
  if (!ayah || !String(ayah).trim()) return 'Nama ayah kandung wajib diisi';
  if (!pendidikan || !String(pendidikan).trim()) return 'Pendidikan terakhir wajib diisi';

  // Alamat wajib lengkap (kecuali kode pos) biar admin bisa beneran
  // ngelacak alamat jamaah/perwakilan — samain sama validStep() di
  // page.jsx, jangan cuma dicek di client (form ini bisa dipanggil
  // langsung ke API).
  const alamatOk = (j, nr, r, rw_, kl, kc, kt, p, n) =>
    !!(j?.trim() && nr?.trim() && r?.trim() && rw_?.trim() && kl?.trim() && kc?.trim() && kt?.trim() && p?.trim() && n?.trim());
  if (!alamatOk(jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara)) {
    return 'Alamat KTP wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)';
  }
  if (!sama_ktp && !alamatOk(jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom)) {
    return 'Alamat domisili wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)';
  }
  return null;
}

// Formulir pendaftaran kemitraan perwakilan (role_diajukan='perwakilan' —
// satu-satunya nilai yang masih ada sejak role agen dihapus). Perekrut
// cuma boleh perwakilan lain, konsisten dgn register/page.jsx & POST
// /api/auth/register.
export async function POST(req) {
  const auth = wajibLogin(req);
  if (auth.error) return auth.error;
  if (PERWAKILAN_COMING_SOON) {
    return NextResponse.json({ error: PESAN_PERWAKILAN_COMING_SOON }, { status: 403 });
  }
  const user_id = auth.user.id;

  try {
    const body = await req.json();
    const {
      nama, tempat_lahir, tl, jk, ibu, ayah, foto_ktp_path,
      jalan, norumah, rt, rw, kp, kel, kec, kota, provinsi, negara,
      sama_ktp, jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom,
      pkj, pendidikan,
      bank, norek, pemilik,
      perekrut_id,
    } = body;

    // NIK/WA/Email SENGAJA gak diambil dari body (dikonfirmasi user
    // 2026-09-20) — data verifikasi awal yang udah dikunci sejak registrasi/
    // koreksi admin, form wizard ini cuma nampilin read-only. Sumber
    // kebenarannya SELALU dari users.
    const [[userAwal]] = await db.query(
      'SELECT role, nik, wa, email, perekrut_id, perekrut_perwakilan_jamaah_id, terverifikasi FROM users WHERE id = ?', [user_id]
    );
    // Prasyarat dicek di server juga — gate di /daftar-perwakilan (frontend)
    // cuma tampilan, bisa dilewati dengan POST langsung ke endpoint ini.
    // Gerbang "wajib unggah foto profil dulu" DICABUT (dikonfirmasi user
    // 2026-10-17) — gak ada lagi kewajiban bikin ID Card, mirror Sahabat
    // Baitullah yang dari awal emang gak punya gerbang ini sama sekali.
    if (!userAwal?.terverifikasi) {
      return NextResponse.json({ error: 'Akun Anda masih menunggu verifikasi admin.' }, { status: 403 });
    }
    const nik = userAwal?.nik;
    const wa = userAwal?.wa;
    const email = userAwal?.email;
    if (!nik || !wa || !email) {
      return NextResponse.json({ error: 'Data wajib belum lengkap' }, { status: 400 });
    }

    const errDataDiri = cekDataDiri(body);
    if (errDataDiri) return NextResponse.json({ error: errDataDiri }, { status: 400 });

    // Baris lama berstatus 'ditolak' DIABAIKAN (pattern yang udah ada dari
    // awal di sini, dikonfirmasi lagi 2026-10-03 pas diport ke
    // /api/daftar-sahabat) — admin kasih izin daftar ulang lewat action
    // 'izinkan_daftar_ulang', baris 'ditolak' lama tetap kesimpen sebagai
    // riwayat, submission ini bikin baris baru.
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

    const alamatKtp = formatAlamatSatuBaris({ jalan, norumah, rt, rw, kel, kec, kota, provinsi, kp, negara });
    const alamatDomisili = sama_ktp
      ? alamatKtp
      : formatAlamatSatuBaris({
          jalan: jalan_dom, norumah: norumah_dom, rt: rt_dom, rw: rw_dom,
          kel: kel_dom, kec: kec_dom, kota: kota_dom, provinsi: provinsi_dom, negara: negara_dom,
        });

    // metode/jadwal_kunjungan/alamat_kirim BELUM diisi di sini — dipindah ke
    // step /daftar-perwakilan/metode yang baru muncul SETELAH TTD digital
    // formulir & persetujuan PKS (dikonfirmasi user 2026-08-19), diisi lewat
    // PATCH /api/daftar-perwakilan/metode.
    const [result] = await db.query(
      `INSERT INTO agen_pendaftaran
        (user_id, role_diajukan, nama, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu, nama_ayah,
         alamat, alamat_ktp, alamat_domisili, foto_ktp_path, kode_pos, wa, email, pekerjaan, pendidikan_terakhir,
         bank, no_rekening, nama_pemilik_rekening,
         perekrut_id, jadwal_kunjungan, metode, status, created_at)
       VALUES (?, 'perwakilan', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', NOW())`,
      [
        user_id, nama, String(nik).trim(), tempat_lahir || null, tl, jk, ibu, ayah || null,
        alamatKtp, alamatKtp, alamatDomisili, foto_ktp_path, kp || null, wa, email, pkj || null, pendidikan || null,
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
              tempat_lahir = ?, tanggal_lahir = ?, jenis_kelamin = ?, nama_ibu = ?, nama_ayah = ?,
              alamat_ktp = ?, alamat_domisili = ?, alamat = ?, kode_pos = ?, pekerjaan = ?, pendidikan_terakhir = ?,
              alamat_ktp_jalan = ?, alamat_ktp_no_rumah = ?, alamat_ktp_rt = ?, alamat_ktp_rw = ?,
              alamat_ktp_kelurahan = ?, alamat_ktp_kecamatan = ?, alamat_ktp_kota = ?,
              alamat_ktp_provinsi = ?, alamat_ktp_negara = ?,
              bank = ?, no_rekening = ?, nama_pemilik_rekening = ?, foto_ktp_path = ?
       WHERE id = ?`,
      [
        perekrutIdFinal,
        tempat_lahir || null, tl, jk, ibu, ayah || null,
        alamatKtp, alamatDomisili, alamatDomisili || alamatKtp || null, kp || null, pkj || null, pendidikan || null,
        jalan || null, norumah || null, rt || null, rw || null,
        kel || null, kec || null, kota || null,
        provinsi || null, negara || null,
        bank, norek, pemilik, foto_ktp_path,
        user_id,
      ]
    );

    await db.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('perwakilan', ?, 'pending')",
      [user_id]
    );

    // Notifikasi admin — sebelumnya GAK ADA notifikasi di titik "pendaftar
    // baru isi formulir", baru muncul di step Metode (akhir funnel), persis
    // kondisi yang udah diperbaiki di /api/daftar-sahabat 2026-10-03
    // (dikonfirmasi user 2026-10-17 buat diikutkan ke perwakilan juga — titik
    // paling awal yang actionable buat admin).
    await kirimNotifikasiAdmin(db, {
      tipe: 'perwakilan_pendaftar_baru',
      judul: 'Pendaftar Perwakilan Baru',
      pesan: `${nama} baru mengisi formulir pendaftaran Perwakilan.`,
      link: '/admin/perwakilan',
    }).catch(() => {});

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

// Baris pendaftaran terbaru yang lagi diminta perbaikan admin (action
// 'minta_perbaikan' di /api/status-pendaftaran), atau undefined.
async function barisPerluPerbaikan(user_id) {
  const [[row]] = await db.query(
    `SELECT id, status, perbaikan_diminta_at FROM agen_pendaftaran
     WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [user_id]
  );
  return row?.perbaikan_diminta_at && row.status !== 'ditolak' && row.status !== 'active' ? row : undefined;
}

// GET — isian lama buat form perbaikan (mirror /api/daftar-sahabat,
// dikonfirmasi user 2026-10-17). { perlu_perbaikan: false } kalau gak lagi
// diminta perbaikan.
export async function GET(req) {
  const auth = wajibLogin(req);
  if (auth.error) return auth.error;
  try {
    const baris = await barisPerluPerbaikan(auth.user.id);
    if (!baris) return NextResponse.json({ perlu_perbaikan: false });
    const [[ap]] = await db.query(
      `SELECT ap.nama, ap.tempat_lahir, DATE_FORMAT(ap.tanggal_lahir, '%Y-%m-%d') AS tl, ap.jenis_kelamin,
              ap.nama_ibu, ap.nama_ayah, ap.kode_pos, ap.pekerjaan, ap.pendidikan_terakhir, ap.foto_ktp_path,
              ap.bank, ap.no_rekening, ap.nama_pemilik_rekening,
              ap.alamat_ktp, ap.alamat_domisili, ap.catatan_admin,
              u.alamat_ktp_jalan, u.alamat_ktp_no_rumah, u.alamat_ktp_rt, u.alamat_ktp_rw, u.alamat_ktp_kelurahan,
              u.alamat_ktp_kecamatan, u.alamat_ktp_kota, u.alamat_ktp_provinsi, u.alamat_ktp_negara
       FROM agen_pendaftaran ap JOIN users u ON u.id = ap.user_id
       WHERE ap.id = ?`, [baris.id]
    );
    // Alamat domisili cuma kesimpen 1 baris teks (gak terstruktur), jadi
    // kalau beda dari KTP kolomnya dikosongin & teks lamanya ditampilin
    // sebagai petunjuk di form.
    const samaKtp = !ap.alamat_domisili || ap.alamat_domisili === ap.alamat_ktp;
    return NextResponse.json({
      perlu_perbaikan: true,
      catatan: ap.catatan_admin,
      alamat_domisili_lama: samaKtp ? null : ap.alamat_domisili,
      data: {
        nama: ap.nama || '', tempat_lahir: ap.tempat_lahir || '', tl: ap.tl || '', jk: ap.jenis_kelamin || '',
        ibu: ap.nama_ibu || '', ayah: ap.nama_ayah || '', foto_ktp_path: ap.foto_ktp_path || '',
        jalan: ap.alamat_ktp_jalan || '', norumah: ap.alamat_ktp_no_rumah || '', rt: ap.alamat_ktp_rt || '', rw: ap.alamat_ktp_rw || '',
        kp: ap.kode_pos || '', kel: ap.alamat_ktp_kelurahan || '', kec: ap.alamat_ktp_kecamatan || '', kota: ap.alamat_ktp_kota || '',
        provinsi: ap.alamat_ktp_provinsi || '', negara: ap.alamat_ktp_negara || 'Indonesia',
        sama_ktp: samaKtp,
        pkj: ap.pekerjaan || '', pendidikan: ap.pendidikan_terakhir || '',
        bank: ap.bank || '', norek: ap.no_rekening || '', pemilik: ap.nama_pemilik_rekening || '',
      },
    });
  } catch (err) {
    console.error('Error GET daftar-perwakilan:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — kirim perbaikan data diri (mirror /api/daftar-sahabat, dikonfirmasi
// user 2026-10-17). Update baris pendaftaran yang SAMA (progres setuju
// PKS/metode TETAP, cuma data diri yang diubah), kosongkan flag perbaikan
// biar admin bisa ACC lagi.
export async function PUT(req) {
  const auth = wajibLogin(req);
  if (auth.error) return auth.error;
  const user_id = auth.user.id;
  try {
    const baris = await barisPerluPerbaikan(user_id);
    if (!baris) {
      return NextResponse.json({ error: 'Pendaftaran Anda tidak sedang diminta perbaikan data.' }, { status: 400 });
    }
    const body = await req.json();
    const {
      nama, tempat_lahir, tl, jk, ibu, ayah, foto_ktp_path,
      jalan, norumah, rt, rw, kp, kel, kec, kota, provinsi, negara,
      sama_ktp, jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom,
      pkj, pendidikan, bank, norek, pemilik,
    } = body;

    const errDataDiri = cekDataDiri(body);
    if (errDataDiri) return NextResponse.json({ error: errDataDiri }, { status: 400 });

    const alamatKtp = formatAlamatSatuBaris({ jalan, norumah, rt, rw, kel, kec, kota, provinsi, kp, negara });
    const alamatDomisili = sama_ktp
      ? alamatKtp
      : formatAlamatSatuBaris({
          jalan: jalan_dom, norumah: norumah_dom, rt: rt_dom, rw: rw_dom,
          kel: kel_dom, kec: kec_dom, kota: kota_dom, provinsi: provinsi_dom, negara: negara_dom,
        });

    await db.query(
      `UPDATE agen_pendaftaran SET nama = ?, tempat_lahir = ?, tanggal_lahir = ?, jenis_kelamin = ?, nama_ibu = ?, nama_ayah = ?,
              alamat = ?, alamat_ktp = ?, alamat_domisili = ?, kode_pos = ?, pekerjaan = ?, pendidikan_terakhir = ?,
              bank = ?, no_rekening = ?, nama_pemilik_rekening = ?, foto_ktp_path = ?, perbaikan_diminta_at = NULL
       WHERE id = ?`,
      [
        nama, tempat_lahir || null, tl, jk, ibu, ayah || null,
        alamatKtp, alamatKtp, alamatDomisili, kp || null, pkj || null, pendidikan || null,
        bank, norek, pemilik, foto_ktp_path, baris.id,
      ]
    );
    // Sync ke users, sama kayak POST (halaman lain baca dari users).
    await db.query(
      `UPDATE users SET tempat_lahir = ?, tanggal_lahir = ?,
              jenis_kelamin = ?, nama_ibu = ?, nama_ayah = ?, alamat_ktp = ?, alamat_domisili = ?, alamat = ?, kode_pos = ?,
              alamat_ktp_jalan = ?, alamat_ktp_no_rumah = ?, alamat_ktp_rt = ?, alamat_ktp_rw = ?,
              alamat_ktp_kelurahan = ?, alamat_ktp_kecamatan = ?, alamat_ktp_kota = ?,
              alamat_ktp_provinsi = ?, alamat_ktp_negara = ?,
              pekerjaan = ?, pendidikan_terakhir = ?, bank = ?, no_rekening = ?, nama_pemilik_rekening = ?, foto_ktp_path = ?
       WHERE id = ?`,
      [
        tempat_lahir || null, tl,
        jk, ibu, ayah || null, alamatKtp, alamatDomisili, alamatDomisili || alamatKtp || null, kp || null,
        jalan || null, norumah || null, rt || null, rw || null,
        kel || null, kec || null, kota || null,
        provinsi || null, negara || null,
        pkj || null, pendidikan || null, bank, norek, pemilik, foto_ktp_path,
        user_id,
      ]
    );

    await db.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('perwakilan', ?, 'perbaikan_dikirim')",
      [user_id]
    );
    await kirimNotifikasiAdmin(db, {
      tipe: 'perwakilan_perbaikan_dikirim',
      judul: 'Perbaikan Data Perwakilan',
      pesan: `${nama} sudah memperbaiki data diri pendaftaran Perwakilan.`,
      link: '/admin/perwakilan',
    }).catch(() => {});

    return NextResponse.json({ success: true, message: 'Perbaikan data terkirim. Pendaftaran Anda akan ditinjau ulang admin.' });
  } catch (err) {
    console.error('Error PUT daftar-perwakilan:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
