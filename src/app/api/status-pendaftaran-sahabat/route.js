import pool from '@/lib/db';
import { wajibLogin, wajibRole } from '@/lib/auth';
import { pastikanKodeInviteSahabat } from '@/lib/kodeInvitePerwakilan';
import { pastikanKodeUnik } from '@/lib/kodeUnik';
import { catatRekening } from '@/lib/rekeningLedger';

// Urutan step pendaftaran sahabat — LINEAR, beda bentuk dari perwakilan
// (yang punya 2 cabang kantor/paket) makanya sengaja tabel & endpoint
// terpisah (sahabat_pendaftaran), bukan numpang di agen_pendaftaran/
// status-pendaftaran. Voucher Rp1jt SENGAJA TIDAK ada di sini — bukan
// gate, admin bisa terbitkan kapan saja lewat POST /api/admin/vouchers
// biasa (akses_role='akun'), gak menghalangi step lain (dikonfirmasi user).
//
// Step 'pending' TIDAK LAGI butuh admin verify_tf (2026-09-02) — Sahabat
// Baitullah cuma bisa daftar via referral, jadi TF auto-verified &
// auto-maju ke 'menunggu_bsi' begitu diunggah (lihat
// /api/sahabat/upload-bukti-tf). Gate kepercayaan sekarang ada di 2
// titik: ACC voucher (vouchers.disetujui_at) dan advance ke 'active'
// (masih wajib CIF+SK-CIF+Surat Kuasa + aksi admin eksplisit).
export const STEP_PENDAFTARAN_SAHABAT = [
  { key: 'pending', label: 'Upload Bukti Transfer', urut: 1 },
  { key: 'menunggu_bsi', label: 'Menunggu Akun BSI & Tabungan Haji', urut: 2 },
  { key: 'menunggu_sk_cif', label: 'Menunggu SK-CIF', urut: 3 },
  { key: 'active', label: 'Jamaah Sahabat Baitullah Aktif', urut: 4 },
];

