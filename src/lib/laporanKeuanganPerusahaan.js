import { hitungLaporanKeuanganProgram } from '@/lib/laporanKeuangan';

const KATEGORI_OPEX_LABEL = {
  gaji: 'Gaji & Tunjangan Karyawan',
  sewa: 'Sewa Kantor',
  marketing: 'Marketing/Iklan',
  utilitas: 'Utilitas (Listrik, Internet, Air)',
  atk_kantor: 'Operasional Kantor (ATK, dll)',
  sistem_teknologi: 'Sistem/Teknologi (Hosting, WA API, dll)',
  legal_perizinan: 'Legal & Perizinan',
  lain_lain: 'Lain-lain',
};

const KATEGORI_PENDAPATAN_LAIN_LABEL = {
  merchandise: 'Penjualan Merchandise',
  sewa_aset: 'Sewa Aset (Bus, dll)',
  lain_lain: 'Lain-lain',
};

/** Gabung 2 daftar {label, total, jumlah} jadi 1, dijumlah kalau labelnya sama. */
function gabungKategori(...daftarList) {
  const map = new Map();
  for (const daftar of daftarList) {
    for (const r of daftar) {
      if (!map.has(r.label)) map.set(r.label, { label: r.label, total: 0, jumlah: 0 });
      const m = map.get(r.label);
      m.total += r.total;
      m.jumlah += r.jumlah;
    }
  }
  return [...map.values()];
}

/**
 * Laba/rugi PERUSAHAAN — beda dari hitungLaporanKeuanganProgram (yang
 * cuma nyakup pendapatan booking, HPP, komisi/ujroh). Ini nambahin
 * pendapatan di luar booking dan pengeluaran operasional — jadi Laba
 * Bersih PERUSAHAAN yang sesungguhnya, bukan cuma laba per booking.
 *
 * HPP dihitung dari duit vendor yang BENERAN keluar (cashflow_transaksi
 * kategori adalah_hpp_vendor=1, "Pembayaran Vendor/HPP"), BUKAN angka
 * budget (programs.hpp_* × pax booking) — budget itu cuma alat bantu admin
 * nentuin Harga Jual pas costing program, gak dipakai lagi buat P&L
 * (dikonfirmasi user: "budget program itu margin dan hpp cuma buat ngitung
 * harga jual, realisasinya ikutin yang beneran keluar"). Konsekuensinya:
 * kalau ada tagihan vendor yang belum sempat diinput admin ke Cashflow,
 * HPP di sini keliatan lebih kecil (laba keliatan lebih tinggi) sampai
 * transaksinya diinput — DISENGAJA, bukan bug, biar jadi pengingat buat
 * admin melengkapi data, bukan ditutupi angka rencana. Company-wide (semua
 * transaksi kategori ini dihitung, TERLEPAS di-tag ke program_id atau
 * enggak) — buat gap per-program pakai /admin/laporan/realisasi-program.
 *
 * Sumber opex & pendapatan lain digabung dari 2 tempat:
 * 1. Tabel lama pengeluaran_operasional/pendapatan_lain — sudah TIDAK
 *    nerima entri baru (lihat halaman Keuangan Perusahaan, tombol +Tambah
 *    disembunyikan), tapi entri lama tetap dihitung biar laporan bulan
 *    lalu gak berubah.
 * 2. cashflow_transaksi (buku kas bulanan) — sumber utama mulai sekarang.
 *    Cuma kategori yang ditandai termasuk_laba_rugi=1 yang dihitung —
 *    kategori seperti "Pembayaran Vendor/HPP", "Komisi/Ujroh",
 *    "Pendapatan Booking", "Modal/Setoran Pemilik" sengaja DIKECUALIKAN
 *    karena sudah/akan dihitung otomatis dari sumber lain (HPP & komisi
 *    dari data booking, pendapatan booking dari payments) atau bukan
 *    pendapatan operasional (modal pribadi owner) — kalau ikut, dobel.
 *    Baris settlement yang BELUM dirincikan (is_settlement=1, belum ada
 *    breakdown) juga dikecualikan — belum jelas itu duit abis buat apa,
 *    baru dihitung begitu sudah di-"Rincikan" dengan kategori & bon.
 * 3. cashflow_reimburse yang statusnya MASIH belum_dibayar (akrual) —
 *    staff udah keluar duit pribadi (beban udah KEJADIAN), company belum
 *    bayar balik. Ini SENGAJA diitung sebagai estimasi biaya periode
 *    berjalan (baris "belum dibayar" terpisah) walau belum ada baris
 *    cashflow_transaksi-nya — kalau enggak, biaya ini "hilang" dari
 *    laporan bulan yang seharusnya, nongol telat di bulan pas dibayar.
 *    PENTING biar gak DOBEL kehitung lintas bulan: begitu status berubah
 *    jadi sudah_dibayar, baris ini otomatis BERHENTI muncul di sini (filter
 *    status=belum_dibayar), dan baris cashflow_transaksi asli (yang dibuat
 *    pas "Bayar Sekarang") yang gantiin — jadi tiap klaim cuma pernah
 *    kehitung SATU KALI di titik waktu mana pun (baik sebagai estimasi
 *    pending, ATAU sebagai transaksi cash asli, gak pernah dua-duanya
 *    bersamaan).
 *
 * Khusus super admin (lihat wajibSuperAdmin di src/lib/auth.js).
 */
