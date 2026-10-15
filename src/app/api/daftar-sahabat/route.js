import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { hargaTermurahProgram } from '@/lib/harga';
import { hariIniWib, SQL_JADWAL_BELUM_LEWAT } from '@/lib/jadwalTarget';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { formatAlamatSatuBaris } from '@/lib/formatAlamat';

// Formulir data diri pendaftaran sahabat (funnel "Program Sahabat Bisa
// Umroh & Haji" kerja sama BSI) — tabel staging SENDIRI (sahabat_pendaftaran),
// BUKAN numpang di agen_pendaftaran, karena funnel-nya linear 1 jalur (beda
// bentuk dari agen_pendaftaran/status-pendaftaran perwakilan yang 2-cabang
// kantor/paket). Perekrut cuma boleh anggota sahabat lain, konsisten
// dengan register/page.jsx & POST /api/auth/register.

// Validasi field data diri — dipakai bareng POST (isi pertama) & PUT
// (perbaikan setelah admin "Minta Perbaikan", 2026-10-11). Balikin pesan
// error, atau null kalau lolos. nik/wa dari users (dikunci, bukan body).
function cekDataDiri(body, nik, wa) {
  const {
    nama, tl, jk, ayah, pendidikan,
    jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara,
    sama_ktp, jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom,
    no_paspor,
  } = body;
  if (!nama || !nik || !wa) {
    return 'Data wajib belum lengkap';
  }
  if (!/^\d{16}$/.test(String(nik).trim())) {
    return 'NIK harus 16 digit angka';
  }
  // Minimal 17 tahun, Nama Ayah Kandung & Pendidikan Terakhir wajib
  // (dikonfirmasi user 2026-10-08, buat syarat Siskopatuh) — dicek
  // server-side juga, bukan cuma client, biar gak bisa dilewatin via
  // request langsung ke endpoint ini.
  // Tanggal lahir & jenis kelamin WAJIB (2026-10-15) — form-nya gak
  // di-autofill lagi (dulu default tgl 17 tahun lalu & "Laki-Laki"), jadi
  // dicek di sini juga biar gak bisa kosong lewat request langsung.
  const lahir = tl ? new Date(tl) : null;
  if (!lahir || isNaN(lahir)) {
    return 'Tanggal lahir wajib diisi';
  }
  {
    const now = new Date();
    let umur = now.getFullYear() - lahir.getFullYear();
    const m = now.getMonth() - lahir.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < lahir.getDate())) umur--;
    if (umur < 17) {
      return 'Pendaftar Sahabat Baitullah wajib minimal berusia 17 tahun';
    }
  }
  if (!['Laki-Laki', 'Perempuan'].includes(jk)) {
    return 'Jenis kelamin wajib dipilih';
  }
  if (!ayah || !String(ayah).trim()) {
    return 'Nama ayah kandung wajib diisi';
  }
  if (!pendidikan || !String(pendidikan).trim()) {
    return 'Pendidikan terakhir wajib diisi';
  }
  const alamatOk = (j, nr, r, rw_, kl, kc, kt, p, n) =>
    !!(j?.trim() && nr?.trim() && r?.trim() && rw_?.trim() && kl?.trim() && kc?.trim() && kt?.trim() && p?.trim() && n?.trim());
  if (!alamatOk(jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara)) {
    return 'Alamat KTP wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)';
  }
  if (!sama_ktp && !alamatOk(jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom)) {
    return 'Alamat domisili wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)';
  }
  // Nomor paspor opsional, tapi kalau diisi maks 9 karakter huruf/angka
  // (standar ICAO; paspor RI 8 karakter, mis. A1234567).
  if (no_paspor?.trim() && !/^[A-Za-z0-9]{1,9}$/.test(no_paspor.trim())) {
    return 'Nomor paspor maksimal 9 karakter huruf/angka';
  }
  return null;
}