// GET /api/status-pendaftaran-sahabat — status pendaftaran milik user login
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [users] = await pool.query(
      `SELECT id, name, role, status, terverifikasi, foto_path, setuju_pks,
              cif_bsi, no_rekening_bsi_biasa, no_rekening_tabungan_umroh,
              akun_bsi_status, tabungan_haji_status,
              dokumen_spk_ak_fisik_path, dokumen_sk_cif_fisik_path,
              dokumen_surat_pemblokiran_fisik_path, nominal_blokir_tabungan, jangka_waktu_blokir_hari, tanggal_mulai_blokir
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (users.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    const u = users[0];

    const [kp] = await pool.query(
      'SELECT * FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [auth.user.id]
    );
    const pendaftaran = kp[0] || null;

    const [sigRows] = await pool.query(
      `SELECT dokumen, fase FROM dokumen_signature WHERE dokumen IN ('spk_ak','sk_cif') AND ref_id = ?`,
      [auth.user.id]
    );
    const sigSpkAk = sigRows.find(s => s.dokumen === 'spk_ak') || null;

    const spkAkSelesai = (sigSpkAk?.fase === 'selesai') || !!u.dokumen_spk_ak_fisik_path;
    const skCifSelesai = !!u.dokumen_sk_cif_fisik_path;
    const suratPemblokiranSelesai = !!u.dokumen_surat_pemblokiran_fisik_path;

    const prasyarat = {
      akun_terverifikasi: !!u.terverifikasi,
      foto_profil: !!u.foto_path,
      data_diri_terkirim: !!pendaftaran,
      bukti_tf_uploaded: !!pendaftaran?.bukti_tf_path,
      bukti_tf_verified: !!pendaftaran?.bukti_tf_verified_at,
      spk_ak_selesai: spkAkSelesai,
      akun_bsi_status: !!u.akun_bsi_status,
      tabungan_haji_status: !!u.tabungan_haji_status,
      cif_bsi_terisi: !!u.cif_bsi,
      sk_cif_selesai: skCifSelesai,
      blokir_data_terisi: !!(u.nominal_blokir_tabungan && u.jangka_waktu_blokir_hari && u.tanggal_mulai_blokir),
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
        cif_bsi: u.cif_bsi, no_rekening_bsi_biasa: u.no_rekening_bsi_biasa, no_rekening_tabungan_umroh: u.no_rekening_tabungan_umroh,
        akun_bsi_status: !!u.akun_bsi_status, tabungan_haji_status: !!u.tabungan_haji_status,
        dokumen_spk_ak_fisik_path: u.dokumen_spk_ak_fisik_path, dokumen_sk_cif_fisik_path: u.dokumen_sk_cif_fisik_path,
        dokumen_surat_pemblokiran_fisik_path: u.dokumen_surat_pemblokiran_fisik_path,
        nominal_blokir_tabungan: u.nominal_blokir_tabungan, jangka_waktu_blokir_hari: u.jangka_waktu_blokir_hari,
        tanggal_mulai_blokir: u.tanggal_mulai_blokir,
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
// action: 'verify_tf' | 'toggle_bsi' | 'advance' | 'reject'
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
      return Response.json({ message: 'Pendaftaran sahabat ditolak.' });
    }

    if (action === 'verify_tf') {
      // Fallback legacy — jalur normal sekarang auto-verify di
      // /api/sahabat/upload-bukti-tf (lihat catatan di STEP_PENDAFTARAN_SAHABAT
      // di atas). Endpoint ini dibiarkan hidup buat baris lama yang somehow
      // masih nyangkut 'pending' dengan bukti_tf_path terisi tapi belum verified.
      if (!p.bukti_tf_path) return Response.json({ error: 'Bukti transfer belum diunggah' }, { status: 400 });
      if (p.status !== 'pending') return Response.json({ error: 'Bukti transfer sudah diverifikasi.' }, { status: 400 });
      await pool.query(
        "UPDATE sahabat_pendaftaran SET bukti_tf_verified_at = NOW(), status = 'menunggu_bsi' WHERE user_id = ?",
        [user_id]
      );
      await pool.query(
        "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru) VALUES ('sahabat_baitullah', ?, 'menunggu_bsi')",
        [user_id]
      );
      return Response.json({ message: 'Bukti transfer diverifikasi, lanjut ke tahap akun BSI.' });
    }

    if (action === 'toggle_bsi') {
      const { field, value } = body;
      if (!['akun_bsi_status', 'tabungan_haji_status'].includes(field)) {
        return Response.json({ error: 'Field tidak valid' }, { status: 400 });
      }
      const kolomWaktu = field === 'akun_bsi_status' ? 'akun_bsi_updated_at' : 'tabungan_haji_updated_at';
      await pool.query(
        `UPDATE users SET ${field} = ?, ${kolomWaktu} = NOW() WHERE id = ?`,
        [value ? 1 : 0, user_id]
      );
      return Response.json({ message: 'Status diperbarui.' });
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
      const [[u]] = await pool.query(
        `SELECT kode_unik, cif_bsi, akun_bsi_status, tabungan_haji_status, dokumen_spk_ak_fisik_path, dokumen_sk_cif_fisik_path,
                dokumen_surat_pemblokiran_fisik_path
         FROM users WHERE id = ?`, [user_id]
      );
      const [sigRows] = await pool.query(
        `SELECT fase FROM dokumen_signature WHERE dokumen = 'spk_ak' AND ref_id = ?`, [user_id]
      );
      const spkAkSelesai = (sigRows[0]?.fase === 'selesai') || !!u.dokumen_spk_ak_fisik_path;

      if (status_baru === 'menunggu_sk_cif') {
        if (!spkAkSelesai) return Response.json({ error: 'SPK-AK belum selesai ditandatangani' }, { status: 400 });
        // Rekening BSI Biasa dihapus dari syarat (dikonfirmasi user
        // 2026-09-03) — Sahabat Baitullah cuma punya 1 rekening (Tabungan
        // Umroh), akun_bsi_status gak dipakai lagi sebagai gate.
        if (!u.tabungan_haji_status) return Response.json({ error: 'Rekening tabungan umroh belum diisi' }, { status: 400 });
      }
      if (status_baru === 'active') {
        if (!u.cif_bsi) return Response.json({ error: 'Nomor CIF BSI belum diisi' }, { status: 400 });
        if (!u.dokumen_sk_cif_fisik_path) return Response.json({ error: 'Scan SK-CIF belum diunggah' }, { status: 400 });
        if (!u.dokumen_surat_pemblokiran_fisik_path) return Response.json({ error: 'Scan Surat Pernyataan Kuasa Blokir Rekening belum diunggah' }, { status: 400 });
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
          // 2 kasus jatah gen JANGAN dibayar ke ancestor, dialihkan ke
          // operasional_sahabat (dikonfirmasi user 2026-09-06):
          //  1. Rantai abis sebelum 5 hop (gak ada lagi perekrut di atas) —
          //     dulu jatah gen yang gak kebagian ini SAMA SEKALI gak
          //     tercatat kemana pun, sekarang wajib balik ke operasional,
          //     bukan hilang.
          //  2. Ancestor di posisi itu kebetulan Head of Program — HOP
          //     SELALU cuma dapet flat Rp100rb (jatah registrasi di bawah)
          //     gak peduli posisinya di rantai, biar gak dibayar dobel.
          const hopUserId = pengaturan?.head_of_program_user_id || null;
          let operasionalTambahan = 0;
          let current = p.perekrut_id;
          let rantaiAbis = false;
          for (let gen = 0; gen < 5; gen++) {
            const nominal = Number(genNominal[gen] || 0);
            let ancestor = null;
            if (!rantaiAbis && current) {
              const [[found]] = await pool.query('SELECT id, name, perekrut_id FROM users WHERE id = ?', [current]);
              if (found) { ancestor = found; current = found.perekrut_id; }
              else rantaiAbis = true;
            } else {
              rantaiAbis = true;
            }
            if (nominal > 0) {
              if (ancestor && !(hopUserId && ancestor.id === hopUserId)) {
                await pool.query(
                  `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan)
                   VALUES (NULL, ?, ?, ?, 'komisi_sahabat', 1, ?, ?)`,
                  [user_id, ancestor.id, ancestor.name || null, nominal, `Ujroh Generasi ${gen + 1} — atas nama ${p.nama} (No. Akun: ${u.kode_unik || '-'})`]
                );
              } else {
                operasionalTambahan += nominal;
              }
            }
          }

          // Tabungan awal jemaah baru itu sendiri.
          const tabunganAwal = Number(pengaturan?.sahabat_tabungan_awal_nominal || 0);
          if (tabunganAwal > 0) {
            await pool.query(
              `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan)
               VALUES (NULL, ?, ?, ?, 'tabungan_awal_sahabat', 1, ?, ?)`,
              [user_id, user_id, p.nama, tabunganAwal, 'Saldo awal tabungan umroh — pendaftaran Sahabat Baitullah']
            );
          }

          // Komisi Head of Program (registrasi) — cuma kalau akunnya udah
          // ditunjuk lewat pengaturan.
          const hopNominal = Number(pengaturan?.sahabat_head_of_program_nominal || 0);
          if (pengaturan?.head_of_program_user_id && hopNominal > 0) {
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
          const operasionalFlat = Math.max(0, 1000000 - sumGenNominal - hopNominal - tabunganAwal);
          const operasionalTotal = operasionalFlat + operasionalTambahan;
          if (operasionalTotal > 0) {
            await pool.query(
              `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan)
               VALUES (NULL, ?, 'operasional_sahabat', 'Operasional Management', 'operasional_sahabat', 1, ?, ?)`,
              [
                user_id, operasionalTotal,
                operasionalTambahan > 0
                  ? `Sisa pendaftaran ${p.nama} (Rp${operasionalFlat.toLocaleString('id-ID')}) + jatah gen yang gak kebagian ke ancestor beneran (Rp${operasionalTambahan.toLocaleString('id-ID')}) — rantai perekrut abis dan/atau kena HOP`
                  : `Sisa pendaftaran Sahabat Baitullah — atas nama ${p.nama} (No. Akun: ${u.kode_unik || '-'})`,
              ]
            );

            // Rekening — TETAP di rekening sahabat_baitullah yang sama
            // (dikonfirmasi user 2026-09-06 — bukan pindah ke rekening lain,
            // fisiknya emang gak pernah kemana-mana). Dicatat keluar LALU
            // masuk lagi, biar ada 2 baris jelas ("titik") di riwayat
            // transaksi rekening ini yang nandain "segini yang jadi jatah
            // management" — beda dari ujroh_tf yang beneran ditransfer ke
            // orang lain. Saldo akhir gak berubah (netral), cuma buat
            // kategorisasi/audit biar gampang dibedain closing beneran vs
            // sisa operasional pas lihat riwayat.
            await catatRekening(pool, {
              rekening: 'sahabat_baitullah', jenis: 'keluar', sumber_tipe: 'operasional_sahabat',
              sumber_id: user_id, nominal: operasionalTotal,
              keterangan: `Alokasi operasional/management — pendaftaran ${p.nama}`,
            });
            await catatRekening(pool, {
              rekening: 'sahabat_baitullah', jenis: 'masuk', sumber_tipe: 'operasional_sahabat',
              sumber_id: user_id, nominal: operasionalTotal,
              keterangan: `Alokasi operasional/management — pendaftaran ${p.nama}`,
            });
          }

          // Voucher Rp1jt AUTO-generate sistem begitu akun aktif (dikonfirmasi
          // user 2026-09-01 — bukan admin bikin manual dari nol lagi kayak
          // sebelumnya), TAPI disetujui_at SENGAJA NULL dulu — admin tetap
          // wajib ACC manual (cek data bener/gak) sebelum voucher ini valid
          // dipakai checkout. Lihat cariVoucherValid() di src/lib/voucher.js
          // buat gate-nya, dan PATCH .../vouchers {approve:true} buat ACC-nya.
          // Kode pakai user_id penuh (VARCHAR(36), unik by construction) biar
          // gak perlu cek duplikat kayak voucher manual admin.
          await pool.query(
            `INSERT INTO vouchers (kode, potongan, kuota, terpakai, aktif, disetujui_at, for_user, akses_role, tampil, catatan, used)
             VALUES (?, 1000000, 1, 0, 1, NULL, ?, 'akun', 0, ?, 0)`,
            [`SAHABAT-${user_id}`, user_id, `Voucher Rp1.000.000 — auto-generate pendaftaran Sahabat Baitullah, menunggu ACC admin`]
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
