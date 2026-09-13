import { existsSync } from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { absolutePathDariUrl } from '@/lib/dokumenProteksi';

// Nama file yang aman buat dipakai di path ZIP (hindari karakter yang bikin
// masalah lintas OS pas diekstrak jamaah/admin).
function amanNama(s) {
  return String(s || '-').replace(/[/\\?%*:|"<>]/g, '-').trim() || '-';
}

// Tambah 1 file ke archive kalau beneran ada di disk — dokumen yang belum
// pernah diupload (mis. jamaah belum sempat kirim scan paspor) dilewati diam2
// biar 1 file hilang gak bikin proses export gagal total. Bug nyata
// ditemukan 2026-09-11: sebelum pakai absolutePathDariUrl(), fungsi ini
// selalu nyari ke public/ buat SEMUA path — diam-diam gagal nemu file
// kategori privat (private-uploads/, sejak migrasi 2026-09-03) tanpa error.
function tambahFile(archive, publicPath, namaDiArsip) {
  if (!publicPath) return;
  const absPath = absolutePathDariUrl(publicPath);
  if (!existsSync(absPath)) return;
  archive.file(absPath, { name: namaDiArsip });
}

// GET /api/admin/export-dokumen?prog_id=  — ZIP semua dokumen (identitas
// jamaah, bukti transfer, Perjanjian Jamaah, Invoice/Kwitansi/TTU) milik
// booking-booking dalam 1 program, buat diarsipkan manual (mis. dipindah ke
// Google Drive begitu program selesai berangkat). TIDAK menghapus apapun
// dari server — murni unduh.
export async function GET(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const progId = searchParams.get('prog_id');
    if (!progId) return Response.json({ error: 'prog_id wajib diisi' }, { status: 400 });

    const [[program]] = await pool.query('SELECT id, name FROM programs WHERE id = ?', [progId]);
    if (!program) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });

    const [bookings] = await pool.query(
      `SELECT b.*, u.name AS pemesan_nama
       FROM bookings b LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
       WHERE b.prog_id = ?`,
      [progId]
    );
    if (bookings.length === 0) {
      return Response.json({ error: 'Belum ada booking di program ini' }, { status: 404 });
    }

    const bookingIds = bookings.map(b => b.id);
    const [invoiceRows] = await pool.query(
      `SELECT id, booking_id, jenis, nomor, scan_fisik_path FROM invoice_kwitansi WHERE booking_id IN (${bookingIds.map(() => '?').join(',')})`,
      bookingIds
    );
    const [paymentRows] = await pool.query(
      `SELECT booking_id, type, bukti_path FROM payments WHERE booking_id IN (${bookingIds.map(() => '?').join(',')}) AND bukti_path IS NOT NULL`,
      bookingIds
    );
    const invoiceIds = invoiceRows.map(i => i.id);
    const [sigRows] = await pool.query(
      `SELECT dokumen, ref_id, pdf_final_path FROM dokumen_signature
       WHERE (dokumen = 'jamaah' AND ref_id IN (${bookingIds.map(() => '?').join(',')}))
          OR (dokumen = 'invoice' AND ref_id IN (${invoiceIds.length > 0 ? invoiceIds.map(() => '?').join(',') : 'NULL'}))`,
      invoiceIds.length > 0 ? [...bookingIds, ...invoiceIds] : bookingIds
    );
    const sigJamaahMap = new Map(sigRows.filter(s => s.dokumen === 'jamaah').map(s => [String(s.ref_id), s.pdf_final_path]));
    const sigInvoiceMap = new Map(sigRows.filter(s => s.dokumen === 'invoice').map(s => [String(s.ref_id), s.pdf_final_path]));

    // Archiver v8 sendiri sudah stream Transform (extends Transform) — gak
    // perlu di-pipe ke PassThrough terpisah, cukup dengarkan 'data'/'end'
    // langsung di objeknya buat dikumpulin jadi 1 Buffer.
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', (c) => chunks.push(c));
    const selesai = new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });

    for (const b of bookings) {
      const folder = `${amanNama(b.id)}_${amanNama(b.pemesan_nama)}`;

      let jd = b.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = []; } }
      if (Array.isArray(jd)) {
        jd.forEach((j, idx) => {
          const sub = `jamaah_${idx + 1}_${amanNama(j.nama)}`;
          tambahFile(archive, j.doc_paspor, `${folder}/${sub}/paspor${path.extname(j.doc_paspor || '')}`);
          tambahFile(archive, j.doc_ktp, `${folder}/${sub}/ktp${path.extname(j.doc_ktp || '')}`);
          tambahFile(archive, j.doc_kk, `${folder}/${sub}/kk${path.extname(j.doc_kk || '')}`);
          tambahFile(archive, j.doc_vaksin, `${folder}/${sub}/vaksin${path.extname(j.doc_vaksin || '')}`);
          tambahFile(archive, j.doc_foto, `${folder}/${sub}/foto${path.extname(j.doc_foto || '')}`);
        });
      }

      tambahFile(archive, b.perjanjian_scan_path, `${folder}/perjanjian-jamaah-fisik${path.extname(b.perjanjian_scan_path || '')}`);
      const perjanjianPdf = sigJamaahMap.get(String(b.id));
      tambahFile(archive, perjanjianPdf, `${folder}/perjanjian-jamaah-digital${path.extname(perjanjianPdf || '')}`);

      for (const p of paymentRows.filter(p => p.booking_id === b.id)) {
        tambahFile(archive, p.bukti_path, `${folder}/bukti-${p.type}${path.extname(p.bukti_path || '')}`);
      }

      for (const inv of invoiceRows.filter(i => i.booking_id === b.id)) {
        tambahFile(archive, inv.scan_fisik_path, `${folder}/${inv.jenis}-${amanNama(inv.nomor)}-fisik${path.extname(inv.scan_fisik_path || '')}`);
        const invPdf = sigInvoiceMap.get(String(inv.id));
        tambahFile(archive, invPdf, `${folder}/${inv.jenis}-${amanNama(inv.nomor)}-digital${path.extname(invPdf || '')}`);
      }
    }

    await archive.finalize();
    await selesai;
    const buffer = Buffer.concat(chunks);
    const tanggal = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="jm-travel-dokumen-${amanNama(program.name)}-${tanggal}.zip"`,
      },
    });
  } catch (error) {
    console.error('Gagal export dokumen:', error);
    return Response.json({ error: 'Gagal membuat file export' }, { status: 500 });
  }
}
