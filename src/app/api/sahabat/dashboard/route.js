import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';

// GET /api/sahabat/dashboard?sahabat_id=xxx
// Jauh lebih simpel dari dashboard perwakilan — sahabat gak punya
// closing/HPP/skema berjenjang, cuma: siapa aja yang direkrut + status
// funnel masing-masing, dan komisi FLAT sekali per rekrutan aktif
// (komisi_ledger.jenis='komisi_sahabat', booking_id selalu NULL).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sahabatId = searchParams.get('sahabat_id');
    if (!sahabatId) return Response.json({ error: 'sahabat_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, sahabatId);
    if (auth.error) return auth.error;

    const [rows] = await pool.query(
      `SELECT id, name, kode_unik, kode_invite_sahabat, status, cif_bsi, agama, akun_bsi_status, tabungan_haji_status
       FROM users WHERE id = ? AND role = ?`,
      [sahabatId, 'sahabat_baitullah']
    );
    if (rows.length === 0) return Response.json({ error: 'Akun sahabat tidak ditemukan' }, { status: 404 });
    const akun = rows[0];

    // Voucher pendaftaran Rp1jt — akses_role='akun' + for_user, diterbitkan
    // admin lewat form voucher biasa (bukan tabel/flow khusus sahabat).
    // Bisa lebih dari 1 baris kalau admin pernah re-issue, ambil yang
    // terbaru buat status ringkas di dashboard.
    const [voucherRows] = await pool.query(
      `SELECT kode, potongan, valid_until, used, aktif, created_at
       FROM vouchers WHERE for_user = ? AND akses_role = 'akun'
       ORDER BY created_at DESC LIMIT 1`,
      [sahabatId]
    );
    const voucher = voucherRows[0] || null;

    // Dokumen yang sudah beres — link download PDF final (digital) atau
    // scan fisik, dokumen mana pun yang lebih dulu ketemu. rangkap='travel'
    // WAJIB buat spk_ak (bug ditemukan & diperbaiki 2026-09-19) — itu
    // rangkap yang beneran ditandatangani jamaah sendiri, rangkap 'luar'
    // cuma tanda tangan internal JM Travel yang auto-selesai duluan.
    // Dokumen SPK-AK-nya beda buat anggota non-Muslim (spk_ak_nonis,
    // dikonfirmasi user 2026-09-20).
    const dokumenSpkAk = akun.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
    const [[sigSpkAk]] = await pool.query(
      `SELECT pdf_final_path FROM dokumen_signature WHERE dokumen = ? AND rangkap = 'travel' AND ref_id = ? ORDER BY id DESC LIMIT 1`,
      [dokumenSpkAk, sahabatId]
    );
    const [[dokUser]] = await pool.query(
      'SELECT dokumen_spk_ak_fisik_path, dokumen_sk_cif_fisik_path FROM users WHERE id = ?',
      [sahabatId]
    );
    const dokumen = {
      spk_ak: sigSpkAk?.pdf_final_path || dokUser.dokumen_spk_ak_fisik_path || null,
      sk_cif: dokUser.dokumen_sk_cif_fisik_path || null,
    };

    // Rekrutan langsung — SEMUA role (jamaah biasa yang cuma nabung, ATAU
    // yang lanjut jadi sahabat juga) selama perekrut_id-nya akun ini,
    // gabung status funnel dari sahabat_pendaftaran kalau dia sendiri juga
    // sahabat (rekrutan yang cuma "nabung" tanpa jadi recruiter gak punya
    // baris sahabat_pendaftaran, itu wajar — bukan diarahkan buat kejar rekrut).
    const [rekrutan] = await pool.query(
      `SELECT u.id, u.name, u.role, u.kode_unik, u.status, u.created_at,
              kp.status AS funnel_status
       FROM users u
       LEFT JOIN sahabat_pendaftaran kp ON kp.user_id = u.id
       WHERE u.perekrut_id = ?
       ORDER BY u.created_at DESC`,
      [sahabatId]
    );

    // 4 jenis earning yang bisa masuk ke akun Sahabat Baitullah: ujroh
    // 5-generasi, closing langsung, tabungan awal (saldo awal pas jadi
    // member), dan komisi registrasi Head of Program (kalau akun ini yang
    // ditunjuk jadi HoP) — SEMUA dibedain `dikonfirmasi_at` (super_admin acc
    // manual setelah transfer BSI beneran terkirim), bukan proyeksi/forecast.
    // 'reseller_perwakilan' SENGAJA gak diikutkan — itu program perwakilan,
    // beda ladger context walau 1 tabel.
    // Detail per-baris (buat rekening koran lengkap) ada di
    // /api/sahabat/riwayat-saldo — di sini cukup agregatnya buat kartu ringkasan.
    const [komisi] = await pool.query(
      `SELECT jenis, nominal, dikonfirmasi_at
       FROM komisi_ledger
       WHERE penerima_id = ? AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat','koreksi_saldo_sahabat')`,
      [sahabatId]
    );
    const confirmedRows = komisi.filter(k => k.dikonfirmasi_at);
    const saldoTabunganUmroh = confirmedRows.reduce((s, k) => s + Number(k.nominal || 0), 0);
    const saldoUpdatedAt = confirmedRows.length > 0
      ? confirmedRows.reduce((max, k) => (!max || k.dikonfirmasi_at > max) ? k.dikonfirmasi_at : max, null)
      : null;

    // "Saldo Pending" = baris ledger yang UDAH TERCATAT (ujroh/tabungan
    // awal/dll sudah kejadian) tapi belum dikonfirmasi admin (belum
    // ditransfer manual ke BSI & di-acc). BUKAN proyeksi rekrutan yang masih
    // dalam funnel — begitu admin confirm, baris ini otomatis pindah masuk
    // hitungan saldoTabunganUmroh di atas (sama sumber data, beda filter
    // dikonfirmasi_at aja).
    const pendingRows = komisi.filter(k => !k.dikonfirmasi_at);
    const saldoPending = pendingRows.reduce((s, k) => s + Number(k.nominal || 0), 0);

    // Rincian per jenis — buat kartu "Total Ujroh Terkonfirmasi" yang bisa
    // di-expand (mirror pola dashboard perwakilan yang mecah closing per
    // baris), di sini dipecah per KATEGORI karena sahabat gak punya
    // per-booking breakdown yang natural.
    function rekapJenis(rows) {
      const m = new Map();
      for (const k of rows) {
        m.set(k.jenis, (m.get(k.jenis) || 0) + Number(k.nominal || 0));
      }
      return [...m.entries()].map(([jenis, nominal]) => ({ jenis, nominal }));
    }
    const rincianKonfirmasi = rekapJenis(confirmedRows);
    const rincianPending = rekapJenis(pendingRows);

    // Skema ujroh aktif — nominal per generasi + tabungan awal + komisi HoP
    // + persen closing self-checkout, diambil live dari `pengaturan` (bukan
    // di-hardcode) biar kartu penjelasan di dashboard selalu sinkron sama
    // yang beneran dipakai backend saat cascade jalan (lihat
    // /api/status-pendaftaran-sahabat & src/lib/closing.js).
    const [[pengaturan]] = await pool.query(
      `SELECT sahabat_gen1_nominal, sahabat_gen2_nominal, sahabat_gen3_nominal, sahabat_gen4_nominal, sahabat_gen5_nominal,
              sahabat_tabungan_awal_nominal, sahabat_head_of_program_nominal, head_of_program_user_id,
              komisi_sahabat_closing_persen, sahabat_closing_langsung_hop_nominal
       FROM pengaturan WHERE id = 1`
    );
    const genNominal = [
      Number(pengaturan?.sahabat_gen1_nominal || 0),
      Number(pengaturan?.sahabat_gen2_nominal || 0),
      Number(pengaturan?.sahabat_gen3_nominal || 0),
      Number(pengaturan?.sahabat_gen4_nominal || 0),
      Number(pengaturan?.sahabat_gen5_nominal || 0),
    ];
    const isHop = !!(pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(sahabatId));
    // Voucher welcome Rp1jt gak berlaku buat HOP (dikonfirmasi user
    // 2026-09-21, lihat gate-nya di cariVoucherValid) — ditandai di sini
    // biar dashboard-nya gak nunjukin badge "Siap dipakai" yang menyesatkan.
    if (voucher && isHop) voucher.blocked_hop = true;

    // Forecast — downline dalam jaringan (BFS ke bawah lewat perekrut_id,
    // sama pola kayak /api/sahabat/team) yang BELUM aktif. Begitu salah satu
    // dari mereka aktif, akun ini otomatis dapat ujroh generasi sesuai
    // levelnya (gen1 = rekrutan langsung, dst turun sampai gen5 — di luar
    // itu tercatat tapi tidak dapat ujroh, cap teknis 20 level dipertahankan
    // buat konsistensi sama /api/sahabat/team, tapi potensi ujroh cuma
    // dihitung untuk level<=5).
    const calonUjroh = [];
    let currentLevelIds = [sahabatId];
    let level = 1;
    while (currentLevelIds.length > 0 && level <= 20) {
      const placeholders = currentLevelIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT u.id, u.name, u.kode_unik, u.status, u.created_at,
                kp.status AS funnel_status
         FROM users u
         LEFT JOIN sahabat_pendaftaran kp ON kp.user_id = u.id
         WHERE u.perekrut_id IN (${placeholders})
         ORDER BY u.created_at DESC`,
        currentLevelIds
      );
      if (rows.length === 0) break;
      for (const r of rows) {
        const belumAktif = r.status !== 'active';
        if (belumAktif && level <= 5) {
          calonUjroh.push({
            id: r.id, name: r.name, kode_unik: r.kode_unik, level,
            funnel_status: r.funnel_status, potensi_nominal: genNominal[level - 1],
          });
        }
      }
      currentLevelIds = rows.map(r => r.id);
      level++;
    }
    const potensiUjrohTotal = calonUjroh.reduce((s, c) => s + c.potensi_nominal, 0);

    // Perlu Perhatian — rekrutan LANGSUNG yang masih nyangkut di funnel
    // (bukan cuma "nabung" tanpa sahabat_pendaftaran, itu status normal,
    // bukan sesuatu yang perlu ditindaklanjuti).
    const perluPerhatian = {
      belum_tf: rekrutan.filter(r => r.funnel_status === 'pending'),
      menunggu_bsi: rekrutan.filter(r => r.funnel_status === 'menunggu_bsi'),
      menunggu_sk_cif: rekrutan.filter(r => r.funnel_status === 'menunggu_sk_cif'),
    };

    // Closing Langsung & Referral Reguler — jamaah publik yang di-closing-in
    // atau direkrut permanen oleh akun ini, TERPISAH dari ujroh 5-generasi
    // di atas (lihat komentar di src/lib/closing.js). Mirror "Margin
    // Reseller" milik dashboard perwakilan.
    const [closingLangsung] = await pool.query(
      `SELECT id, booking_id, jenis, nominal, keterangan, created_at, dikonfirmasi_at
       FROM komisi_ledger
       WHERE penerima_id = ? AND jenis IN ('closing_langsung_sahabat','referral_closing_reguler_sahabat')
       ORDER BY created_at DESC LIMIT 50`,
      [sahabatId]
    );
    const closingLangsungConfirmed = closingLangsung.filter(c => c.dikonfirmasi_at).reduce((s, c) => s + Number(c.nominal || 0), 0);
    const closingLangsungPending = closingLangsung.filter(c => !c.dikonfirmasi_at).reduce((s, c) => s + Number(c.nominal || 0), 0);

    return Response.json({
      akun,
      voucher,
      dokumen,
      ringkasan: {
        jumlah_rekrutan: rekrutan.length,
        saldo_pending: saldoPending,
        saldo_tabungan_umroh: saldoTabunganUmroh,
        saldo_updated_at: saldoUpdatedAt,
        rincian_konfirmasi: rincianKonfirmasi,
        rincian_pending: rincianPending,
      },
      skema: {
        gen: genNominal,
        tabungan_awal: Number(pengaturan?.sahabat_tabungan_awal_nominal || 0),
        hop_nominal: Number(pengaturan?.sahabat_head_of_program_nominal || 0),
        closing_persen: Number(pengaturan?.komisi_sahabat_closing_persen || 0),
        closing_hop_nominal: Number(pengaturan?.sahabat_closing_langsung_hop_nominal || 0),
        is_hop: isHop,
      },
      forecast: {
        calon_ujroh: calonUjroh,
        potensi_total: potensiUjrohTotal,
      },
      perlu_perhatian: perluPerhatian,
      closing_langsung: {
        items: closingLangsung,
        total_confirmed: closingLangsungConfirmed,
        total_pending: closingLangsungPending,
      },
      rekrutan,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
