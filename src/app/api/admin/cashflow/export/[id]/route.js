import ExcelJS from 'exceljs';
import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const namaBulan = (b) => {
  if (!b) return '-';
  const [y, m] = b.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

// Format tanggal manual dari komponen LOKAL (getDate/getMonth/getFullYear),
// BUKAN toISOString/Date mentah ke ExcelJS — mysql2 mem-parse kolom DATE
// pakai timezone lokal proses Node, tapi ExcelJS men-serialize object Date
// berbasis UTC. Kalau timezone lokal server di depan UTC (mis. WIB/+7),
// hasilnya selalu mundur 1 hari pas dibuka di Excel. Nulis sbg teks
// "DD/MM/YYYY" dari getter lokal (bukan getUTC*) menghindari itu sama sekali.
function fmtTanggal(d) {
  if (!d) return '';
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

// GET /api/admin/cashflow/export/[id] — download Excel 1 periode cashflow,
// lengkap dgn Saldo Awal, Total Masuk, Total Keluar, & Saldo Akhir per akun
// (semua pakai RUMUS Excel beneran — SUMIFS & referensi antar baris, bukan
// angka mati hasil hitungan server) biar bisa diverifikasi ulang manual.
export async function GET(request, { params }) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [id]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });

    const [akunList] = await pool.query(
      'SELECT * FROM cashflow_akun WHERE aktif = 1 ORDER BY urutan ASC, id ASC'
    );
    const [saldoAwalRows] = await pool.query(
      'SELECT akun_id, saldo_awal FROM cashflow_saldo_awal WHERE periode_id = ?', [id]
    );
    const saldoAwalMap = {};
    saldoAwalRows.forEach(r => { saldoAwalMap[r.akun_id] = Number(r.saldo_awal); });

    const [transaksi] = await pool.query(
      `SELECT t.*, a.nama AS akun_nama, k.nama AS kategori_nama, u.name AS input_oleh_nama
       FROM cashflow_transaksi t
       LEFT JOIN cashflow_akun a ON a.id = t.akun_id
       LEFT JOIN cashflow_kategori k ON k.id = t.kategori_id
       LEFT JOIN users u ON u.id = t.input_oleh
       WHERE t.periode_id = ?
       ORDER BY t.tanggal ASC, t.id ASC`,
      [id]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cashflow');
    sheet.columns = [
      { key: 'tanggal', width: 14 },
      { key: 'deskripsi', width: 36 },
      { key: 'kategori', width: 18 },
      { key: 'akun', width: 16 },
      { key: 'tipe', width: 8 },
      { key: 'nominal', width: 16 },
      { key: 'dihitung', width: 16 },
      { key: 'penerima_settlement', width: 20 },
      { key: 'bukti_nama', width: 24 },
      { key: 'input_oleh', width: 18 },
    ];

    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = `Cashflow ${namaBulan(periode.bulan)}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.addRow([]);

    const judulSaldoAwal = sheet.addRow({ deskripsi: 'SALDO AWAL' });
    judulSaldoAwal.eachCell(c => { c.font = { bold: true }; });

    const barisSaldoAwal = {}; // akun_id -> nomor baris, dipakai lagi di formula saldo akhir
    akunList.forEach(a => {
      const row = sheet.addRow({ akun: a.nama, nominal: Number(saldoAwalMap[a.id] || 0) });
      row.getCell('nominal').numFmt = '#,##0';
      barisSaldoAwal[a.id] = row.number;
    });
    sheet.addRow([]);

    const headerRow = sheet.addRow({
      tanggal: 'Tanggal', deskripsi: 'Deskripsi', kategori: 'Kategori', akun: 'Akun',
      tipe: 'Tipe', nominal: 'Nominal', dihitung: 'Dihitung ke Saldo',
      penerima_settlement: 'Transfer ke Staff', bukti_nama: 'File Bon', input_oleh: 'Input Oleh',
    });
    headerRow.eachCell(c => {
      c.font = { bold: true };
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const dataStartRow = headerRow.number + 1;
    transaksi.forEach(t => {
      // Sama kayak KLAUSA_HITUNG_SALDO di src/lib/cashflow.js — breakdown
      // settlement (settlement_induk_id + tipe out) sudah kehitung pas
      // transfer awal ke staff dicatat, jadi jangan dobel dihitung lagi.
      const dihitung = !(t.settlement_induk_id && t.tipe === 'out');
      const row = sheet.addRow({
        tanggal: fmtTanggal(t.tanggal),
        deskripsi: t.deskripsi,
        kategori: t.kategori_nama || '',
        akun: t.akun_nama || '',
        tipe: t.tipe === 'in' ? 'IN' : 'OUT',
        nominal: Number(t.nominal),
        dihitung: dihitung ? 'Ya' : 'Tidak',
        penerima_settlement: t.penerima_settlement || '',
        bukti_nama: t.bukti_nama || '',
        input_oleh: t.input_oleh_nama || '',
      });
      row.getCell('nominal').numFmt = '#,##0';
    });
    const dataEndRow = dataStartRow + transaksi.length - 1;
    const adaData = dataEndRow >= dataStartRow;

    // SUMIFS "Nominal utk akun X, Tipe = Y, Dihitung = Ya" — dipakai bareng
    // buat baris Total Masuk & Total Keluar.
    const sumifs = (akunNama, tipe) => adaData
      ? `SUMIFS($F$${dataStartRow}:$F$${dataEndRow},$D$${dataStartRow}:$D$${dataEndRow},"${akunNama}",$E$${dataStartRow}:$E$${dataEndRow},"${tipe}",$G$${dataStartRow}:$G$${dataEndRow},"Ya")`
      : '0';

    sheet.addRow([]);
    const judulMasuk = sheet.addRow({ deskripsi: 'TOTAL MASUK' });
    judulMasuk.eachCell(c => { c.font = { bold: true }; });
    const barisMasuk = {};
    akunList.forEach(a => {
      const row = sheet.addRow({ akun: a.nama, nominal: { formula: `=${sumifs(a.nama, 'IN')}` } });
      row.getCell('nominal').numFmt = '#,##0';
      barisMasuk[a.id] = row.number;
    });

    sheet.addRow([]);
    const judulKeluar = sheet.addRow({ deskripsi: 'TOTAL KELUAR' });
    judulKeluar.eachCell(c => { c.font = { bold: true }; });
    const barisKeluar = {};
    akunList.forEach(a => {
      const row = sheet.addRow({ akun: a.nama, nominal: { formula: `=${sumifs(a.nama, 'OUT')}` } });
      row.getCell('nominal').numFmt = '#,##0';
      barisKeluar[a.id] = row.number;
    });

    sheet.addRow([]);
    const judulSaldoAkhir = sheet.addRow({ deskripsi: 'SALDO AKHIR' });
    judulSaldoAkhir.eachCell(c => { c.font = { bold: true }; });

    akunList.forEach(a => {
      // = Saldo Awal + Total Masuk - Total Keluar (rujuk baris di atas,
      // bukan SUMIFS ulang) — biar rumusnya jelas nyambung sama breakdown
      // yang udah kelihatan barisnya sendiri-sendiri.
      const formula = `=F${barisSaldoAwal[a.id]}+F${barisMasuk[a.id]}-F${barisKeluar[a.id]}`;
      const row = sheet.addRow({ akun: a.nama, nominal: { formula } });
      row.getCell('nominal').numFmt = '#,##0';
      row.eachCell(c => { c.font = { bold: true }; });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cashflow-${periode.bulan}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Gagal export cashflow:', error);
    return Response.json({ error: 'Gagal membuat file Excel' }, { status: 500 });
  }
}
