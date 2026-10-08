import pool from '@/lib/db';
import { statusKeaktifanUjroh } from '@/lib/keaktifanSahabat';
import { saldoSahabat, catatPerubahanSaldo } from '@/lib/saldoSahabat';
import { wajibLogin, wajibRole } from '@/lib/auth';
import { pastikanKodeInviteSahabat } from '@/lib/kodeInvitePerwakilan';
import { pastikanKodeUnik } from '@/lib/kodeUnik';
import { kirimSpkAkTunggalUntukTtd } from '@/app/api/admin/dokumen-signature/route';
import { SPK_AK_SEMENTARA_FISIK } from '@/lib/spkAkFlag';
import { releaseNomorSuratJikaBulanSama } from '@/lib/nomorSurat';

// Urutan step pendaftaran sahabat — LINEAR, beda bentuk dari perwakilan
// (yang punya 2 cabang kantor/paket) makanya sengaja tabel & endpoint
// terpisah (sahabat_pendaftaran), bukan numpang di agen_pendaftaran/
// status-pendaftaran. Voucher Rp1jt SENGAJA TIDAK ada di sini — bukan
// gate, admin bisa terbitkan kapan saja lewat POST /api/admin/vouchers
// biasa (akses_role='akun'), gak menghalangi step lain (dikonfirmasi user).
//
// Step 'pending' TIDAK LAGI butuh admin verify_tf (2026-09-02) — Sahabat
// Baitullah cuma bisa daftar via referral, jadi TF auto-verified &
// auto-maju ke 'menunggu_sk_cif' begitu diunggah (lihat
// /api/sahabat/upload-bukti-tf). Step 'menunggu_bsi' DIHAPUS (2026-09-19)
// — gerbang toggle admin akun_bsi_status/tabungan_haji_status sebelum
// jamaah bisa isi CIF dicabut, jamaah langsung isi CIF + data blokir
// begitu bukti TF terverifikasi. Gate kepercayaan sekarang ada di 2
// titik: ACC voucher (vouchers.disetujui_at) dan advance ke 'active'
// (masih wajib CIF + baca-setuju SK-CIF/Surat Kuasa Blokir + aksi admin
// eksplisit — scan fisik BUKAN lagi syarat ACC, boleh nyusul).
export const STEP_PENDAFTARAN_SAHABAT = [
  { key: 'pending', label: 'Upload Bukti Transfer', urut: 1 },
  { key: 'menunggu_sk_cif', label: 'Menunggu ACC Admin', urut: 2 },
  { key: 'active', label: 'Jamaah Sahabat Baitullah Aktif', urut: 3 },
];

