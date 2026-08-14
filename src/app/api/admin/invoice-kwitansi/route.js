import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { generateNomorInvoice, generateNomorKwitansi, generateNomorTandaTerima } from '@/lib/nomorInvoiceKwitansi';
import { syncKwitansiDariInvoice } from '@/lib/invoiceKwitansi';

const JENIS_VALID = ['invoice', 'kwitansi', 'tanda_terima'];
const NOMOR_GENERATOR = {
  kwitansi: generateNomorKwitansi,
  tanda_terima: generateNomorTandaTerima,
};

// GET /api/admin/invoice-kwitansi?q=... — daftar semua dokumen (buat halaman manajemen)
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE ik.nama LIKE ? OR ik.booking_id LIKE ? OR ik.nomor LIKE ?';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    // payment_type (dp/lunas) dari payments yang nempel ke Tanda Terima Uang
    // — dipakai frontend buat masangin tombol "Cetak Tanda Terima" ke baris
    // Invoice DP/Pelunasan yang cocok (booking_id sama + tipe sama).
    const [rows] = await pool.query(
      `SELECT ik.*, p.type AS payment_type
       FROM invoice_kwitansi ik LEFT JOIN payments p ON p.id = ik.payment_id
       ${where} ORDER BY ik.created_at DESC`,
      params
    );
    return Response.json({ dokumen: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — buat dokumen MANUAL (selalu bikin baris baru, gak ada dedup check
// kayak jalur /auto — tiap submit manual = 1 dokumen baru, tetap konsumsi
// nomor urut resmi yang sama).
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { jenis, booking_id, nama, nominal, judul, keterangan, tanggal } = await request.json();
    if (!JENIS_VALID.includes(jenis)) {
      return Response.json({ error: 'Jenis dokumen tidak valid' }, { status: 400 });
    }
    if (jenis === 'invoice' && !judul?.trim()) {
      return Response.json({ error: 'Judul invoice wajib diisi' }, { status: 400 });
    }
    if (!nama?.trim()) return Response.json({ error: 'Nama wajib diisi' }, { status: 400 });
    if (!nominal || Number(nominal) <= 0) return Response.json({ error: 'Nominal wajib diisi' }, { status: 400 });
    if (!tanggal) return Response.json({ error: 'Tanggal wajib diisi' }, { status: 400 });

    const nomor = await (NOMOR_GENERATOR[jenis] || generateNomorInvoice)(pool);

    const [result] = await pool.query(
      `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, nama, nominal, judul, keterangan, tanggal, is_manual, dibuat_oleh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [nomor, jenis, booking_id || null, nama.trim(), Number(nominal), jenis === 'invoice' ? judul.trim() : null, keterangan || null, tanggal, auth.user.id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'buat_invoice_kwitansi_manual',
      target_type: 'invoice_kwitansi',
      target_id: result.insertId,
      keterangan: `${nomor} — ${jenis} — ${nama.trim()} — Rp${Number(nominal).toLocaleString('id-ID')}`,
    });

    return Response.json({ message: 'Dokumen dibuat!', id: result.insertId, nomor }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH { id, status } — tandai dokumen (Invoice ATAU Kwitansi) paid/unpaid
// manual. Invoice biasanya ditoggle sbg tagihan yang belum dibayar; Kwitansi
// statusnya normalnya di-set otomatis tiap generateOrUpdateKwitansi/
// syncKwitansiDariInvoice jalan tapi tetap bisa dioverride manual di sini —
// override itu bisa ketimpa lagi kalau nanti ada sync otomatis baru (payment
// approval dsb), krn sumber kebenaran tetap data pembayaran asli.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, status } = await request.json();
    if (!id || !['unpaid', 'paid'].includes(status)) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [[existing]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });

    await pool.query('UPDATE invoice_kwitansi SET status = ? WHERE id = ?', [status, id]);

    // Ditandai 'paid' -> ikut sinkronin ke Kwitansi Pembayaran booking ini
    // (dibuat kalau belum ada, di-update kalau udah) — biar gak perlu
    // digenerate manual terpisah tiap invoice ditandai lunas.
    if (status === 'paid') {
      try {
        await syncKwitansiDariInvoice(pool, id);
      } catch (e) {
        console.error('Gagal sinkron kwitansi dari invoice:', e);
      }
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'ubah_status_invoice_kwitansi',
      target_type: 'invoice_kwitansi',
      target_id: id,
      keterangan: `${existing.nomor} — ${existing.status} → ${status}`,
    });

    return Response.json({ message: 'Status diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
