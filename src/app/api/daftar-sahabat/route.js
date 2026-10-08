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

    if (!nama || !nik || !wa) {
      return NextResponse.json({ error: 'Data wajib belum lengkap' }, { status: 400 });
    }
    if (!/^\d{16}$/.test(String(nik).trim())) {
      return NextResponse.json({ error: 'NIK harus 16 digit angka' }, { status: 400 });
    }
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

    const alamatOk = (j, nr, r, rw_, kl, kc, kt, p, n) =>
      !!(j?.trim() && nr?.trim() && r?.trim() && rw_?.trim() && kl?.trim() && kc?.trim() && kt?.trim() && p?.trim() && n?.trim());
    if (!alamatOk(jalan, norumah, rt, rw, kel, kec, kota, provinsi, negara)) {
      return NextResponse.json({ error: 'Alamat KTP wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)' }, { status: 400 });
    }
    if (!sama_ktp && !alamatOk(jalan_dom, norumah_dom, rt_dom, rw_dom, kel_dom, kec_dom, kota_dom, provinsi_dom, negara_dom)) {
      return NextResponse.json({ error: 'Alamat domisili wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)' }, { status: 400 });
    }
    // Nomor paspor opsional, tapi kalau diisi maks 9 karakter huruf/angka
    // (standar ICAO; paspor RI 8 karakter, mis. A1234567).
    if (no_paspor?.trim() && !/^[A-Za-z0-9]{1,9}$/.test(no_paspor.trim())) {
      return NextResponse.json({ error: 'Nomor paspor maksimal 9 karakter huruf/angka' }, { status: 400 });
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
        "SELECT id FROM users WHERE id = ? AND (role IN ('sahabat_baitullah','admin','super_admin') OR role_kedua = 'sahabat_baitullah') AND status = 'active'",
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
