import ExcelJS from 'exceljs';
import { wajibRole } from '@/lib/auth';
import { ambilManifest } from '@/app/api/admin/manifest/route';

const tglSingkat = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase() : '-';

// Kolom & style di-samain persis kayak format manifest yang dipakai JM Travel
// buat urus visa/tiket ("MANIFEST JAMAAH JM TRAVEL.xlsx" contoh dari user) —
// bukan template export generik lain di /api/admin/export.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const program = searchParams.get('program');
    if (!program) return Response.json({ error: 'Parameter program wajib diisi' }, { status: 400 });

    const { program: prog, rows } = await ambilManifest(program);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Manifest');
    sheet.columns = [
      { key: 'no', width: 5 },
      { key: 'nama', width: 32 },
      { key: 'jk', width: 9 },
      { key: 'tl', width: 16 },
      { key: 'ttl', width: 15 },
      { key: 'paspor', width: 14 },
      { key: 'exp_mulai', width: 15 },
      { key: 'exp_paspor', width: 15 },
      { key: 'tkp', width: 16 },
      { key: 'mahram', width: 24 },
    ];

    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = `MANIFEST UMROH TGL ${tglSingkat(prog.tanggal_berangkat)}`;
    sheet.mergeCells('A2:J2');
    sheet.getCell('A2').value = 'PT. ALKHALID JAYA MEGAH';
    ['A1', 'A2'].forEach(key => {
      sheet.getCell(key).font = { bold: true, size: 16 };
      sheet.getCell(key).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    sheet.addRow([]); // baris kosong pemisah judul
    const header = ['NO', 'FULL NAME', 'GENDER', 'PLACE OF BIRTH', 'DATE OF BIRTH', 'PASPOR NUMBER', 'DATE OF ISSUED', 'DATE OF EXPIRED', 'CITY OF ISSUED', 'MAHRAM'];
    const hRow = sheet.addRow(header);
    hRow.eachCell(cell => {
      cell.font = { bold: true, size: 12 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    rows.forEach((r, i) => {
      const row = sheet.addRow([
        i + 1, r.nama, r.jk === 'Laki-Laki' ? 'M' : r.jk === 'Perempuan' ? 'F' : r.jk,
        r.tl, r.ttl ? new Date(r.ttl) : null, r.paspor,
        r.exp_mulai ? new Date(r.exp_mulai) : null, r.exp_paspor ? new Date(r.exp_paspor) : null,
        r.tkp, r.mahram,
      ]);
      [5, 7, 8].forEach(col => { row.getCell(col).numFmt = 'dd/mm/yyyy'; });
      row.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filenameSafe = program.replace(/[^a-zA-Z0-9]+/g, '-');

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="manifest-${filenameSafe}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Gagal export manifest:', error);
    return Response.json({ error: 'Gagal membuat file manifest' }, { status: 500 });
  }
}