export async function POST(req) {
  const auth = wajibLogin(req);
  if (auth.error) return auth.error;
  const user_id = auth.user.id;

  try {
    const body = await req.json();
    const {
      nama, tempat_lahir, tl, jk, ibu, ayah, foto_ktp_path,
      jalan, norumah, rt, rw, kp, kel, kec, kota, provinsi, negara,
      sama_ktp, jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom,
      pkj, pendidikan,
      no_paspor, tempat_keluar_paspor, masa_berlaku_paspor_dari, masa_berlaku_paspor_sampai, foto_paspor_path,
      bank, norek, pemilik,
      // perekrut_id / target_minat / target_estimasi_harga SENGAJA gak dibaca
      // dari body — ditentukan server (lihat di bawah, 2026-10-01).
      target_program_id,
    } = body;

    // NIK/WA/Email SENGAJA gak diambil dari body sama sekali (dikonfirmasi
    // user 2026-09-20) — itu data verifikasi awal yang udah dikunci sejak
    // registrasi/koreksi admin, form wizard ini cuma nampilin read-only,
    // gak boleh nyelundup ganti lewat body request langsung juga. Sumber
    // kebenarannya SELALU dari users, bukan input jamaah lagi.
    // Verifikasi akun admin BUKAN lagi gerbang di sini (dikonfirmasi user
    // 2026-09-27) — data diri boleh diisi begitu akun dibuat, biar alurnya
    // 1 kesatuan tanpa nunggu di tengah jalan. Verifikasi admin tetap ada,
    // cuma dipindah jadi syarat aktivasi akun di ujung (lihat action
    // 'advance' ke 'active' di /api/status-pendaftaran-sahabat).
    const [[userSaatIni0]] = await db.query('SELECT nik, wa, email, perekrut_id FROM users WHERE id = ?', [user_id]);
    const nik = userSaatIni0?.nik;
    const wa = userSaatIni0?.wa;
    const email = userSaatIni0?.email;

    const errDataDiri = cekDataDiri(body, nik, wa);
    if (errDataDiri) return NextResponse.json({ error: errDataDiri }, { status: 400 });
    // Target wajib diisi (dikonfirmasi user 2026-09-19), dan sejak
    // 2026-09-20 wajib pilih Program Eksklusif Sahabat Baitullah yang
    // beneran ada (publish_type='sahabat_baitullah'), bukan teks bebas lagi
    // — target_minat/target_estimasi_harga sekarang diturunkan dari program
    // itu di frontend, target_program_id di sini cuma divalidasi ada &
    // valid publish_type-nya biar gak dipalsuin lewat body request langsung.
    if (!target_program_id) {
      return NextResponse.json({ error: 'Target impian (Program Eksklusif) wajib dipilih' }, { status: 400 });
    }
    const [[programTarget]] = await db.query(
      `SELECT * FROM programs WHERE id = ? AND publish_type = 'sahabat_baitullah' AND active = 1 AND ${SQL_JADWAL_BELUM_LEWAT}`,
      [target_program_id, hariIniWib()]
    );
    if (!programTarget) {
      return NextResponse.json({ error: 'Program target tidak valid atau jadwal keberangkatannya sudah lewat' }, { status: 400 });
    }
    // Nama & harga target DIHITUNG SERVER dari data program (dikonfirmasi user
    // 2026-10-01: logika sensitif di BE) — target_minat/target_estimasi_harga
    // kiriman client diabaikan. Rumus sama dengan tampilan FE (lib/harga.js).
    // Harga dikunci di nilai saat memilih (aturan E), disimpan sekali di bawah.
    const targetMinatServer = programTarget.name;
    const targetHargaServer = hargaTermurahProgram(programTarget);
    if (!(targetHargaServer > 0)) {
      return NextResponse.json({ error: 'Harga program target belum tersedia — pilih program lain atau hubungi admin' }, { status: 400 });
    }

    // Baris lama berstatus 'ditolak' DIABAIKAN (dikonfirmasi user 2026-10-03,
    // samain pola daftar-perwakilan) — admin kasih izin daftar ulang lewat
    // action 'izinkan_daftar_ulang', baris 'ditolak' lama tetap kesimpen
    // sebagai riwayat, submission ini bikin baris baru.
    const [existing] = await db.query("SELECT id FROM sahabat_pendaftaran WHERE user_id = ? AND status != 'ditolak'", [user_id]);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Anda sudah pernah mengisi data diri pendaftaran sahabat' }, { status: 409 });
    }

    // Fallback ke perekrut_id yang udah kesimpen di users (diisi pas
    // register) kalau body gak ngirim apa-apa — form ini cuma bisa
    // disubmit SEKALI (lihat guard `existing` di atas), jadi kalau body
    // kosong ke-terima mentah2 di sini, relasi referral bisa ke-NULL-in
    // permanen padahal user daftar pake link referral yang valid.
    //
    // Upline TIDAK BISA DIGANTI (dikonfirmasi user 2026-10-01): selalu pakai
    // perekrut yang tersimpan sejak register; perekrut_id kiriman client
    // diabaikan. Akun lama yang belum punya upline wajib kirim kode undangan,
    // dan server sendiri yang menentukan perekrutnya.
    let perekrutIdFinal = userSaatIni0?.perekrut_id || null;
    if (!perekrutIdFinal) {
      const kodeUndangan = String(body.kode_undangan || '').trim().toUpperCase();
      if (!kodeUndangan) {
        return NextResponse.json({ error: 'Pendaftaran Sahabat Baitullah hanya bisa lewat link undangan. Akun Anda belum punya pengajak — hubungi admin JM Travel.' }, { status: 400 });
      }
      const [[pengundang]] = await db.query(
        `SELECT id FROM users WHERE kode_invite_sahabat = ?
           AND (role IN ('sahabat_baitullah','admin','super_admin','hop') OR role_kedua = 'sahabat_baitullah')
           AND status = 'active' LIMIT 1`,
        [kodeUndangan]
      );
      if (!pengundang) {
        return NextResponse.json({ error: 'Kode undangan tidak valid atau pemiliknya sedang tidak aktif.' }, { status: 400 });
      }
      perekrutIdFinal = pengundang.id;
    }

    if (perekrutIdFinal) {
      const [p] = await db.query(
        "SELECT id FROM users WHERE id = ? AND (role IN ('sahabat_baitullah','admin','super_admin','hop') OR role_kedua = 'sahabat_baitullah') AND status = 'active'",
        [perekrutIdFinal]
      );
      if (p.length === 0) {
        return NextResponse.json({ error: 'Perekrut tidak ditemukan atau sedang tidak aktif' }, { status: 400 });
      }
      if (String(perekrutIdFinal) === String(user_id)) {
        return NextResponse.json({ error: 'Anda tidak bisa menjadi perekrut diri sendiri' }, { status: 400 });
      }
    }

    const alamatKtp = formatAlamatSatuBaris({ jalan, norumah, rt, rw, kel, kec, kota, provinsi, kp, negara });
    const alamatDomisili = sama_ktp
      ? alamatKtp
      : formatAlamatSatuBaris({
          jalan: jalan_dom, norumah: norumah_dom, rt: rt_dom, rw: rw_dom,
          kel: kel_dom, kec: kec_dom, kota: kota_dom, provinsi: provinsi_dom, negara: negara_dom,
        });

    const [result] = await db.query(
      `INSERT INTO sahabat_pendaftaran
        (user_id, nama, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu, nama_ayah,
         alamat, alamat_ktp, alamat_domisili, kode_pos, wa, email, pekerjaan, pendidikan_terakhir,
         no_paspor, tempat_keluar_paspor, masa_berlaku_paspor_dari, masa_berlaku_paspor_sampai, foto_paspor_path,
         bank, no_rekening, nama_pemilik_rekening, foto_ktp_path, perekrut_id,
         target_minat, target_estimasi_harga, program_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        user_id, nama, String(nik).trim(), tempat_lahir || null, tl || null, jk || null, ibu || null, ayah || null,
        alamatKtp, alamatKtp, alamatDomisili, kp || null, wa, email || null, pkj || null, pendidikan || null,
        no_paspor?.trim() || null, tempat_keluar_paspor || null, masa_berlaku_paspor_dari || null, masa_berlaku_paspor_sampai || null, foto_paspor_path || null,
        bank || null, norek || null, pemilik || null, foto_ktp_path || null, perekrutIdFinal,
        targetMinatServer, targetHargaServer, target_program_id,
      ]
    );

    // Sync ke users — pola sama dgn daftar-perwakilan: siapkanData('spk_ak', ...)
    // & halaman lain baca langsung dari users, bukan sahabat_pendaftaran.
    // NIK SENGAJA gak diikutkan di sini lagi (2026-09-20) — udah dikunci,
    // nilainya emang persis sama kayak yang udah ada di users (lihat
    // userSaatIni0 di atas), gak perlu ditulis ulang.
    await db.query(
      `UPDATE users SET perekrut_id = ?, tempat_lahir = ?, tanggal_lahir = ?,
              jenis_kelamin = ?, nama_ibu = ?, nama_ayah = ?, alamat_ktp = ?, alamat_domisili = ?, alamat = ?, kode_pos = ?,
              alamat_ktp_jalan = ?, alamat_ktp_no_rumah = ?, alamat_ktp_rt = ?, alamat_ktp_rw = ?,
              alamat_ktp_kelurahan = ?, alamat_ktp_kecamatan = ?, alamat_ktp_kota = ?,
              alamat_ktp_provinsi = ?, alamat_ktp_negara = ?,
              pekerjaan = ?, pendidikan_terakhir = ?, bank = ?, no_rekening = ?, nama_pemilik_rekening = ?,
              no_paspor = ?, tempat_keluar_paspor = ?, masa_berlaku_paspor_dari = ?, masa_berlaku_paspor_sampai = ?, foto_paspor_path = ?
       WHERE id = ?`,
      [
        perekrutIdFinal, tempat_lahir || null, tl || null,
        jk || null, ibu || null, ayah || null, alamatKtp, alamatDomisili, alamatDomisili || alamatKtp || null, kp || null,
        jalan || null, norumah || null, rt || null, rw || null,
        kel || null, kec || null, kota || null,
        provinsi || null, negara || null,
        pkj || null, pendidikan || null, bank || null, norek || null, pemilik || null,
        no_paspor?.trim() || null, tempat_keluar_paspor || null, masa_berlaku_paspor_dari || null, masa_berlaku_paspor_sampai || null, foto_paspor_path || null,
        user_id,
      ]
    );

    await db.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('sahabat_baitullah', ?, 'pending')",
      [user_id]
    );

    // Notifikasi admin — sebelumnya GAK ADA notifikasi sama sekali di titik
    // "pendaftar baru daftar" (cuma ada di step Metode TTD, ditemukan user
    // 2026-10-03: notifikasi kerasa kurang lengkap, kejadian penting macam
    // ini gak kelihatan). Ini titik paling awal yang actionable buat admin.
    await kirimNotifikasiAdmin(db, {
      tipe: 'sahabat_pendaftar_baru',
      judul: 'Pendaftar Sahabat Baitullah Baru',
      pesan: `${nama} baru mengisi data diri pendaftaran Sahabat Baitullah.`,
      link: '/admin/sahabat',
    }).catch(() => {});

    return NextResponse.json({ success: true, message: 'Data diri tersimpan.', id: result.insertId });
  } catch (err) {
    console.error('Error daftar-sahabat:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// Baris pendaftaran terbaru yang lagi diminta perbaikan admin (action
// 'minta_perbaikan' di /api/status-pendaftaran-sahabat), atau undefined.
async function barisPerluPerbaikan(user_id) {
  const [[row]] = await db.query(
    `SELECT id, status, perbaikan_diminta_at FROM sahabat_pendaftaran
     WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [user_id]
  );
  return row?.perbaikan_diminta_at && row.status !== 'ditolak' && row.status !== 'active' ? row : undefined;
}

