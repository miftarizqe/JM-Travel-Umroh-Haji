import { cariPotensiResellerLangsung, costBasisPerwakilan } from '@/lib/closing';

function kamarKeyOf(kamar) {
  const k = String(kamar || '').toLowerCase();
  if (k.includes('quad')) return 'quad';
  if (k.includes('double')) return 'double';
  return 'triple';
}

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
       SELECT kl.penerima_id AS id FROM komisi_ledger kl JOIN users u ON u.id = kl.penerima_id WHERE u.role = 'perwakilan'
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
        `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.total_harga, b.created_at, b.prog_id,
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
        const paket = String(c.paket || 'deluxe').toLowerCase();
        const kamar = kamarKeyOf(c.kamar);
        const hppKantor = Number(c[`hpp_${paket}_${kamar}`] || 0);
        const cost = await costBasisPerwakilan(pool, pu.id, c.prog_id, paket, kamar, hppKantor);
        const ujroh = (c.total_harga || 0) - cost * (c.jumlah_jamaah || 1);
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
        `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.total_harga, b.prog_id,
                p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
                p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
                p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
         FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
         WHERE b.referral_perw_id = ? AND b.status IN ('active','menunggu_batal')`, [pu.id]
      );
      let ownForecastTotal = 0;
      const ownForecastDetail = [];
      for (const c of ownActive) {
        const paket = String(c.paket || 'deluxe').toLowerCase();
        const kamar = kamarKeyOf(c.kamar);
        const hppKantor = Number(c[`hpp_${paket}_${kamar}`] || 0);
        const cost = await costBasisPerwakilan(pool, pu.id, c.prog_id, paket, kamar, hppKantor);
        const ujroh = (c.total_harga || 0) - cost * (c.jumlah_jamaah || 1);
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

  closingRows.sort((a, b) => new Date(b.tanggal_cair) - new Date(a.tanggal_cair));

  return {
    perwakilan: perwList,
    totals: {
      perwakilan_realized: totalPerwRealized, perwakilan_forecast: totalPerwForecast,
    },
    closingRows,
    forecastRows,
  };
}
