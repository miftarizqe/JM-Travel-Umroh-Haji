function kamarKeyOf(kamar) {
  const k = String(kamar || '').toLowerCase();
  if (k.includes('quad')) return 'quad';
  if (k.includes('double')) return 'double';
  return 'triple';
}

const KOSONG = {
  jumlah_booking: 0, jumlah_jamaah: 0,
  pendapatan_program: 0, opsi_tambahan: 0, diskon_voucher: 0, pendapatan_bersih: 0,
  hpp: 0, laba_kotor: 0, komisi: 0, laba_bersih: 0,
};

function agregasi(list, keyFn, labelFn) {
  const map = {};
  for (const b of list) {
    const key = keyFn(b);
    if (!map[key]) map[key] = { key, label: labelFn(b), ...KOSONG };
    const m = map[key];
    m.jumlah_booking++; m.jumlah_jamaah += b.jumlah_jamaah;
    m.pendapatan_program += b.pendapatan_program; m.opsi_tambahan += b.opsi_tambahan;
    m.diskon_voucher += b.diskon_voucher; m.pendapatan_bersih += b.pendapatan_bersih;
    m.hpp += b.hpp; m.laba_kotor += b.laba_kotor;
    m.komisi += b.komisi; m.laba_bersih += b.laba_bersih;
  }
  return Object.values(map);
}

/**
 * Sumber tunggal perhitungan "Laporan Keuangan Program & Bulanan" — dipakai
 * baik oleh /api/admin/laporan-keuangan-program (tampilan in-app) maupun
 * /api/admin/export?type=laporan-keuangan-program (Excel).
 *
 * Cuma booking yang DP-nya sudah dikonfirmasi & tidak dibatalkan yang
 * dihitung sebagai "uang masuk". Pendapatan dipecah eksplisit: harga
 * program, opsi tambahan (checkout), diskon voucher — supaya tidak ada
 * yang "hilang" ke dalam satu angka gelondongan.
 *
 * Rincian SIAPA harus ditransfer & ke rekening mana bukan urusan laporan
 * ini — itu ada di /admin/laporan/ujroh-closing (per perwakilan).
 * Laporan ini cuma angka "komisi" gelondongan sebagai komponen biaya.
 */
export async function hitungLaporanKeuanganProgram(pool, { from, to, progId } = {}) {
  const params = [];
  let where = ` WHERE b.status IN ('active','selesai') AND b.dp_status = 'confirmed'`;
  if (from) { where += ' AND b.created_at >= ?'; params.push(`${from} 00:00:00`); }
  if (to) { where += ' AND b.created_at <= ?'; params.push(`${to} 23:59:59`); }
  if (progId) { where += ' AND b.prog_id = ?'; params.push(progId); }

  const [rows] = await pool.query(
    `SELECT b.id, b.prog_id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah,
            b.total_harga, b.opsi_tambahan_total, b.voucher_nominal, b.created_at,
            p.hpp_deluxe_quad, p.hpp_deluxe_triple, p.hpp_deluxe_double,
            p.hpp_eksekutif_quad, p.hpp_eksekutif_triple, p.hpp_eksekutif_double,
            p.hpp_signature_quad, p.hpp_signature_triple, p.hpp_signature_double
     FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
     ${where}
     ORDER BY b.created_at ASC`,
    params
  );

  if (rows.length === 0) {
    return { per_program: [], per_bulan: [], grand_total: { ...KOSONG } };
  }

  const [ledgerRows] = await pool.query(
    `SELECT booking_id, SUM(nominal) AS total FROM komisi_ledger
     WHERE booking_id IN (${rows.map(() => '?').join(',')}) GROUP BY booking_id`,
    rows.map(r => r.id)
  );
  const komisiMap = {};
  ledgerRows.forEach(r => { komisiMap[r.booking_id] = Number(r.total); });

  const enriched = rows.map(b => {
    const paket = String(b.paket || 'deluxe').toLowerCase();
    const kamar = kamarKeyOf(b.kamar);
    const hppPerJamaah = Number(b[`hpp_${paket}_${kamar}`] || 0);
    const hpp = hppPerJamaah * (b.jumlah_jamaah || 1);
    const opsiTambahan = Number(b.opsi_tambahan_total || 0);
    const diskonVoucher = Number(b.voucher_nominal || 0);
    // total_harga sudah bersih (opsi tambahan ditambah, voucher dikurangi
    // saat booking dibuat — lihat src/lib/booking.js) — pendapatan_program
    // dihitung mundur biar ketiganya kelihatan terpisah tapi tetap konsisten.
    const pendapatanBersih = Number(b.total_harga || 0);
    const pendapatanProgram = pendapatanBersih + diskonVoucher - opsiTambahan;
    const komisi = komisiMap[b.id] || 0;
    return {
      prog_id: b.prog_id, prog_name: b.prog_name, jumlah_jamaah: b.jumlah_jamaah || 1,
      bulan: new Date(b.created_at).toISOString().slice(0, 7),
      pendapatan_program: pendapatanProgram, opsi_tambahan: opsiTambahan,
      diskon_voucher: diskonVoucher, pendapatan_bersih: pendapatanBersih,
      hpp, laba_kotor: pendapatanBersih - hpp, komisi,
      laba_bersih: pendapatanBersih - hpp - komisi,
    };
  });

  const perProgram = agregasi(enriched, b => b.prog_id, b => b.prog_name)
    .sort((a, b) => b.pendapatan_bersih - a.pendapatan_bersih);
  const perBulan = agregasi(enriched, b => b.bulan, b => b.bulan)
    .sort((a, b) => a.key.localeCompare(b.key));

  const grand = enriched.reduce((acc, b) => ({
    jumlah_booking: acc.jumlah_booking + 1,
    jumlah_jamaah: acc.jumlah_jamaah + b.jumlah_jamaah,
    pendapatan_program: acc.pendapatan_program + b.pendapatan_program,
    opsi_tambahan: acc.opsi_tambahan + b.opsi_tambahan,
    diskon_voucher: acc.diskon_voucher + b.diskon_voucher,
    pendapatan_bersih: acc.pendapatan_bersih + b.pendapatan_bersih,
    hpp: acc.hpp + b.hpp,
    laba_kotor: acc.laba_kotor + b.laba_kotor,
    komisi: acc.komisi + b.komisi,
    laba_bersih: acc.laba_bersih + b.laba_bersih,
  }), { ...KOSONG });

  return { per_program: perProgram, per_bulan: perBulan, grand_total: grand };
}
