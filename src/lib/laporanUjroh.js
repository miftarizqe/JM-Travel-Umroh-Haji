import { cariPotensiResellerLangsung, costBasisPerwakilan } from '@/lib/closing';
import { groupJamaahAktif } from '@/lib/jamaahHarga';

// 'closing_bsi' dikunci ke tabungan BSI (bukan ditransfer ke rekening
// pribadi) — semua jenis lain ditransfer ke rekening pribadi penerima.
function kategoriRekening(jenis) {
  return jenis === 'closing_bsi' ? 'Tabungan BSI' : 'Rekening Pribadi';
}

function jumlahPer(detail, kategori) {
  return detail.filter(d => d.kategori === kategori).reduce((s, d) => s + Number(d.nominal), 0);
}

/**
 * Sumber tunggal perhitungan "Closing & Forecast Ujroh" — dipakai baik oleh
 * /api/admin/laporan-ujroh (tampilan in-app, 1 baris per orang dgn breakdown
 * Rekening Pribadi/BSI, detail per-program dibuka lewat klik) maupun
 * /api/admin/export?type=laporan-ujroh (Excel, baris rata per transaksi) —
 * supaya angka yang ditampilkan & yang di-export SELALU sama persis.
 *
 * Cuma perwakilan yang PERNAH punya closing (bookings.status='selesai')
 * yang dihitung. `from`/`to` cuma memfilter REALIZED (tanggal cair);
 * forecast selalu kondisi terkini (booking aktif, belum closing).
 *
 * Tiap item di realized_detail/forecast_detail SUDAH bawa prog_name +
 * jumlah_jamaah + (utk realized) kategori rekening — supaya UI bisa
 * mengelompokkan detail per program tanpa query tambahan.
 */
