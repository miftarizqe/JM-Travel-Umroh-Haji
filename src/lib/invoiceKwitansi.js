import { generateNomorKwitansi, generateNomorTandaTerima } from './nomorInvoiceKwitansi';

const fmtTgl = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Kwitansi Pembayaran = dokumen FINAL 1x per booking, cuma terbit begitu
 * pembayaran LUNAS TOTAL (booking.pelunasan_status === 'paid') — bukan dari
 * DP. Bukti terima per-transaksi (DP/cicilan) sebelum lunas total dipegang
 * sama Tanda Terima Uang (lihat generateTandaTerimaUntukPayment), bukan
 * Kwitansi.
 *
 * Idempotent per booking_id (dedup check) — kalau kepanggil berkali-kali
 * (retry hook, generate manual ulang) gak bikin baris/nomor baru, cuma
 * refresh angkanya.
 *
 * Dipanggil dari 2 tempat: otomatis dari PATCH /api/payments pas admin
 * approve pembayaran TIPE 'lunas', dan manual dari
 * POST /api/admin/invoice-kwitansi/auto (generate ulang/retroaktif).
 *
 * @returns {Promise<{id:number, nomor:string, isNew:boolean}|null>} null kalau belum lunas total.
 */
export async function generateOrUpdateKwitansi(pool, bookingId, actorUserId) {
  const [[booking]] = await pool.query(
    `SELECT b.*, u.name AS pemesan_nama FROM bookings b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?`,
    [bookingId]
  );
  if (!booking || booking.pelunasan_status !== 'paid') return null;

  const [[bayarDp]] = await pool.query(
    `SELECT amount FROM payments WHERE booking_id = ? AND type = 'dp' AND status = 'confirmed'
     ORDER BY created_at DESC LIMIT 1`,
    [bookingId]
  );
  const nominalDp = Number(bayarDp?.amount ?? booking.dp_amount ?? 0);

  const [[bayarLunas]] = await pool.query(
    `SELECT amount FROM payments WHERE booking_id = ? AND type = 'lunas' AND status = 'confirmed'
     ORDER BY created_at DESC LIMIT 1`,
    [bookingId]
  );
  const nominalPelunasan = Number(bayarLunas?.amount ?? (Number(booking.total_harga || 0) - nominalDp));
  const nominal = nominalDp + nominalPelunasan;

  const [[existing]] = await pool.query(
    `SELECT id, nomor FROM invoice_kwitansi WHERE booking_id = ? AND jenis = 'kwitansi'`,
    [bookingId]
  );

  if (existing) {
    await pool.query(
      "UPDATE invoice_kwitansi SET nominal = ?, nominal_dp = ?, nominal_pelunasan = ?, status = 'paid' WHERE id = ?",
      [nominal, nominalDp, nominalPelunasan, existing.id]
    );
    return { id: existing.id, nomor: existing.nomor, isNew: false };
  }

  const nomor = await generateNomorKwitansi(pool);
  const [result] = await pool.query(
    `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, nama, nominal, tanggal, is_manual, dibuat_oleh, nominal_dp, nominal_pelunasan, status)
     VALUES (?, 'kwitansi', ?, ?, ?, ?, 0, ?, ?, ?, 'paid')`,
    [nomor, bookingId, booking.pemesan_nama || '-', nominal, fmtTgl(new Date()), actorUserId || null, nominalDp, nominalPelunasan]
  );
  return { id: result.insertId, nomor, isNew: true };
}

/**
 * Dipanggil begitu 1 Invoice ditandai 'paid' manual (toggle di halaman
 * daftar) — Invoice sekarang generik (bisa DP/Pelunasan/cicilan ke berapa
 * pun, dibedain dari `judul` bebas, bukan `jenis`), jadi sinyal LUNAS TOTAL
 * gak bisa lagi dibaca dari jenis 1 invoice doang. Sebagai gantinya: begitu
 * SATU invoice ditandai paid, cek TOTAL SUM nominal semua invoice booking
 * ini yang statusnya paid — kalau udah nutup total_harga, berarti lunas
 * total, baru Kwitansi disinkron/dibuat. Ini nangkep kasus admin nandain
 * invoice2 lunas manual duluan sebelum booking.pelunasan_status di tabel
 * bookings ke-update (mis. dibayar lewat kanal yang gak lewat /api/payments).
 *
 * Nominal DP/Pelunasan buat breakdown Kwitansi tetap diambil dari
 * payments/booking asli (BUKAN dari nominal invoice2 yang bebas itu) — biar
 * angka di Kwitansi selalu representasi duit yang BENERAN diterima.
 *
 * @returns {Promise<{id:number, nomor:string, isNew:boolean}|null>} null kalau invoice ini
 *   bukan jenis 'invoice', gak ada booking_id-nya, atau total invoice paid
 *   booking ini belum menutup total_harga.
 */