// GET — isian lama buat form perbaikan (dikonfirmasi user 2026-10-11).
// { perlu_perbaikan: false } kalau gak lagi diminta perbaikan.
export async function GET(req) {
  const auth = wajibLogin(req);
  if (auth.error) return auth.error;
  try {
    const baris = await barisPerluPerbaikan(auth.user.id);
    if (!baris) return NextResponse.json({ perlu_perbaikan: false });
    const [[sp]] = await db.query(
      `SELECT sp.nama, sp.tempat_lahir, DATE_FORMAT(sp.tanggal_lahir, '%Y-%m-%d') AS tl, sp.jenis_kelamin, sp.nama_ibu, sp.nama_ayah,
              sp.kode_pos, sp.pekerjaan, sp.pendidikan_terakhir, sp.foto_ktp_path,
              sp.no_paspor, sp.tempat_keluar_paspor,
              DATE_FORMAT(sp.masa_berlaku_paspor_dari, '%Y-%m-%d') AS masa_berlaku_paspor_dari,
              DATE_FORMAT(sp.masa_berlaku_paspor_sampai, '%Y-%m-%d') AS masa_berlaku_paspor_sampai,
              sp.foto_paspor_path, sp.alamat_ktp, sp.alamat_domisili, sp.target_minat, sp.catatan_admin,
              u.alamat_ktp_jalan, u.alamat_ktp_no_rumah, u.alamat_ktp_rt, u.alamat_ktp_rw, u.alamat_ktp_kelurahan,
              u.alamat_ktp_kecamatan, u.alamat_ktp_kota, u.alamat_ktp_provinsi, u.alamat_ktp_negara
       FROM sahabat_pendaftaran sp JOIN users u ON u.id = sp.user_id
       WHERE sp.id = ?`, [baris.id]
    );
    // Alamat domisili cuma kesimpen 1 baris teks (gak terstruktur), jadi
    // kalau beda dari KTP kolomnya dikosongin & teks lamanya ditampilin
    // sebagai petunjuk di form.
    const samaKtp = !sp.alamat_domisili || sp.alamat_domisili === sp.alamat_ktp;
    return NextResponse.json({
      perlu_perbaikan: true,
      catatan: sp.catatan_admin,
      alamat_domisili_lama: samaKtp ? null : sp.alamat_domisili,
      target_minat: sp.target_minat,
      data: {
        nama: sp.nama || '', tempat_lahir: sp.tempat_lahir || '', tl: sp.tl || '', jk: sp.jenis_kelamin || 'Laki-Laki',
        ibu: sp.nama_ibu || '', ayah: sp.nama_ayah || '', foto_ktp_path: sp.foto_ktp_path || '',
        jalan: sp.alamat_ktp_jalan || '', norumah: sp.alamat_ktp_no_rumah || '', rt: sp.alamat_ktp_rt || '', rw: sp.alamat_ktp_rw || '',
        kp: sp.kode_pos || '', kel: sp.alamat_ktp_kelurahan || '', kec: sp.alamat_ktp_kecamatan || '', kota: sp.alamat_ktp_kota || '',
        provinsi: sp.alamat_ktp_provinsi || '', negara: sp.alamat_ktp_negara || 'Indonesia',
        sama_ktp: samaKtp,
        pkj: sp.pekerjaan || '', pendidikan: sp.pendidikan_terakhir || '',
        no_paspor: sp.no_paspor || '', tempat_keluar_paspor: sp.tempat_keluar_paspor || '',
        masa_berlaku_paspor_dari: sp.masa_berlaku_paspor_dari || '', masa_berlaku_paspor_sampai: sp.masa_berlaku_paspor_sampai || '',
        foto_paspor_path: sp.foto_paspor_path || '',
      },
    });
  } catch (err) {
    console.error('Error GET daftar-sahabat:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — kirim perbaikan data diri (dikonfirmasi user 2026-10-11). Update
// baris pendaftaran yang SAMA (progres bukti TF/rekening/dokumen tetap),
// kosongkan flag perbaikan biar admin bisa ACC lagi. Target impian SENGAJA
// gak ikut diubah di sini — ganti target punya alur sendiri (harga dikunci,
// lihat /api/sahabat/ganti-target).
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
      pkj, pendidikan,
      no_paspor, tempat_keluar_paspor, masa_berlaku_paspor_dari, masa_berlaku_paspor_sampai, foto_paspor_path,
    } = body;

    const [[u]] = await db.query('SELECT nik, wa FROM users WHERE id = ?', [user_id]);
    const errDataDiri = cekDataDiri(body, u?.nik, u?.wa);
    if (errDataDiri) return NextResponse.json({ error: errDataDiri }, { status: 400 });
    if (!foto_ktp_path) return NextResponse.json({ error: 'Foto KTP wajib diunggah' }, { status: 400 });

    const alamatKtp = formatAlamatSatuBaris({ jalan, norumah, rt, rw, kel, kec, kota, provinsi, kp, negara });
    const alamatDomisili = sama_ktp
      ? alamatKtp
      : formatAlamatSatuBaris({
          jalan: jalan_dom, norumah: norumah_dom, rt: rt_dom, rw: rw_dom,
          kel: kel_dom, kec: kec_dom, kota: kota_dom, provinsi: provinsi_dom, negara: negara_dom,
        });
    const paspor = [
      no_paspor?.trim() || null, tempat_keluar_paspor || null, masa_berlaku_paspor_dari || null,
      masa_berlaku_paspor_sampai || null, foto_paspor_path || null,
    ];

    await db.query(
      `UPDATE sahabat_pendaftaran SET nama = ?, tempat_lahir = ?, tanggal_lahir = ?, jenis_kelamin = ?, nama_ibu = ?, nama_ayah = ?,
              alamat = ?, alamat_ktp = ?, alamat_domisili = ?, kode_pos = ?, pekerjaan = ?, pendidikan_terakhir = ?,
              no_paspor = ?, tempat_keluar_paspor = ?, masa_berlaku_paspor_dari = ?, masa_berlaku_paspor_sampai = ?, foto_paspor_path = ?,
              foto_ktp_path = ?, perbaikan_diminta_at = NULL
       WHERE id = ?`,
      [
        nama, tempat_lahir || null, tl || null, jk || null, ibu || null, ayah || null,
        alamatKtp, alamatKtp, alamatDomisili, kp || null, pkj || null, pendidikan || null,
        ...paspor, foto_ktp_path, baris.id,
      ]
    );
    // Sync ke users, sama kayak POST (halaman lain baca dari users).
    await db.query(
      `UPDATE users SET tempat_lahir = ?, tanggal_lahir = ?,
              jenis_kelamin = ?, nama_ibu = ?, nama_ayah = ?, alamat_ktp = ?, alamat_domisili = ?, alamat = ?, kode_pos = ?,
              alamat_ktp_jalan = ?, alamat_ktp_no_rumah = ?, alamat_ktp_rt = ?, alamat_ktp_rw = ?,
              alamat_ktp_kelurahan = ?, alamat_ktp_kecamatan = ?, alamat_ktp_kota = ?,
              alamat_ktp_provinsi = ?, alamat_ktp_negara = ?,
              pekerjaan = ?, pendidikan_terakhir = ?,
              no_paspor = ?, tempat_keluar_paspor = ?, masa_berlaku_paspor_dari = ?, masa_berlaku_paspor_sampai = ?, foto_paspor_path = ?
       WHERE id = ?`,
      [
        tempat_lahir || null, tl || null,
        jk || null, ibu || null, ayah || null, alamatKtp, alamatDomisili, alamatDomisili || alamatKtp || null, kp || null,
        jalan || null, norumah || null, rt || null, rw || null,
        kel || null, kec || null, kota || null,
        provinsi || null, negara || null,
        pkj || null, pendidikan || null,
        ...paspor, user_id,
      ]
    );

    await db.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('sahabat_baitullah', ?, 'perbaikan_dikirim')",
      [user_id]
    );
    await kirimNotifikasiAdmin(db, {
      tipe: 'sahabat_perbaikan_dikirim',
      judul: 'Perbaikan Data Sahabat Baitullah',
      pesan: `${nama} sudah memperbaiki data diri pendaftaran Sahabat Baitullah.`,
      link: '/admin/sahabat',
    }).catch(() => {});

    return NextResponse.json({ success: true, message: 'Perbaikan data terkirim. Pendaftaran Anda akan ditinjau ulang admin.' });
  } catch (err) {
    console.error('Error PUT daftar-sahabat:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