export async function hitungLaporanUjroh(pool, { from, to } = {}) {
  const ledgerParams = [];
  let ledgerWhere = '';
  if (from) { ledgerWhere += ' AND kl.created_at >= ?'; ledgerParams.push(`${from} 00:00:00`); }
  if (to) { ledgerWhere += ' AND kl.created_at <= ?'; ledgerParams.push(`${to} 23:59:59`); }

  const perwList = [];
  const closingRows = [];   // flat, buat sheet Excel "Closing (Sudah Cair)"
  const forecastRows = [];  // flat, buat sheet Excel "Forecast (Belum Closing)"
  let totalPerwRealized = 0, totalPerwForecast = 0;

  // ==================== PERWAKILAN ====================
  // "Punya closing" bukan cuma closer langsung (referral_perw_id di booking
  // status='selesai') — perwakilan yang cuma dapat margin reseller dari
  // downline (tanpa pernah closing sendiri) tetap harus muncul.
  const [perwClosers] = await pool.query(
    `SELECT DISTINCT id FROM (
       SELECT referral_perw_id AS id FROM bookings WHERE referral_perw_id IS NOT NULL AND status = 'selesai'
       UNION
       SELECT kl.penerima_id AS id FROM komisi_ledger kl JOIN users u ON u.id = kl.penerima_id WHERE u.role = 'perwakilan' OR u.role_kedua = 'perwakilan'
     ) t`
  );
  if (perwClosers.length > 0) {
    const perwIds = perwClosers.map(r => r.id);
    const [perwUsers] = await pool.query(
      `SELECT id, name, kode_unik, bank, no_rekening, nama_pemilik_rekening
       FROM users WHERE id IN (${perwIds.map(() => '?').join(',')})`, perwIds
    );
    for (const pu of perwUsers) {
      const rek = { bank: pu.bank, no_rekening: pu.no_rekening, nama_pemilik_rekening: pu.nama_pemilik_rekening };
      const closingParams = [pu.id];
      let closingWhere = ` WHERE b.referral_perw_id = ? AND b.status = 'selesai'`;
      if (from) { closingWhere += ' AND b.created_at >= ?'; closingParams.push(`${from} 00:00:00`); }
      if (to) { closingWhere += ' AND b.created_at <= ?'; closingParams.push(`${to} 23:59:59`); }
      const [closedRows] = await pool.query(
        `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.jamaah_data,
                b.total_harga, b.opsi_tambahan_total, b.created_at, b.prog_id,
                p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
                p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
                p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
         FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
         ${closingWhere}`,
        closingParams
      );

      let realizedTotal = 0;
      const realizedDetail = [];
      for (const c of closedRows) {
        // Cost basis dihitung PER KOMBO paket+kamar (lihat groupJamaahAktif)
        // — bisa beda per jamaah dalam 1 booking. Revenue tetap pakai
        // total_harga (udah akurat, jumlah harga_jual semua jamaah + opsi).
        let costTotal = 0;
        for (const g of groupJamaahAktif(c)) {
          const paketG = String(g.paket || 'deluxe').toLowerCase();
          const hppKantor = Number(c[`hpp_${paketG}_${g.kamarKey}`] || 0);
          const cost = await costBasisPerwakilan(pool, pu.id, c.prog_id, paketG, g.kamarKey, hppKantor);
          costTotal += cost * g.count;
        }
        const ujroh = (c.total_harga || 0) - costTotal;
        realizedTotal += ujroh;
        const row = {
          booking_id: c.id, prog_name: c.prog_name, jumlah_jamaah: c.jumlah_jamaah || 1,
          jenis: 'margin_pribadi', kategori: 'Rekening Pribadi', nominal: ujroh, created_at: c.created_at,
        };
        realizedDetail.push(row);
        closingRows.push({
          role: 'perwakilan', nama: pu.name, kode_unik: pu.kode_unik, ...rek,
          kategori: 'Rekening Pribadi', jenis: 'margin_pribadi', prog_name: c.prog_name, jumlah_jamaah: c.jumlah_jamaah || 1,
          booking_id: c.id, keterangan: c.prog_name, nominal: ujroh, tanggal_cair: c.created_at,
        });
      }

      // margin_pribadi (di atas) sudah dihitung terpisah (live, bukan dari ledger),
      // jadi ambil semua jenis ledger di sini tanpa filter — tidak dobel hitung.
      const [ledgerLain] = await pool.query(
        `SELECT kl.booking_id, kl.jenis, kl.nominal, kl.jumlah_jamaah, kl.keterangan, kl.created_at, b.prog_name
         FROM komisi_ledger kl LEFT JOIN bookings b ON b.id = kl.booking_id
         WHERE kl.penerima_id = ?${ledgerWhere} ORDER BY kl.created_at DESC`,
        [pu.id, ...ledgerParams]
      );
      const ledgerLainTotal = ledgerLain.reduce((s, r) => s + Number(r.nominal), 0);
      realizedTotal += ledgerLainTotal;
      for (const r of ledgerLain) {
        const kategori = kategoriRekening(r.jenis);
        realizedDetail.push({
          booking_id: r.booking_id, prog_name: r.prog_name, jumlah_jamaah: r.jumlah_jamaah || 1,
          jenis: r.jenis, kategori, keterangan: r.keterangan, nominal: Number(r.nominal), created_at: r.created_at,
        });
        closingRows.push({
          role: 'perwakilan', nama: pu.name, kode_unik: pu.kode_unik, ...rek,
          kategori, jenis: r.jenis, prog_name: r.prog_name, jumlah_jamaah: r.jumlah_jamaah || 1,
          booking_id: r.booking_id, keterangan: r.keterangan, nominal: Number(r.nominal), tanggal_cair: r.created_at,
        });
      }
      realizedDetail.sort((x, y) => new Date(y.created_at) - new Date(x.created_at));

      const [ownActive] = await pool.query(
        `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.jamaah_data,
                b.total_harga, b.opsi_tambahan_total, b.prog_id,
                p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
                p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
                p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
         FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
         WHERE b.referral_perw_id = ? AND b.status IN ('active','menunggu_batal')`, [pu.id]
      );
      let ownForecastTotal = 0;
      const ownForecastDetail = [];
      for (const c of ownActive) {
        let costTotal = 0;
        for (const g of groupJamaahAktif(c)) {
          const paketG = String(g.paket || 'deluxe').toLowerCase();
          const hppKantor = Number(c[`hpp_${paketG}_${g.kamarKey}`] || 0);
          const cost = await costBasisPerwakilan(pool, pu.id, c.prog_id, paketG, g.kamarKey, hppKantor);
          costTotal += cost * g.count;
        }
        const ujroh = (c.total_harga || 0) - costTotal;
        if (ujroh <= 0) continue;
        ownForecastTotal += ujroh;
        ownForecastDetail.push({ booking_id: c.id, prog_name: c.prog_name, jumlah_jamaah: c.jumlah_jamaah || 1, jenis: 'margin_pribadi', keterangan: 'Belum closing', nominal: ujroh });
      }

      const { potensi: resellerPotensi, bookings: resellerForecastBookings } = await cariPotensiResellerLangsung(pool, pu.id);
      const resellerForecastDetail = resellerForecastBookings.map(b => ({
        booking_id: b.id, prog_name: b.prog_name, jumlah_jamaah: b.jumlah_jamaah || 1, jenis: 'margin_reseller',
        keterangan: `Dari closing ${b.closer_nama || '-'} (belum closing)`, nominal: b.potensi_nominal,
      }));

      const forecastDetail = [...ownForecastDetail, ...resellerForecastDetail];
      const forecastTotal = ownForecastTotal + resellerPotensi;
      forecastDetail.forEach(d => forecastRows.push({ role: 'perwakilan', nama: pu.name, kode_unik: pu.kode_unik, ...d }));

      totalPerwRealized += realizedTotal;
      totalPerwForecast += forecastTotal;

      perwList.push({
        id: pu.id, name: pu.name, kode_unik: pu.kode_unik, ...rek,
        realized_total: realizedTotal,
        realized_pribadi: jumlahPer(realizedDetail, 'Rekening Pribadi'),
        realized_bsi: jumlahPer(realizedDetail, 'Tabungan BSI'),
        realized_detail: realizedDetail,
        forecast_total: forecastTotal, forecast_detail: forecastDetail,
        grand_total: realizedTotal + forecastTotal,
      });
    }
    perwList.sort((x, y) => y.grand_total - x.grand_total);
  }

  // ==================== SAHABAT BAITULLAH ====================
  // Closing & Forecast ujroh dari booking program REGULER yang
  // dibantu/direferensikan anggota Sahabat Baitullah (dikonfirmasi user
  // 2026-10-08) -- 2 jenis (closing_langsung_sahabat,
  // referral_closing_reguler_sahabat, lihat src/lib/closing.js). BUKAN
  // komisi rekrutan 5-generasi (itu tercatat beda tempat, dicatat pas
  // rekrutan aktif di status-pendaftaran-sahabat). Head of Program (role
  // 'hop') IKUT MUNCUL di list ini kalau dia pernah dapat bagian -- bukan
  // exception, sumbernya sama persis komisi_ledger (lihat bagian
  // closing_langsung_sahabat 'Bagian Head of Program' di closing.js).
  const [[pengaturanSahabat]] = await pool.query(
    'SELECT sahabat_closing_langsung_hop_nominal, head_of_program_user_id FROM pengaturan WHERE id = 1'
  );
  const hopId = pengaturanSahabat?.head_of_program_user_id || null;

  const sahabatMap = new Map();
  const userCache = new Map();
  async function ambilUserRingkas(id) {
    if (!id) return null;
    if (userCache.has(id)) return userCache.get(id);
    const [[u]] = await pool.query(
      'SELECT id, name, role, kode_unik, bank, no_rekening, nama_pemilik_rekening FROM users WHERE id = ?', [id]
    );
    userCache.set(id, u || null);
    return u || null;
  }
  function orangSahabat(u) {
    if (!u) return null;
    if (!sahabatMap.has(u.id)) {
      sahabatMap.set(u.id, {
        id: u.id, name: u.name, kode_unik: u.kode_unik, role: u.role,
        bank: u.bank, no_rekening: u.no_rekening, nama_pemilik_rekening: u.nama_pemilik_rekening,
        realized_total: 0, realized_detail: [],
        forecast_total: 0, forecast_detail: [],
      });
    }
    return sahabatMap.get(u.id);
  }

  // --- Realized (sudah closing/'selesai'), langsung dari ledger -- lebih
  // simpel dari perwakilan karena nominalnya fix/flat, bukan margin
  // dinamis, jadi gak perlu dihitung ulang, cukup jumlahin ledger. ---
  const [sahabatLedger] = await pool.query(
    `SELECT kl.penerima_id, kl.jenis, kl.nominal, kl.booking_id, kl.jumlah_jamaah, kl.keterangan, kl.created_at, b.prog_name
     FROM komisi_ledger kl LEFT JOIN bookings b ON b.id = kl.booking_id
     WHERE kl.jenis IN ('closing_langsung_sahabat','referral_closing_reguler_sahabat')${ledgerWhere}
     ORDER BY kl.created_at DESC`,
    ledgerParams
  );
  let totalSahabatRealized = 0;
  for (const r of sahabatLedger) {
    const u = await ambilUserRingkas(r.penerima_id);
    const o = orangSahabat(u);
    if (!o) continue;
    o.realized_total += Number(r.nominal);
    o.realized_detail.push({
      booking_id: r.booking_id, prog_name: r.prog_name, jumlah_jamaah: r.jumlah_jamaah || 1,
      jenis: r.jenis, kategori: 'Rekening Pribadi', keterangan: r.keterangan, nominal: Number(r.nominal), created_at: r.created_at,
    });
    totalSahabatRealized += Number(r.nominal);
    closingRows.push({
      role: u.role === 'hop' ? 'hop' : 'sahabat_baitullah', nama: u.name, kode_unik: u.kode_unik,
      bank: u.bank, no_rekening: u.no_rekening, nama_pemilik_rekening: u.nama_pemilik_rekening,
      kategori: 'Rekening Pribadi', jenis: r.jenis, prog_name: r.prog_name, jumlah_jamaah: r.jumlah_jamaah || 1,
      booking_id: r.booking_id, keterangan: r.keterangan, nominal: Number(r.nominal), tanggal_cair: r.created_at,
    });
  }

  // --- Forecast (belum closing, booking masih aktif) -- replikasi PERSIS
  // branching prosesBookingSelesai (src/lib/closing.js) biar angka forecast
  // konsisten sama angka yang beneran bakal tercatat pas closing beneran. ---
  function tambahForecastSahabat(o, jenis, nominal, b, keterangan) {
    if (!o || nominal <= 0) return;
    o.forecast_total += nominal;
    o.forecast_detail.push({ booking_id: b.id, prog_name: b.prog_name, jumlah_jamaah: b.jumlah_jamaah || 1, jenis, keterangan, nominal });
    totalSahabatForecast += nominal;
    forecastRows.push({
      role: o.role === 'hop' ? 'hop' : 'sahabat_baitullah', nama: o.name, kode_unik: o.kode_unik,
      jenis, booking_id: b.id, prog_name: b.prog_name, jumlah_jamaah: b.jumlah_jamaah || 1, keterangan, nominal,
    });
  }
  let totalSahabatForecast = 0;

  const [aktifReferralSahabat] = await pool.query(
    `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.jamaah_data, b.total_harga, b.opsi_tambahan_total,
            b.referral_sahabat_id, b.prog_id,
            p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
            p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
            p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double,
            p.sahabat_closing_langsung_hop_nominal, p.sahabat_closing_nominal_closer
     FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
     WHERE b.referral_sahabat_id IS NOT NULL AND b.status IN ('active','menunggu_batal')`
  );
  for (const b of aktifReferralSahabat) {
    const sahabatMember = await ambilUserRingkas(b.referral_sahabat_id);
    const oMember = orangSahabat(sahabatMember);
    const isSelfCheckout = hopId && String(b.referral_sahabat_id) === String(hopId);
    if (isSelfCheckout) {
      let hppTotal = 0;
      for (const g of groupJamaahAktif(b)) {
        const paketG = String(g.paket || 'deluxe').toLowerCase();
        hppTotal += Number(b[`hpp_${paketG}_${g.kamarKey}`] || 0) * g.count;
      }
      const margin = (b.total_harga || 0) - hppTotal;
      tambahForecastSahabat(oMember, 'closing_langsung_sahabat', margin, b, 'Closing Langsung (margin) — belum closing');
    } else {
      const closerNominal = Number(b.sahabat_closing_nominal_closer ?? 1_000_000);
      const hopNominal = Number(b.sahabat_closing_langsung_hop_nominal ?? pengaturanSahabat?.sahabat_closing_langsung_hop_nominal ?? 0);
      tambahForecastSahabat(oMember, 'closing_langsung_sahabat', closerNominal, b, 'Closing Langsung — belum closing');
      if (hopId) {
        const oHop = orangSahabat(await ambilUserRingkas(hopId));
        tambahForecastSahabat(oHop, 'closing_langsung_sahabat', hopNominal, b, `Bagian Head of Program — closing oleh ${sahabatMember?.name || '-'} — belum closing`);
      }
    }
  }

  // Forecast referral_closing_reguler_sahabat -- jamaah dengan referral
  // permanen sahabat, booking aktif di program REGULER (bukan
  // sahabat_baitullah-exclusive, cascade-nya beda total & sudah dipegang
  // di tempat lain).
  const [aktifReferralReguler] = await pool.query(
    `SELECT b.id, b.prog_name, b.jumlah_jamaah, u.perekrut_sahabat_jamaah_id
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     LEFT JOIN programs p ON p.id = b.prog_id
     WHERE b.status IN ('active','menunggu_batal') AND u.role = 'jamaah' AND u.perekrut_sahabat_jamaah_id IS NOT NULL
       AND (p.publish_type IS NULL OR p.publish_type <> 'sahabat_baitullah')`
  );
  for (const b of aktifReferralReguler) {
    const oReferrer = orangSahabat(await ambilUserRingkas(b.perekrut_sahabat_jamaah_id));
    tambahForecastSahabat(oReferrer, 'referral_closing_reguler_sahabat', 1_000_000, b, 'Referral pendaftaran — belum closing');
  }

  const sahabatList = [...sahabatMap.values()]
    .map(o => ({ ...o, grand_total: o.realized_total + o.forecast_total }))
    .sort((a, b) => b.grand_total - a.grand_total);

  closingRows.sort((a, b) => new Date(b.tanggal_cair) - new Date(a.tanggal_cair));

  return {
    perwakilan: perwList,
    sahabat: sahabatList,
    totals: {
      perwakilan_realized: totalPerwRealized, perwakilan_forecast: totalPerwForecast,
      sahabat_realized: totalSahabatRealized, sahabat_forecast: totalSahabatForecast,
    },
    closingRows,
    forecastRows,
  };
}