export async function syncKwitansiDariInvoice(pool, invoiceId) {
  const [[inv]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [invoiceId]);
  if (!inv || !inv.booking_id || inv.status !== 'paid' || inv.jenis !== 'invoice') {
    return null;
  }

  const [[booking]] = await pool.query(
    `SELECT b.id, b.dp_amount, b.total_harga, u.name AS pemesan_nama FROM bookings b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?`,
    [inv.booking_id]
  );
  if (!booking) return null;

  const [[{ totalInvoicePaid }]] = await pool.query(
    `SELECT COALESCE(SUM(nominal), 0) AS totalInvoicePaid FROM invoice_kwitansi
     WHERE booking_id = ? AND jenis = 'invoice' AND status = 'paid'`,
    [inv.booking_id]
  );
  if (Number(totalInvoicePaid) < Number(booking.total_harga || 0)) return null; // belum nutup total_harga, belum lunas total

  const [[bayarDp]] = await pool.query(
    `SELECT amount FROM payments WHERE booking_id = ? AND type = 'dp' AND status = 'confirmed'
     ORDER BY created_at DESC LIMIT 1`,
    [inv.booking_id]
  );
  const nominalDp = Number(bayarDp?.amount ?? booking.dp_amount ?? 0);

  const [[bayarLunas]] = await pool.query(
    `SELECT amount FROM payments WHERE booking_id = ? AND type = 'lunas' AND status = 'confirmed'
     ORDER BY created_at DESC LIMIT 1`,
    [inv.booking_id]
  );
  const nominalPelunasan = Number(bayarLunas?.amount ?? (Number(booking.total_harga || 0) - nominalDp));
  const nominal = nominalDp + nominalPelunasan;

  const [[existingKwt]] = await pool.query(
    `SELECT * FROM invoice_kwitansi WHERE booking_id = ? AND jenis = 'kwitansi'`,
    [inv.booking_id]
  );

  if (existingKwt) {
    await pool.query(
      "UPDATE invoice_kwitansi SET nominal = ?, nominal_dp = ?, nominal_pelunasan = ?, status = 'paid' WHERE id = ?",
      [nominal, nominalDp, nominalPelunasan, existingKwt.id]
    );
    return { id: existingKwt.id, nomor: existingKwt.nomor, isNew: false };
  }

  const nomor = await generateNomorKwitansi(pool);
  const [result] = await pool.query(
    `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, nama, nominal, tanggal, is_manual, dibuat_oleh, nominal_dp, nominal_pelunasan, status)
     VALUES (?, 'kwitansi', ?, ?, ?, ?, 0, ?, ?, ?, 'paid')`,
    [nomor, inv.booking_id, booking.pemesan_nama || inv.nama || '-', nominal, fmtTgl(new Date()), inv.dibuat_oleh, nominalDp, nominalPelunasan]
  );
  return { id: result.insertId, nomor, isNew: true };
}

/**
 * Tanda Terima Uang = 1 dokumen PER PEMBAYARAN yang confirmed (DP, cicilan,
 * atau pelunasan) — bukti uang itu spesifik diterima, beda dari Kwitansi
 * yang cuma dokumen final sekali pas lunas total. Nomor dibekukan permanen
 * begitu terbit.
 *
 * Idempotent per payment_id — kalau hook approve kepanggil dobel (retry),
 * gak bikin dokumen kedua buat pembayaran yang sama, balikin yang udah ada.
 * Statusnya SELALU 'paid' (dokumen ini emang cuma dibuat begitu uangnya
 * beneran udah diterima/confirmed, jadi gak ada state "belum dibayar").
 *
 * @returns {Promise<{id:number, nomor:string, isNew:boolean}|null>} null kalau payment gak
 *   ditemukan atau belum confirmed.
 */
export async function generateTandaTerimaUntukPayment(pool, paymentId, actorUserId) {
  const [[existing]] = await pool.query(
    `SELECT id, nomor FROM invoice_kwitansi WHERE payment_id = ? AND jenis = 'tanda_terima'`,
    [paymentId]
  );
  if (existing) return { id: existing.id, nomor: existing.nomor, isNew: false };

  const [[payment]] = await pool.query('SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!payment || payment.status !== 'confirmed') return null;

  const [[booking]] = await pool.query(
    `SELECT b.id, u.name AS pemesan_nama FROM bookings b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?`,
    [payment.booking_id]
  );

  const nomor = await generateNomorTandaTerima(pool);
  const [result] = await pool.query(
    `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, payment_id, nama, nominal, tanggal, is_manual, dibuat_oleh, status)
     VALUES (?, 'tanda_terima', ?, ?, ?, ?, ?, 0, ?, 'paid')`,
    [nomor, payment.booking_id || null, paymentId, booking?.pemesan_nama || '-', Number(payment.amount), fmtTgl(payment.created_at || new Date()), actorUserId || null]
  );
  return { id: result.insertId, nomor, isNew: true };
}

/**
 * Tanda Terima Uang yang belum "dikirim" (belum dipilih jalur fisik/digital
 * sama sekali) — dipakai cluster "Perlu Perhatian" di admin dashboard biar
 * TTU gak nongkrong di DB doang tanpa pernah sampai ke jamaah. Baru dipakai
 * untuk jenis 'tanda_terima' (yang eksplisit diminta) — kolom terkirim di
 * invoice_kwitansi sendiri generik, bisa diperluas ke jenis lain belakangan.
 */
export async function daftarTtuBelumDikirim(pool) {
  const [rows] = await pool.query(
    `SELECT ik.id, ik.nomor, ik.nominal, ik.tanggal, ik.booking_id, b.prog_name,
            COALESCE(u.name, ik.nama) AS nama, u.wa
     FROM invoice_kwitansi ik
     LEFT JOIN bookings b ON b.id = ik.booking_id
     LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
     WHERE ik.jenis = 'tanda_terima' AND ik.terkirim = 0
     ORDER BY ik.created_at ASC`
  );
  return rows;
}
