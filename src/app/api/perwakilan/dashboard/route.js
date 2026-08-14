import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';
import { cariPotensiResellerLangsung } from '@/lib/closing';

// Normalisasi tipe kamar dari booking ke key (quad/triple/double)
function kamarKey(kamar) {
  const k = String(kamar || '').toLowerCase();
  if (k.includes('quad')) return 'quad';
  if (k.includes('triple')) return 'triple';
  if (k.includes('double')) return 'double';
  return 'triple'; // default aman
}

// GET /api/perwakilan/dashboard?perw_id=xxx
// Ujroh = total_harga (harga jual) - (HPP kombinasi x jumlah jamaah)
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
              b.total_harga, b.dp_status, b.pelunasan_status, b.created_at,
              b.form_filled, b.form_total, b.status, b.ordered_by,
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

    let ujrohTotal = 0;
    let closingConfirmed = 0;
    const closingList = closings.map(c => {
      const jml = c.jumlah_jamaah || 1;
      const paket = String(c.paket || 'deluxe').toLowerCase();
      const kamar = kamarKey(c.kamar);
      const hppKantor = Number(c[`hpp_${paket}_${kamar}`] || 0);
      const hargaUpline = Number(c[`jual_${paket}_${kamar}`] || 0);
      const hppPerJamaah = hargaUpline > 0 ? hargaUpline : hppKantor;
      const hppTotal = hppPerJamaah * jml;
      const hargaJualPerJamaah = jml > 0 ? Math.round((c.total_harga || 0) / jml) : 0;
      const ujroh = (c.total_harga || 0) - hppTotal;
      const dibayar = c.dp_status === 'confirmed';
      if (dibayar) { ujrohTotal += ujroh; closingConfirmed++; }
      let jamaah = [];
      if (c.jamaah_data) {
        try { jamaah = typeof c.jamaah_data === 'string' ? JSON.parse(c.jamaah_data) : c.jamaah_data; }
        catch { jamaah = []; }
      }
      return {
        id: c.id, prog_name: c.prog_name, paket: c.paket, kamar: c.kamar,
        jumlah_jamaah: jml, jamaah, total_harga: c.total_harga,
        hpp_per_jamaah: hppPerJamaah, hpp_source: hargaUpline > 0 ? 'upline' : 'kantor',
        harga_jual_per_jamaah: hargaJualPerJamaah,
        ujroh, dp_status: c.dp_status, pelunasan_status: c.pelunasan_status,
        created_at: c.created_at, status: c.status, ordered_by: c.ordered_by,
        form_filled: c.form_filled, form_total: c.form_total,
        form_lengkap: c.form_filled >= c.form_total,
        pemesan_nama: c.pemesan_nama, pemesan_wa: c.pemesan_wa,
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

    // Margin reseller yang perwakilan ini terima dari closing downline-nya
    // (skema harga berjenjang — beda dari ujroh di atas, yang itu margin dia sendiri jualan)
    // Di-JOIN ke bookings+users biar kelihatan downline mana yang closing-nya
    // menghasilkan margin ini.
    const [reseller] = await pool.query(
      `SELECT kl.booking_id, kl.nominal, kl.paket, kl.keterangan, kl.created_at,
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
        total_ujroh: ujrohTotal,
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