export async function hitungLaporanKeuanganPerusahaan(pool, { from, to } = {}) {
  const { grand_total: bisnis } = await hitungLaporanKeuanganProgram(pool, { from, to });

  const params = [];
  let where = ' WHERE 1=1';
  if (from) { where += ' AND tanggal >= ?'; params.push(from); }
  if (to) { where += ' AND tanggal <= ?'; params.push(to); }

  // --- HPP real (vendor) — gantiin bisnis.hpp yang budget, lihat komentar fungsi ---
  const hppParams = [];
  let hppWhere = " WHERE t.tipe = 'out' AND k.adalah_hpp_vendor = 1";
  if (from) { hppWhere += ' AND t.tanggal >= ?'; hppParams.push(from); }
  if (to) { hppWhere += ' AND t.tanggal <= ?'; hppParams.push(to); }
  const [[hppRealRow]] = await pool.query(
    `SELECT COALESCE(SUM(t.nominal), 0) AS total
     FROM cashflow_transaksi t JOIN cashflow_kategori k ON k.id = t.kategori_id
     ${hppWhere}`,
    hppParams
  );
  const hppReal = Number(hppRealRow.total);

  // --- Opex: legacy + cashflow ---
  const [opexLegacyRows] = await pool.query(
    `SELECT kategori, SUM(nominal) AS total, COUNT(*) AS jumlah FROM pengeluaran_operasional ${where} GROUP BY kategori`,
    params
  );
  const opexLegacy = opexLegacyRows.map(r => ({
    label: KATEGORI_OPEX_LABEL[r.kategori] || r.kategori, total: Number(r.total), jumlah: r.jumlah,
  }));

  const [opexCashflowRows] = await pool.query(
    `SELECT k.nama AS label, SUM(t.nominal) AS total, COUNT(*) AS jumlah
     FROM cashflow_transaksi t
     JOIN cashflow_kategori k ON k.id = t.kategori_id
     ${where.replace(/tanggal/g, 't.tanggal')}
       AND t.tipe = 'out' AND k.termasuk_laba_rugi = 1
       AND NOT (t.is_settlement = 1 AND t.settlement_induk_id IS NULL)
     GROUP BY k.nama`,
    params
  );
  const opexCashflow = opexCashflowRows.map(r => ({ label: r.label, total: Number(r.total), jumlah: r.jumlah }));

  const perKategoriOpex = gabungKategori(opexLegacy, opexCashflow);
  const totalOpex = perKategoriOpex.reduce((s, r) => s + r.total, 0);

  // --- Reimburse yang masih pending (belum_dibayar) — akrual, lihat komentar di atas fungsi ---
  const reimburseParams = [];
  let reimburseWhere = " WHERE status = 'belum_dibayar'";
  if (from) { reimburseWhere += ' AND tanggal_pengeluaran >= ?'; reimburseParams.push(from); }
  if (to) { reimburseWhere += ' AND tanggal_pengeluaran <= ?'; reimburseParams.push(to); }
  const [reimbursePendingRows] = await pool.query(
    `SELECT nama_staff, deskripsi, tanggal_pengeluaran, nominal FROM cashflow_reimburse ${reimburseWhere} ORDER BY tanggal_pengeluaran ASC`,
    reimburseParams
  );
  const reimbursePendingDetail = reimbursePendingRows.map(r => ({
    label: `${r.nama_staff} — ${r.deskripsi}`, total: Number(r.nominal), jumlah: 1,
  }));
  const totalReimbursePending = reimbursePendingDetail.reduce((s, r) => s + r.total, 0);

  // --- Pendapatan lain: legacy + cashflow ---
  const [pendapatanLegacyRows] = await pool.query(
    `SELECT kategori, SUM(nominal) AS total, COUNT(*) AS jumlah FROM pendapatan_lain ${where} GROUP BY kategori`,
    params
  );
  const pendapatanLegacy = pendapatanLegacyRows.map(r => ({
    label: KATEGORI_PENDAPATAN_LAIN_LABEL[r.kategori] || r.kategori, total: Number(r.total), jumlah: r.jumlah,
  }));

  const [pendapatanCashflowRows] = await pool.query(
    `SELECT k.nama AS label, SUM(t.nominal) AS total, COUNT(*) AS jumlah
     FROM cashflow_transaksi t
     JOIN cashflow_kategori k ON k.id = t.kategori_id
     ${where.replace(/tanggal/g, 't.tanggal')}
       AND t.tipe = 'in' AND k.termasuk_laba_rugi = 1
     GROUP BY k.nama`,
    params
  );
  const pendapatanCashflow = pendapatanCashflowRows.map(r => ({ label: r.label, total: Number(r.total), jumlah: r.jumlah }));

  const perKategoriPendapatanLain = gabungKategori(pendapatanLegacy, pendapatanCashflow);
  const totalPendapatanLain = perKategoriPendapatanLain.reduce((s, r) => s + r.total, 0);

  const pendapatanTotal = bisnis.pendapatan_bersih + totalPendapatanLain;
  const pendapatanSetelahUjroh = pendapatanTotal - bisnis.komisi;
  const labaBersihBisnis = pendapatanSetelahUjroh - hppReal;
  const labaBersihPerusahaan = labaBersihBisnis - totalOpex - totalReimbursePending;

  return {
    pendapatan_booking: bisnis.pendapatan_bersih,
    pendapatan_lain: totalPendapatanLain,
    pendapatan_lain_detail: perKategoriPendapatanLain,
    pendapatan_total: pendapatanTotal,
    komisi: bisnis.komisi,
    pendapatan_setelah_ujroh: pendapatanSetelahUjroh, // bersih setelah ujroh, sebelum HPP
    hpp: hppReal, // REAL (duit vendor beneran keluar) — bukan budget, lihat komentar fungsi
    hpp_budget_referensi: bisnis.hpp, // cuma buat perbandingan/referensi, TIDAK dipakai di perhitungan laba manapun
    laba_bersih_bisnis: labaBersihBisnis, // sebelum opex, sudah termasuk pendapatan lain
    pengeluaran_operasional: perKategoriOpex,
    total_pengeluaran_operasional: totalOpex,
    reimburse_pending_detail: reimbursePendingDetail,
    total_reimburse_pending: totalReimbursePending,
    laba_bersih_perusahaan: labaBersihPerusahaan, // setelah opex & estimasi reimburse pending — P&L sesungguhnya
  };
}