// GET /api/status-pendaftaran-sahabat — status pendaftaran milik user login
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [users] = await pool.query(
      `SELECT id, name, role, status, terverifikasi, foto_path, setuju_pks, agama,
              no_rekening_tabungan_umroh, nama_pemilik_rekening_umroh, bantuan_bsi_manual_disetujui_at, setuju_sk_cif_pemblokiran_at,
              dokumen_spk_ak_fisik_path, dokumen_sk_cif_fisik_path,
              dokumen_surat_pemblokiran_fisik_path, nominal_blokir_tabungan, jangka_waktu_blokir_hari, tanggal_mulai_blokir,
              metode_ttd_sahabat, rencana_kunjungan_kantor_at, dokumen_spk_ak_dikirim_balik_at,
              dokumen_cif_fisik_diterima_at, dokumen_pemblokiran_fisik_diterima_at, dokumen_spk_ak_fisik_diterima_at
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (users.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    const u = users[0];

    // tanggal_berangkat program target diikutkan (dikonfirmasi user
    // 2026-09-29) — dipakai FE buat pratinjau langsung berapa hari jangka
    // waktu blokir bakal jadi begitu jamaah pilih "Tanggal Mulai Blokir"
    // (dihitung otomatis sampai keberangkatan, lihat
    // /api/sahabat/blokir-rekening — bukan fix 90 hari lagi).
    const [kp] = await pool.query(
      `SELECT sp.*, p.tanggal_berangkat
       FROM sahabat_pendaftaran sp LEFT JOIN programs p ON p.id = sp.program_id
       WHERE sp.user_id = ? ORDER BY sp.id DESC LIMIT 1`,
      [auth.user.id]
    );
    const pendaftaran = kp[0] || null;

    // Dokumen SPK-AK-nya beda buat anggota non-Muslim (spk_ak_nonis,
    // dikonfirmasi user 2026-09-20). SPK-AK sekarang 1 RANGKAP
    // (rangkap='tunggal', dikonfirmasi user 2026-09-29 — dulu 2 rangkap
    // 'travel'/'luar' terpisah, sekarang 1 file, Pihak Pertama statis di
    // template, cuma Jamaah/Agen yang beneran TTD).
    const dokumenSpkAk = u.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
    const [[sigSpkAk]] = await pool.query(
      `SELECT id, fase FROM dokumen_signature WHERE dokumen = ? AND rangkap = 'tunggal' AND ref_id = ? ORDER BY id DESC LIMIT 1`,
      [dokumenSpkAk, auth.user.id]
    );

    // Selesai = ADMIN konfirmasi fisik sudah diterima di kantor
    // (dokumen_*_fisik_diterima_at) — BUKAN lagi jamaah unggah scan sendiri
    // (dikonfirmasi user 2026-10-03, scan-upload dicabut dari sisi jamaah).
    const spkAkSelesai = (sigSpkAk?.fase === 'selesai') || !!u.dokumen_spk_ak_fisik_diterima_at;
    const skCifSelesai = !!u.dokumen_cif_fisik_diterima_at;
    const suratPemblokiranSelesai = !!u.dokumen_pemblokiran_fisik_diterima_at;

    const prasyarat = {
      akun_terverifikasi: !!u.terverifikasi,
      foto_profil: !!u.foto_path,
      data_diri_terkirim: !!pendaftaran,
      bukti_tf_uploaded: !!pendaftaran?.bukti_tf_path,
      bukti_tf_verified: !!pendaftaran?.bukti_tf_verified_at,
      bukti_tf_path: pendaftaran?.bukti_tf_path || null,
      // Jamaah SETUJU SPK-AK (checkbox di /pks) — dipakai sebagai gerbang
      // funnel (dikonfirmasi user 2026-09-28), BEDA dari spk_ak_selesai di
      // bawah (materai+TTD beneran, baru diproses pas admin klik "Aktifkan").
      spk_ak_disetujui: !!u.setuju_pks,
      spk_ak_selesai: spkAkSelesai,
      // Bantuan BSI manual (dikonfirmasi user 2026-10-03) -- gak semua KTP
      // bisa daftar via BYOND self-service, jamaah yang kejebak bisa setuju
      // identitasnya diserahkan JM Travel ke BSI. Setelah setuju, step ini
      // dianggap selesai WALAU rekeningnya masih kosong (diisi admin manual
      // belakangan begitu BSI kelar proses).
      rekening_umroh_terisi: !!u.no_rekening_tabungan_umroh || !!u.bantuan_bsi_manual_disetujui_at,
      blokir_data_terisi: !!(u.nominal_blokir_tabungan && u.jangka_waktu_blokir_hari && u.tanggal_mulai_blokir),
      setuju_sk_cif_pemblokiran: !!u.setuju_sk_cif_pemblokiran_at,
      sk_cif_selesai: skCifSelesai,
      surat_pemblokiran_selesai: suratPemblokiranSelesai,
    };

    const statusSekarang = pendaftaran?.status || null;
    const stepSekarang = STEP_PENDAFTARAN_SAHABAT.find(s => s.key === statusSekarang) || null;

    // Riwayat bertanggal buat popup di /profil.
    const [history] = await pool.query(
      "SELECT status_baru, catatan, created_at FROM pendaftaran_status_log WHERE tipe = 'sahabat_baitullah' AND user_id = ? ORDER BY created_at ASC",
      [auth.user.id]
    );

    return Response.json({
      user: {
        id: u.id, name: u.name, role: u.role, status: u.status,
        terverifikasi: !!u.terverifikasi, foto_path: u.foto_path, setuju_pks: !!u.setuju_pks,
        no_rekening_tabungan_umroh: u.no_rekening_tabungan_umroh,
        nama_pemilik_rekening_umroh: u.nama_pemilik_rekening_umroh,
        bantuan_bsi_manual_disetujui_at: u.bantuan_bsi_manual_disetujui_at,
        setuju_sk_cif_pemblokiran_at: u.setuju_sk_cif_pemblokiran_at,
        dokumen_spk_ak_fisik_path: u.dokumen_spk_ak_fisik_path, dokumen_sk_cif_fisik_path: u.dokumen_sk_cif_fisik_path,
        dokumen_surat_pemblokiran_fisik_path: u.dokumen_surat_pemblokiran_fisik_path,
        nominal_blokir_tabungan: u.nominal_blokir_tabungan, jangka_waktu_blokir_hari: u.jangka_waktu_blokir_hari,
        tanggal_mulai_blokir: u.tanggal_mulai_blokir,
        metode_ttd_sahabat: u.metode_ttd_sahabat, rencana_kunjungan_kantor_at: u.rencana_kunjungan_kantor_at,
        dokumen_spk_ak_dikirim_balik_at: u.dokumen_spk_ak_dikirim_balik_at,
      },
      pendaftaran,
      steps: STEP_PENDAFTARAN_SAHABAT,
      step_sekarang: stepSekarang,
      prasyarat,
      spk_ak_signature_id: sigSpkAk?.id || null,
      history,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/status-pendaftaran-sahabat — aksi admin, body: { action, user_id, ... }
// action: 'verify_tf' | 'advance' | 'reject' | 'izinkan_daftar_ulang'
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { action, user_id } = body;
    if (!action || !user_id) {
      return Response.json({ error: 'action dan user_id wajib diisi' }, { status: 400 });
    }

    const [kpRows] = await pool.query('SELECT * FROM sahabat_pendaftaran WHERE user_id = ?', [user_id]);
    if (kpRows.length === 0) return Response.json({ error: 'Pendaftaran sahabat tidak ditemukan' }, { status: 404 });
    const p = kpRows[0];

    if (action === 'reject') {
      await pool.query("UPDATE sahabat_pendaftaran SET status = 'ditolak', catatan_admin = ? WHERE user_id = ?", [body.catatan_admin || null, user_id]);
      await pool.query("UPDATE users SET status = 'rejected' WHERE id = ?", [user_id]);
      await pool.query(
        "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('sahabat_baitullah', ?, 'ditolak', ?)",
        [user_id, body.catatan_admin || null]
      );
      // Lepas nomor surat yang sempat kebakar (dibaca jamaah sebelum ditolak)
      // biar bisa dipakai ulang jamaah lain bulan ini (dikonfirmasi user
      // 2026-10-03) — no-op kalau kolomnya kosong atau beda bulan.
      await releaseNomorSuratJikaBulanSama(pool, user_id, 'no_spk_ak', 'JSB');
      await releaseNomorSuratJikaBulanSama(pool, user_id, 'no_spk_ak_nonis', 'JSB-NM');
      await releaseNomorSuratJikaBulanSama(pool, user_id, 'no_sk_cif', 'SK-CIF');
      await releaseNomorSuratJikaBulanSama(pool, user_id, 'no_surat_pemblokiran', 'SURAT-PEMBLOKIRAN');
      return Response.json({ message: 'Pendaftaran sahabat ditolak.' });
    }

    // Admin kasih kesempatan kedua ke akun yang sebelumnya ditolak — buka
    // login lagi (users.status balik 'pending') & izinkan isi ulang form
    // daftar-sahabat (lihat guard di /api/daftar-sahabat yang sekarang
    // ngabaikan baris lama berstatus 'ditolak', dikonfirmasi user 2026-10-03).
    // Baris sahabat_pendaftaran lama TETAP 'ditolak' sebagai riwayat —
    // submission berikutnya bikin baris baru.
    if (action === 'izinkan_daftar_ulang') {
      if (p.status !== 'ditolak') {
        return Response.json({ error: 'Cuma pendaftaran yang statusnya ditolak yang bisa diizinkan daftar ulang' }, { status: 400 });
      }
      await pool.query("UPDATE users SET status = 'pending' WHERE id = ?", [user_id]);
      await pool.query(
        "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('sahabat_baitullah', ?, 'diizinkan_daftar_ulang', ?)",
        [user_id, body.catatan_admin || null]
      );
      return Response.json({ message: 'Akun diizinkan daftar ulang — jamaah bisa login & isi ulang data pendaftaran.' });
    }

    if (action === 'verify_tf') {
      // Fallback legacy — jalur normal sekarang auto-verify di
      // /api/sahabat/upload-bukti-tf (lihat catatan di STEP_PENDAFTARAN_SAHABAT
      // di atas). Endpoint ini dibiarkan hidup buat baris lama yang somehow
      // masih nyangkut 'pending' dengan bukti_tf_path terisi tapi belum verified.
      if (!p.bukti_tf_path) return Response.json({ error: 'Bukti transfer belum diunggah' }, { status: 400 });
      if (p.status !== 'pending') return Response.json({ error: 'Bukti transfer sudah diverifikasi.' }, { status: 400 });
      await pool.query(
        "UPDATE sahabat_pendaftaran SET bukti_tf_verified_at = NOW(), status = 'menunggu_sk_cif' WHERE user_id = ?",
        [user_id]
      );
      await pool.query(
        "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('sahabat_baitullah', ?, 'menunggu_sk_cif')",
        [user_id]
      );
      return Response.json({ message: 'Bukti transfer diverifikasi, lanjut isi data blokir rekening.' });
    }

    if (action === 'toggle_cif_fisik') {
      // Informasional doang — tracking "dokumen CIF fisik udah sampai
      // kantor, siap diterusin ke BSI", TIDAK ikut validasi prasyarat
      // advance ke 'active' (beda dari CIF number & scan SK-CIF yang tetap
      // wajib) — dikonfirmasi user 2026-08-30, jangan sampai jamaah nunggu
      // logistik surat fisik buat bisa aktif.
      await pool.query(
        'UPDATE users SET dokumen_cif_fisik_diterima_at = ? WHERE id = ?',
        [body.value ? new Date() : null, user_id]
      );
      return Response.json({ message: 'Status dokumen CIF fisik diperbarui.' });
    }

    // Mirror toggle_cif_fisik buat 2 dokumen lain (dikonfirmasi user
    // 2026-10-03) — sejak scan-upload gak lagi jadi sinyal utama (opsional,
    // boleh nyusul), yang beneran berguna buat admin itu "dokumen fisik
    // aslinya udah nyampe di kantor apa belum" per-dokumen (khusus jamaah
    // yang pilih metode TTD "kirim" — yang "kantor" gak butuh ini sama
    // sekali, dokumennya diserahkan langsung di tempat).
    if (action === 'toggle_pemblokiran_fisik') {
      await pool.query(
        'UPDATE users SET dokumen_pemblokiran_fisik_diterima_at = ? WHERE id = ?',
        [body.value ? new Date() : null, user_id]
      );
      return Response.json({ message: 'Status dokumen Surat Pemblokiran fisik diperbarui.' });
    }

    if (action === 'toggle_spk_ak_fisik') {
      await pool.query(
        'UPDATE users SET dokumen_spk_ak_fisik_diterima_at = ? WHERE id = ?',
        [body.value ? new Date() : null, user_id]
      );
      return Response.json({ message: 'Status dokumen Surat Perjanjian Jamaah Sahabat Baitullah fisik diperbarui.' });
    }

    // Tracking "1 rangkap SPK-AK yang sudah di-TTD & di-materai kantor udah
    // dikirim balik ke jamaah" (dikonfirmasi user 2026-09-30, cuma relevan
    // buat jamaah yang pilih metode 'kirim' — kalau 'kantor' gak perlu
    // kirim-balik apa2, semua kelar di tempat).
    if (action === 'toggle_spk_ak_dikirim_balik') {
      await pool.query(
        'UPDATE users SET dokumen_spk_ak_dikirim_balik_at = ? WHERE id = ?',
        [body.value ? new Date() : null, user_id]
      );
      return Response.json({ message: 'Status pengiriman balik Surat Perjanjian Jamaah Sahabat Baitullah diperbarui.' });
    }

    if (action === 'advance') {
      const { status_baru } = body;
      const skrgIdx = STEP_PENDAFTARAN_SAHABAT.findIndex(s => s.key === p.status);
      const tujuanIdx = STEP_PENDAFTARAN_SAHABAT.findIndex(s => s.key === status_baru);
      if (tujuanIdx === -1) return Response.json({ error: 'Status tujuan tidak valid' }, { status: 400 });
      if (p.status === 'active' || p.status === 'ditolak') {
        return Response.json({ error: `Pendaftaran ini sudah "${STEP_PENDAFTARAN_SAHABAT.find(s => s.key === p.status)?.label || p.status}", tidak bisa dimajukan lagi.` }, { status: 400 });
      }
      if (tujuanIdx !== skrgIdx + 1) {
        return Response.json({ error: `Tidak boleh melompat step. Selesaikan "${STEP_PENDAFTARAN_SAHABAT[skrgIdx + 1]?.label}" dulu.` }, { status: 400 });
      }

      // Validasi prasyarat SPESIFIK per transisi target (bukan cuma urutan).
      // 'menunggu_sk_cif' sendiri sudah gak dicapai lewat action ini lagi
      // (auto-set langsung di /api/sahabat/upload-bukti-tf begitu bukti TF
      // terverifikasi) — satu-satunya transisi admin yang tersisa di sini
      // adalah ke 'active'.
      const [[u]] = await pool.query(
        `SELECT kode_unik, agama, setuju_pks, setuju_sk_cif_pemblokiran_at, dokumen_spk_ak_fisik_diterima_at,
                no_rekening_tabungan_umroh, bantuan_bsi_manual_disetujui_at
         FROM users WHERE id = ?`, [user_id]
      );
      // SPK-AK sekarang 1 RANGKAP (rangkap='tunggal', dikonfirmasi user
      // 2026-09-29). Dokumen SPK-AK-nya beda buat anggota non-Muslim
      // (spk_ak_nonis, dikonfirmasi user 2026-09-20).
      const dokumenSpkAk = u.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
      const [[sigSpkAk]] = await pool.query(
        `SELECT fase FROM dokumen_signature WHERE dokumen = ? AND rangkap = 'tunggal' AND ref_id = ? ORDER BY id DESC LIMIT 1`, [dokumenSpkAk, user_id]
      );
      const spkAkSelesai = (sigSpkAk?.fase === 'selesai') || !!u.dokumen_spk_ak_fisik_diterima_at;

      if (status_baru === 'active') {
        // Urutan wajib linear (dikonfirmasi user 2026-09-27): bukti TF -> SPK-AK
        // -> rekening tabungan umroh -> CIF & blokir. Dipaksa juga di sini
        // (bukan cuma gate UI di status-pendaftaran-sahabat/page.jsx) biar
        // gak bisa dilewatin lewat panggilan API admin langsung.
        //
        // Verifikasi akun terpisah SENGAJA GAK ADA di sini (dicoba, lalu
        // dicabut lagi, dikonfirmasi user 2026-09-27) — akun Sahabat
        // Baitullah sekarang auto-terverifikasi pas daftar (lihat
        // /api/auth/register), soalnya mau di-ACC admin manual apa enggak,
        // akun ini tetep gak bisa ngapa-ngapain sebelum funnel di bawah ini
        // selesai — admin ttp review manual di titik "Aktifkan" ini juga.
        // spk_ak_selesai (materai+TTD beneran) SENGAJA BUKAN gate di sini
        // lagi (dikonfirmasi user 2026-09-28) — itu justru baru DIPROSES di
        // titik ini (lihat pemanggilan kirimDokumenRangkapUntukTtd di bawah).
        // Syaratnya sekarang cuma "udah setuju" (checkbox di /pks).
        if (!u.setuju_pks) return Response.json({ error: 'Surat Perjanjian Jamaah Sahabat Baitullah belum disetujui jamaah' }, { status: 400 });
        if (!p.bukti_tf_verified_at) return Response.json({ error: 'Bukti transfer belum diverifikasi' }, { status: 400 });
        // Rekening boleh kosong kalau jamaah udah setuju dibantuin BSI manual
        // (dikonfirmasi user 2026-10-03) -- admin boleh aktifkan akunnya
        // duluan, isi no_rekening_tabungan_umroh belakangan begitu BSI
        // selesai proses (lihat Database Jamaah).
        if (!u.no_rekening_tabungan_umroh && !u.bantuan_bsi_manual_disetujui_at) {
          return Response.json({ error: 'Rekening Tabungan Umroh belum diisi' }, { status: 400 });
        }
        // No. CIF BSI DICABUT dari syarat (dikonfirmasi user 2026-09-27) —
        // gak perlu diisi jamaah lagi sama sekali, di funnel maupun gate ini.
        // Scan fisik SK-CIF/Surat Pemblokiran SENGAJA BUKAN lagi syarat ACC
        // (dikonfirmasi user 2026-09-19) — boleh nyusul dikirim setelah
        // akun aktif. Yang wajib cuma persetujuan baca "SK-CIF & Surat
        // Kuasa Blokir Rekening" ini sendiri.
        if (!u.setuju_sk_cif_pemblokiran_at) return Response.json({ error: 'Jamaah belum menyetujui SK-CIF & Surat Kuasa Blokir Rekening' }, { status: 400 });

        // Titik pemicu materai + sesi TTD digital SPK-AK yang SEBENARNYA
        // (dikonfirmasi user 2026-09-28) — begitu admin klik "Aktifkan" &
        // semua syarat di atas lolos, di sinilah 2x e-materai beneran dibeli
        // (nanti kalau provider Mekari/Privy disambung) & PDF (dari template
        // final, 1 rangkap) dikirim buat TTD digital Jamaah/Agen. Guard
        // `!spkAkSelesai` jaga-jaga dobel klik (upsert di prosesSatuSesiDigital
        // bakal RESET sesi yang udah selesai kalau dipanggil ulang — jangan
        // sampai kejadian).
        // SPK_AK_SEMENTARA_FISIK true -> SKIP dispatch digital sama sekali
        // (dikonfirmasi user 2026-09-30, vendor esign belum siap). Jamaah
        // TTD fisik nyusul setelah aktif (sama pola CIF/Pemblokiran di
        // bawah) lewat /admin/cetak-spk-ak (self-service) atau datang kantor
        // (metode_ttd_sahabat) — BUKAN gate wajib sebelum aktivasi.
        if (!spkAkSelesai && !SPK_AK_SEMENTARA_FISIK) {
          const baseUrl = new URL(request.url).origin;
          await kirimSpkAkTunggalUntukTtd({ dokumen: dokumenSpkAk, refId: user_id, actorUser: auth.user, baseUrl });
        }
      }

      await pool.query('UPDATE sahabat_pendaftaran SET status = ?, catatan_admin = ? WHERE user_id = ?', [status_baru, body.catatan_admin || null, user_id]);
      await pool.query(
        "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('sahabat_baitullah', ?, ?, ?)",
        [user_id, status_baru, body.catatan_admin || null]
      );

      if (status_baru === 'active') {
        await pool.query(
          "UPDATE users SET status = 'active', perekrut_id = COALESCE(perekrut_id, ?) WHERE id = ?",
          [p.perekrut_id || null, user_id]
        );
        // Kode undangan rekrut-sahabat-baru — digenerate sekali di sini
        // (gerbang wajib pendaftaran akun Sahabat Baitullah baru, mirror
        // kode_invite_perwakilan, dikonfirmasi user 2026-09-03), no-op
        // kalau sudah pernah punya.
        await pastikanKodeInviteSahabat(pool, user_id);
        // Kode unik (SBJMxxxx) — baru dijatah SEKARANG, akun beneran aktif
        // (dikonfirmasi user 2026-09-07), bukan pas daftar.
        await pastikanKodeUnik(pool, user_id, 'sahabat_baitullah');

        // Program "Sahabat Baitullah": setoran Rp1jt jemaah baru dipecah jadi
        // ujroh 5 generasi ke atas rantai referral + tabungan awal jemaah
        // sendiri + komisi Head of Program (registrasi) — SEMUA dipicu di
        // titik yang sama ini (status jadi 'active'), gantiin komisi flat
        // sekali-per-rekrutan yang lama. Guard sekali di awal (bukan per
        // baris) biar gak dobel kalau endpoint ini kepanggil ulang.
        const [[sudahAda]] = await pool.query(
          "SELECT 1 AS ada FROM komisi_ledger WHERE ref_id = ? AND jenis IN ('komisi_sahabat','tabungan_awal_sahabat')",
          [user_id]
        );
        if (!sudahAda) {
          const [[pengaturan]] = await pool.query(
            `SELECT sahabat_gen1_nominal, sahabat_gen2_nominal, sahabat_gen3_nominal, sahabat_gen4_nominal, sahabat_gen5_nominal,
                    sahabat_tabungan_awal_nominal, sahabat_head_of_program_nominal, head_of_program_user_id
             FROM pengaturan WHERE id = 1`
          );
          const genNominal = [
            pengaturan?.sahabat_gen1_nominal, pengaturan?.sahabat_gen2_nominal, pengaturan?.sahabat_gen3_nominal,
            pengaturan?.sahabat_gen4_nominal, pengaturan?.sahabat_gen5_nominal,
          ];

          // Jalan ke ATAS rantai perekrut_id maks 5 hop (kebalikan
          // apakahDalamJaringan di src/lib/jaringan.js yang jalan ke atas
          // buat VALIDASI — di sini beneran buat NGUMPULIN daftar ancestor).
          //
          // 3 kasus jatah gen JANGAN dibayar ke ancestor, dialihkan ke
          // operasional_sahabat:
          //  1. Rantai abis sebelum 5 hop (gak ada lagi perekrut di atas) —
          //     dulu jatah gen yang gak kebagian ini SAMA SEKALI gak
          //     tercatat kemana pun, sekarang wajib balik ke operasional,
          //     bukan hilang (dikonfirmasi user 2026-09-06).
          //  2. Ancestor di posisi itu kebetulan Head of Program — HOP
          //     SELALU cuma dapet flat Rp100rb (jatah registrasi di bawah)
          //     gak peduli posisinya di rantai, biar gak dibayar dobel
          //     (dikonfirmasi user 2026-09-06).
          //  3. Ancestor-nya admin/super_admin — akun ini direkrut LANGSUNG
          //     manajemen JM Travel lewat link referral admin (lihat
          //     /api/admin/kode-invite), bukan rantai member-ke-member,
          //     jadi gak ada ujroh yang dibagi-bagi ke "atasan" (admin
          //     bukan penerima ujroh) — SELURUH rantai di atas titik ini pun
          //     ikut mati (chain-nya emang berhenti di situ, admin gak
          //     punya perekrut_id sendiri) — dikonfirmasi user 2026-09-19.
          //  4. Ancestor TIDAK AKTIF menurut aturan keaktifan ujroh (akun bukan
          //     'active', atau 6 bulan tanpa Gen1 aktif baru — lihat
          //     src/lib/keaktifanSahabat.js, dikonfirmasi user 2026-10-02).
          //     Jatah level itu ke operasional; upline di atasnya TETAP dapat
          //     jatah level masing-masing (bukan dinaikkan/dikompresi).
          const hopUserId = pengaturan?.head_of_program_user_id || null;
          let operasionalTambahan = 0;
          let current = p.perekrut_id;
          let rantaiAbis = false;
          for (let gen = 0; gen < 5; gen++) {
            const nominal = Number(genNominal[gen] || 0);
            let ancestor = null;
            if (!rantaiAbis && current) {
              const [[found]] = await pool.query('SELECT id, name, role, status, perekrut_id FROM users WHERE id = ?', [current]);
              if (found) { ancestor = found; current = found.perekrut_id; }
              else rantaiAbis = true;
            } else {
              rantaiAbis = true;
            }
            // HoP role 'hop' = management (2026-10-03), diperlakukan sama seperti admin.
            const ancestorManajemen = ancestor && ['admin', 'super_admin', 'hop'].includes(ancestor.role);
            if (nominal > 0) {
              const ancestorAktif = ancestor && !ancestorManajemen && !(hopUserId && ancestor.id === hopUserId)
                && (await statusKeaktifanUjroh(pool, ancestor.id)).aktif;
              if (ancestorAktif) {
                await pool.query(
                  `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan, level)
                   VALUES (NULL, ?, ?, ?, 'komisi_sahabat', 1, ?, ?, ?)`,
                  [user_id, ancestor.id, ancestor.name || null, nominal, `Ujroh Generasi ${gen + 1} — atas nama ${p.nama} (Kode Agen: ${u.kode_unik || '-'})`, gen + 1]
                );
              } else {
                operasionalTambahan += nominal;
              }
            }
            if (ancestorManajemen) { current = null; rantaiAbis = true; }
          }

          // Tabungan awal jemaah baru itu sendiri — LANGSUNG dikonfirmasi_at
          // (dikonfirmasi user 2026-09-30, bukan lagi kewajiban TF JM Travel:
          // jemaah buka rekening sendiri & setor Rp100rb sendiri ke rekening
          // tabungan umroh mereka). Beda dari komisi_sahabat/HOP di atas yang
          // beneran uang JM Travel keluar & masih lewat approval/TF mingguan
          // — baris ini SENGAJA gak masuk JENIS_UJROH (pengajuan-ujroh/
          // route.js) biar gak nyangkut nunggu ACC bos buat sesuatu yang
          // gak pernah butuh TF beneran.
          const tabunganAwal = Number(pengaturan?.sahabat_tabungan_awal_nominal || 0);
          if (tabunganAwal > 0) {
            const saldoSebelum = await saldoSahabat(pool, user_id);
            const [insTabungan] = await pool.query(
              `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan, dikonfirmasi_at)
               VALUES (NULL, ?, ?, ?, 'tabungan_awal_sahabat', 1, ?, ?, NOW())`,
              [user_id, user_id, p.nama, tabunganAwal, 'Saldo awal tabungan umroh — pendaftaran Sahabat Baitullah (setor mandiri jemaah)']
            );
            await catatPerubahanSaldo(pool, {
              actor: auth.user, userId: user_id, saldoSebelum,
              aksi: 'sahabat_tabungan_awal', target_type: 'komisi_ledger', target_id: String(insTabungan.insertId),
              keterangan: `Saldo awal tabungan Rp${tabunganAwal.toLocaleString('id-ID')} saat akun ${p.nama} diaktifkan`,
            });
          }

          // Komisi Head of Program (registrasi) — cuma kalau akunnya udah
          // ditunjuk lewat pengaturan.
          const hopNominal = Number(pengaturan?.sahabat_head_of_program_nominal || 0);
          // Jatah HoP cuma "terpakai" kalau HoP beneran sudah ditunjuk. Kalau
          // belum, jatahnya MASUK ke Operasional Management di bawah — bukan
          // ikut dipotong lalu gak tercatat di mana pun (bug 2026-10-01:
          // pendaftaran adit 30 Sep cuma tercatat Rp900rb dari Rp1jt).
          const hopTerpakai = (pengaturan?.head_of_program_user_id && hopNominal > 0) ? hopNominal : 0;
          if (hopTerpakai > 0) {
            const [[hop]] = await pool.query('SELECT name FROM users WHERE id = ?', [pengaturan.head_of_program_user_id]);
            await pool.query(
              `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan)
               VALUES (NULL, ?, ?, ?, 'head_of_program_registrasi', 1, ?, ?)`,
              [user_id, pengaturan.head_of_program_user_id, hop?.name || null, hopNominal, `Komisi registrasi dari ${p.nama}`]
            );
          }

          // Saldo operasional management — sisa dari Rp1.000.000 setelah
          // Gen1-5 + HOP + tabungan awal (dikonfirmasi user 2026-09-06,
          // sebelumnya potongan ini SAMA SEKALI gak ada baris ledger-nya,
          // cuma "tersirat" di selisih rekening_ledger). DITAMBAH jatah gen
          // yang gak kebagian ke ancestor beneran (lihat loop Gen1-5 di
          // atas) — baik karena rantai perekrut abis sebelum 5 hop, maupun
          // karena ancestor-nya kebetulan Head of Program (yang tetap cuma
          // dapet flat 100rb) — dua-duanya balik kesini, bukan hilang.
          const sumGenNominal = genNominal.reduce((s, n) => s + Number(n || 0), 0);
          const operasionalFlat = Math.max(0, 1000000 - sumGenNominal - hopTerpakai - tabunganAwal);
          const operasionalTotal = operasionalFlat + operasionalTambahan;
          if (operasionalTotal > 0) {
            await pool.query(
              `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan)
               VALUES (NULL, ?, 'operasional_sahabat', 'Operasional Management', 'operasional_sahabat', 1, ?, ?)`,
              [
                user_id, operasionalTotal,
                operasionalTambahan > 0
                  ? `Sisa pendaftaran ${p.nama} (Rp${operasionalFlat.toLocaleString('id-ID')}) + jatah gen yang gak kebagian ke ancestor beneran (Rp${operasionalTambahan.toLocaleString('id-ID')}) — rantai perekrut abis, kena HOP, dan/atau upline tidak aktif (aturan 6 bulan)`
                  : `Sisa pendaftaran Sahabat Baitullah — atas nama ${p.nama} (Kode Agen: ${u.kode_unik || '-'})`,
              ]
            );

            // Rekening — SEBELUMNYA dicatat keluar LALU masuk lagi (2 baris
            // netral) biar kelihatan "titik" alokasi di riwayat rekening ini.
            // DIHAPUS 2026-10-05 (dikonfirmasi user) -- dananya emang gak
            // pernah kemana-mana (netral ke saldo), tapi pasangan keluar+masuk
            // ini bikin total Masuk & Keluar bulanan di halaman Rekening
            // 3-Bank sama-sama kegedean secara artifisial padahal gak ada
            // uang yang beneran bergerak. komisi_ledger di atas TETAP ada
            // (itu yang dipakai buat laporan komisi/alokasi), cuma baris
            // rekening_ledger-nya yang dibuang.
          }

          // Voucher Rp1jt AUTO-generate SEKALIGUS AUTO-APPROVE begitu akun
          // aktif (disetujui_at langsung diisi NOW(), bukan NULL lagi —
          // dikonfirmasi user 2026-09-27/28, gerbang ACC manual admin
          // dicabut: titik "Aktifkan" akun ITU SENDIRI udah jadi review
          // manual admin, ACC voucher terpisah cuma nambah 1 klik yang gak
          // perlu & dulu bikin jamaah mentok di checkout). Lihat
          // cariVoucherValid() di src/lib/voucher.js buat gate pemakaiannya.
          // Kode pakai user_id penuh (VARCHAR(36), unik by construction) biar
          // gak perlu cek duplikat kayak voucher manual admin.
          await pool.query(
            `INSERT INTO vouchers (kode, potongan, kuota, terpakai, aktif, disetujui_at, for_user, akses_role, tampil, catatan, used)
             VALUES (?, 1000000, 1, 0, 1, NOW(), ?, 'akun', 0, ?, 0)`,
            [`SAHABAT-${user_id}`, user_id, `Voucher Rp1.000.000 — auto-generate & auto-approve pendaftaran Sahabat Baitullah`]
          );
        }
      }

      return Response.json({ message: 'Status pendaftaran diperbarui.', status: status_baru });
    }

    return Response.json({ error: 'Action tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
