import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';
import { cariPotensiResellerLangsung } from '@/lib/closing';
import { groupJamaahAktif } from '@/lib/jamaahHarga';

// GET /api/perwakilan/dashboard?perw_id=xxx
// Ujroh per booking = total_harga (harga jual) - (HPP kombinasi x jumlah
// jamaah) — dipakai buat field `ujroh` di tiap item `closings` (angka
// proyeksi/rincian). TAPI `ringkasan.total_ujroh` (headline "Terkonfirmasi")
// SEKARANG diambil dari SUM komisi_ledger yang dikonfirmasi_at (2026-09-02,
// konsisten sama Sahabat Baitullah) — closing doang gak cukup, harus udah
// lewat Pencairan Ujroh Perwakilan (ajukan→ACC→TF). Lihat `saldo_pending`
// buat closing yang udah kejadian tapi belum ditransfer.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const perwId = searchParams.get('perw_id');
    if (!perwId) return Response.json({ error: 'perw_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, perwId);
    if (auth.error) return auth.error;

    const [perwRows] = await pool.query(
      'SELECT id, name, kode_unik, wilayah, status FROM users WHERE id = ?',
      [perwId]
    );
    if (perwRows.length === 0) {
      return Response.json({ error: 'Perwakilan tidak ditemukan' }, { status: 404 });
    }
    const perw = perwRows[0];

    // Kalau perwakilan ini direkrut perwakilan lain, HPP-nya bukan HPP
    // kantor lagi tapi harga reseller yang dipasang upline (skema berjenjang).
    const [perekrutRows] = await pool.query('SELECT perekrut_id FROM users WHERE id = ?', [perwId]);
    const perekrutId = perekrutRows[0]?.perekrut_id || null;
    let uplinePerwId = null;
    if (perekrutId) {
      const [pr] = await pool.query('SELECT id, role FROM users WHERE id = ?', [perekrutId]);
      if (pr[0]?.role === 'perwakilan') uplinePerwId = pr[0].id;
    }

    // Closing di-refer ke perwakilan, join program untuk 9 HPP + harga upline (kalau ada)
    const [closings] = await pool.query(
      `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.jamaah_data,
              b.total_harga, b.opsi_tambahan_total, b.dp_status, b.pelunasan_status, b.created_at,
              b.form_filled, b.form_total, b.status, b.ordered_by,
              p.tanggal_berangkat,
              p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
              p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
              p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double,
              uh.jual_deluxe_quad, uh.jual_deluxe_triple, uh.jual_deluxe_double,
              uh.jual_eksekutif_quad, uh.jual_eksekutif_triple, uh.jual_eksekutif_double,
              uh.jual_signature_quad, uh.jual_signature_triple, uh.jual_signature_double,
              u.name AS pemesan_nama, u.wa AS pemesan_wa
       FROM bookings b
       LEFT JOIN programs p ON p.id = b.prog_id
       LEFT JOIN perwakilan_harga uh ON uh.perw_id = ? AND uh.prog_id = b.prog_id
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.referral_perw_id = ?
       ORDER BY b.created_at DESC`,
      [uplinePerwId, perwId]
    );

    // Status TF per booking (ujroh_perwakilan) — dulu "Terkonfirmasi" cuma
    // berarti "udah closing" (status='selesai'), sekarang HARUS beneran
    // udah di-TF (dikonfirmasi_at terisi) lewat Pencairan Ujroh Perwakilan
    // (dikonfirmasi user 2026-09-02, konsisten sama Sahabat Baitullah). Baris
    // ujroh_perwakilan dicatat SEKALI per booking di closing.js, jadi bisa
    // langsung di-map booking_id → status.
    const [ujrohRows] = await pool.query(
      `SELECT booking_id, dikonfirmasi_at FROM komisi_ledger WHERE penerima_id = ? AND jenis = 'ujroh_perwakilan'`,
      [perwId]
    );
    const statusTfPerBooking = Object.fromEntries(ujrohRows.map(r => [r.booking_id, !!r.dikonfirmasi_at]));

    let closingConfirmed = 0;
    const closingList = closings.map(c => {
      const jml = c.jumlah_jamaah || 1;
      // HPP/harga-upline dihitung PER KOMBO paket+kamar (bisa beda per
      // jamaah dalam 1 booking, lihat groupJamaahAktif) bukan 1 kombo
      // seragam × jml. hpp_source/hpp_per_jamaah di bawah tetap dari kombo
      // PERTAMA (buat label ringkas di UI) — angka ujroh yang finansial
      // udah benar dihitung per-kombo di hppTotal.
      const grupC = groupJamaahAktif(c);
      let hppTotal = 0, hppSourceUpline = false;
      for (const g of grupC) {
        const paketG = String(g.paket || 'deluxe').toLowerCase();
        const hppKantor = Number(c[`hpp_${paketG}_${g.kamarKey}`] || 0);
        const hargaUpline = Number(c[`jual_${paketG}_${g.kamarKey}`] || 0);
        const hppPerJamaah = hargaUpline > 0 ? hargaUpline : hppKantor;
        if (hargaUpline > 0) hppSourceUpline = true;
        hppTotal += hppPerJamaah * g.count;
      }
      const hppPerJamaah = jml > 0 ? Math.round(hppTotal / jml) : 0;
      const hargaJualPerJamaah = jml > 0 ? Math.round((c.total_harga || 0) / jml) : 0;
      const ujroh = (c.total_harga || 0) - hppTotal;
      // "Closing" (booking status='selesai') beda dari "Terkonfirmasi"
      // (beneran udah di-TF) — dua konsep terpisah sekarang. closingConfirmed
      // di sini TETAP hitung closing (buat label "Dari X closing"), TAPI
      // ujrohTotal (headline "Total Ujroh Terkonfirmasi") sekarang gak lagi
      // dihitung di sini — diambil dari SUM ledger yang beneran dikonfirmasi_at
      // (lihat totalUjrohConfirmed/totalUjrohPending di bawah).
      const sudahSelesai = c.status === 'selesai';
      if (sudahSelesai) { closingConfirmed++; }
      const tfConfirmed = sudahSelesai ? !!statusTfPerBooking[c.id] : null;
      let jamaah = [];
      if (c.jamaah_data) {
        try { jamaah = typeof c.jamaah_data === 'string' ? JSON.parse(c.jamaah_data) : c.jamaah_data; }
        catch { jamaah = []; }
      }
      return {
        id: c.id, prog_name: c.prog_name, paket: c.paket, kamar: c.kamar,
        jumlah_jamaah: jml, jamaah, total_harga: c.total_harga,
        hpp_per_jamaah: hppPerJamaah, hpp_source: hppSourceUpline ? 'upline' : 'kantor',
        harga_jual_per_jamaah: hargaJualPerJamaah,
        ujroh, tf_confirmed: tfConfirmed, dp_status: c.dp_status, pelunasan_status: c.pelunasan_status,
        created_at: c.created_at, status: c.status, ordered_by: c.ordered_by,
        form_filled: c.form_filled, form_total: c.form_total,
        form_lengkap: c.form_filled >= c.form_total,
        pemesan_nama: c.pemesan_nama, pemesan_wa: c.pemesan_wa,
        tanggal_berangkat: c.tanggal_berangkat,
      };
    });

    // Cluster "Perlu Perhatian" versi perwakilan — sama polanya dgn agen
    const formBelumLengkap = closingList.filter(b => !b.form_lengkap && b.status !== 'selesai');
    const dpPending = closingList.filter(b => b.dp_status === 'pending');
    const belumLunas = closingList.filter(b => b.dp_status === 'confirmed' && b.pelunasan_status !== 'paid' && b.status !== 'selesai');

    // Forecast: potensi ujroh yang BELUM cair — proyeksi dari closing pribadi
    // yang masih aktif (regardless dp_status, beda dari ujrohTotal di atas
    // yang cuma hitung yang DP-nya sudah confirmed) + margin reseller dari
    // downline langsung yang masih aktif.
    const potensiPribadi = closingList
      .filter(c => c.status === 'active' || c.status === 'menunggu_batal')
      .reduce((sum, c) => sum + c.ujroh, 0);
    const { potensi: potensiReseller, bookings: resellerBookings } = await cariPotensiResellerLangsung(pool, perwId);

    // Lost: ujroh yang HILANG karena booking dibatalkan — closingList sudah
    // nyakup semua status (gak difilter di query awal), jadi tinggal filter
    // 'dibatalkan' dari data yang sama, gak perlu query baru. Buat margin
    // reseller downline, pakai fungsi yang sama kayak Forecast, cuma ganti
    // filter status (lihat komentar cariPotensiResellerLangsung).
    const lostPribadi = closingList
      .filter(c => c.status === 'dibatalkan')
      .reduce((sum, c) => sum + c.ujroh, 0);
    const { potensi: lostReseller, bookings: resellerLostBookings } = await cariPotensiResellerLangsung(pool, perwId, ['dibatalkan']);

    // Margin reseller yang perwakilan ini terima dari closing downline-nya
    // (skema harga berjenjang — beda dari ujroh di atas, yang itu margin dia sendiri jualan)
    // Di-JOIN ke bookings+users biar kelihatan downline mana yang closing-nya
    // menghasilkan margin ini.
    const [reseller] = await pool.query(
      `SELECT kl.id, kl.booking_id, kl.nominal, kl.paket, kl.keterangan, kl.created_at, kl.dikonfirmasi_at,
              b.referral_perw_id AS sumber_id,
              u.name AS sumber_nama
       FROM komisi_ledger kl
       LEFT JOIN bookings b ON b.id = kl.booking_id
       LEFT JOIN users u ON u.id = b.referral_perw_id
       WHERE kl.penerima_id = ? AND kl.jenis = 'reseller_perwakilan'
       ORDER BY kl.created_at DESC LIMIT 50`,
      [perwId]
    );
    const totalMarginReseller = reseller.reduce((s, r) => s + Number(r.nominal || 0), 0);

    // "Total Ujroh Terkonfirmasi" SEKARANG dari SUM ledger yang beneran
    // dikonfirmasi_at (ujroh_perwakilan milik sendiri + reseller_perwakilan
    // margin upline, DIGABUNG — sama-sama uang yang masuk 1 batch pencairan
    // yang sama, dikonfirmasi user 2026-09-02). "Saldo Pending" = yang udah
    // closing/margin-nya kejadian tapi belum lewat Pencairan Ujroh Perwakilan.
    const [[ujrohSendiriConfirmed]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS total FROM komisi_ledger WHERE penerima_id = ? AND jenis = 'ujroh_perwakilan' AND dikonfirmasi_at IS NOT NULL`,
      [perwId]
    );
    const [[ujrohSendiriPending]] = await pool.query(
      `SELECT COALESCE(SUM(nominal),0) AS total FROM komisi_ledger WHERE penerima_id = ? AND jenis = 'ujroh_perwakilan' AND dikonfirmasi_at IS NULL`,
      [perwId]
    );
    const resellerConfirmed = reseller.filter(r => r.dikonfirmasi_at).reduce((s, r) => s + Number(r.nominal || 0), 0);
    const resellerPending = reseller.filter(r => !r.dikonfirmasi_at).reduce((s, r) => s + Number(r.nominal || 0), 0);
    const totalUjrohConfirmed = Number(ujrohSendiriConfirmed.total || 0) + resellerConfirmed;
    const totalUjrohPending = Number(ujrohSendiriPending.total || 0) + resellerPending;

    // Downline langsung — perwakilan hanya bisa merekrut perwakilan lain
    // (skema reseller berjenjang di src/lib/closing.js sudah mengasumsikan ini).
    const [downlineRows] = await pool.query(
      `SELECT id, name, role, kode_unik, status, created_at
       FROM users WHERE perekrut_id = ? AND role = 'perwakilan'
       ORDER BY created_at DESC`, [perwId]
    );
    const downlineList = [];
    for (const d of downlineRows) {
      const [dc] = await pool.query(
        `SELECT COALESCE(SUM(jumlah_jamaah),0) AS jml
         FROM bookings WHERE referral_perw_id = ? AND status = 'selesai'`, [d.id]
      );
      downlineList.push({
        id: d.id, name: d.name, role: d.role, kode_unik: d.kode_unik, status: d.status,
        closing_selesai: Number(dc[0]?.jml || 0),
      });
    }

    // Downline yang akunnya masih pending ACC admin
    const [downlinePending] = await pool.query(
      `SELECT id, name, email, wa, status, created_at
       FROM users WHERE perekrut_id = ? AND role = 'perwakilan' AND status = 'pending'
       ORDER BY created_at DESC`,
      [perwId]
    );

    return Response.json({
      perwakilan: {
        id: perw.id, name: perw.name, kode_unik: perw.kode_unik,
        wilayah: perw.wilayah || null, status: perw.status,
      },
      ringkasan: {
        total_closing: closingList.length,
        closing_confirmed: closingConfirmed,
        total_ujroh: totalUjrohConfirmed,
        saldo_pending: totalUjrohPending,
        total_jamaah: closingList.reduce((s, c) => s + c.jumlah_jamaah, 0),
        total_margin_reseller: totalMarginReseller,
        jumlah_downline: downlineList.length,
      },
      closings: closingList,
      forecast: {
        potensi_pribadi: potensiPribadi,
        potensi_override: potensiReseller,
        downline_bookings: resellerBookings,
      },
      lost: {
        potensi_pribadi: lostPribadi,
        potensi_override: lostReseller,
        downline_bookings: resellerLostBookings,
      },
      perlu_perhatian: {
        form_belum_lengkap: formBelumLengkap,
        dp_pending: dpPending,
        belum_lunas: belumLunas,
        downline_pending: downlinePending,
      },
      riwayat_reseller: reseller,
      downline: downlineList,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