/**
 * Breakdown Laba Rugi per bulan buat 1 tahun penuh (Jan-Des) — dipakai view
 * tahunan yang pecah per kolom bulan, bukan cuma 1 angka gabungan. Manggil
 * hitungLaporanKeuanganPerusahaan() 12x lalu di-PIVOT jadi 1 baris per
 * kategori dengan array 12 angka (urut Jan..Des) + total setahun, biar tabel
 * gampang dirender (kolom = bulan, baris = item P&L).
 */
export async function hitungLaporanLabaRugiTahunan(pool, tahun) {
  const bulanList = [];
  const perBulan = [];
  for (let m = 1; m <= 12; m++) {
    const bulanStr = `${tahun}-${String(m).padStart(2, '0')}`;
    const akhir = new Date(Number(tahun), m, 0).getDate();
    const data = await hitungLaporanKeuanganPerusahaan(pool, {
      from: `${bulanStr}-01`, to: `${bulanStr}-${String(akhir).padStart(2, '0')}`,
    });
    bulanList.push(bulanStr);
    perBulan.push(data);
  }

  const jumlahkan = (arr) => arr.reduce((s, v) => s + Number(v || 0), 0);
  const ambilArray = (ambil) => perBulan.map(ambil);

  // Union label kategori yang muncul di bulan mana pun — biar tiap baris
  // konsisten 12 kolom (0 kalau bulan itu gak ada kategori tsb).
  function pivotKategori(ambilList) {
    const labelSet = new Set();
    perBulan.forEach(d => ambilList(d).forEach(k => labelSet.add(k.label)));
    return [...labelSet].map(label => {
      const perBulanArr = perBulan.map(d => ambilList(d).find(k => k.label === label)?.total || 0);
      return { label, per_bulan: perBulanArr, total: jumlahkan(perBulanArr) };
    });
  }

  const totalBiaya = perBulan.map(d =>
    Number(d.komisi || 0) + Number(d.hpp || 0) + Number(d.total_pengeluaran_operasional || 0) + Number(d.total_reimburse_pending || 0)
  );

  return {
    bulan_list: bulanList,
    pendapatan_booking: ambilArray(d => d.pendapatan_booking),
    pendapatan_lain_rows: pivotKategori(d => d.pendapatan_lain_detail),
    pendapatan_total: ambilArray(d => d.pendapatan_total),
    komisi: ambilArray(d => d.komisi),
    hpp: ambilArray(d => d.hpp),
    pengeluaran_rows: pivotKategori(d => d.pengeluaran_operasional),
    reimburse_rows: pivotKategori(d => d.reimburse_pending_detail),
    total_biaya: totalBiaya,
    laba_rugi: ambilArray(d => d.laba_bersih_perusahaan),
  };
}
