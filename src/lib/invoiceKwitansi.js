import { generateNomorInvoice, generateNomorKwitansi, generateNomorTandaTerima } from './nomorInvoiceKwitansi';
import { resolveJamaahHarga } from './jamaahHarga';
import { hitungSisaBayar } from './pelunasan';

const fmtTgl = (d) => new Date(d).toISOString().slice(0, 10);

// Nomor TTU/Kwitansi SEKARANG baru dibakar pas BENERAN "kepake" (dikonfirmasi
// user 2026-10-14) — bukan pas baris invoice_kwitansi dibuat (itu bisa jauh
// lebih dulu dari dokumennya beneran dilihat/dikirim, lihat migration 225).
// Dipanggil dari 2 titik: GET /api/admin/invoice-kwitansi/[id] (dokumen wajib
// materai — kepake begitu PERTAMA dibuka, karena dari situ udah bisa
// langsung diprint fisik) & POST .../setuju (dokumen gak wajib materai —
// kepake pas tombol "Kirim ke Jamaah" diklik). Idempotent: kalau nomor udah
// ada, gak digenerate ulang.
export async function pastikanNomorDokumen(pool, dokumen) {
  if (dokumen.nomor) return dokumen.nomor;
  const generator = { invoice: generateNomorInvoice, kwitansi: generateNomorKwitansi, tanda_terima: generateNomorTandaTerima }[dokumen.jenis];
  if (!generator) return dokumen.nomor;
  const nomor = await generator(pool);
  await pool.query('UPDATE invoice_kwitansi SET nomor = ? WHERE id = ?', [nomor, dokumen.id]);
  return nomor;
}

/**
 * Daftar {nama, paket, kamar, hargaJual} jamaah yang BENERAN ditutup 1
 * dokumen Tanda Terima Uang — SATU sumber dipakai bareng GET
 * /api/admin/invoice-kwitansi/[id] (preview, sebelum dikirim) & POST
 * .../setuju (freeze snapshot PAS dikirim, lihat migration 224). Payment
 * DP yang punya jamaah_data_snapshot sendiri (lihat src/lib/booking.js)
 * dipakai PERSIS itu — bukan jamaah_data booking TERKINI, biar TTU buat
 * gelombang DP tertentu gak ikut narik jamaah dari gelombang lain
 * (dikonfirmasi user 2026-10-14). Payment 'lunas' / DP lama tanpa snapshot
 * fallback ke SEMUA jamaah aktif booking (lunas emang nutup semuanya).
 */
export async function hitungJamaahBreakdownTtu(pool, dokumen) {
  if (!dokumen.booking_id) return [];
  const [[b]] = await pool.query(
    `SELECT jamaah_data, paket, kamar, total_harga, opsi_tambahan_total, voucher_nominal FROM bookings WHERE id = ?`,
    [dokumen.booking_id]
  );
  if (!b) return [];
  let jd = b.jamaah_data;
  if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
  const aktif = (Array.isArray(jd) ? jd : []).filter(j => j?.status_jamaah !== 'dibatalkan');

  let payment = null;
  if (dokumen.payment_id) {
    const [[p]] = await pool.query('SELECT type, jamaah_data_snapshot FROM payments WHERE id = ?', [dokumen.payment_id]);
    payment = p || null;
  }

  if (dokumen.jenis === 'tanda_terima' && payment?.type === 'dp' && payment.jamaah_data_snapshot) {
    let snap = payment.jamaah_data_snapshot;
    if (typeof snap === 'string') { try { snap = JSON.parse(snap); } catch { snap = null; } }
    if (Array.isArray(snap) && snap.length > 0) {
      return snap.map(j => ({ nama: j.nama || '-', paket: j.paket, kamar: j.kamar, hargaJual: Number(j.harga_jual) || 0 }));
    }
  }
  return aktif.map(j => {
    const r = resolveJamaahHarga({ ...b, jamaah_data: aktif }, j);
    return { nama: j.nama || '-', paket: r.paket, kamar: r.kamar, hargaJual: r.hargaJual };
  });
}

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

  // SUM, bukan ambil 1 baris terakhir — sejak fitur "Tambah Jamaah" (DP pax
  // tambahan = payment row type='dp' BARU & TERPISAH dari DP awal, lihat
  // src/lib/booking.js#tambahJamaahKeBooking), 1 booking bisa punya LEBIH
  // dari 1 payment DP confirmed. Ambil cuma yang terakhir bakal nunjukin
  // "DP sudah dibayar" di Kwitansi jauh lebih kecil dari yang beneran
  // ditransfer (dikonfirmasi user 2026-10-13).
  const [[bayarDp]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE booking_id = ? AND type = 'dp' AND status = 'confirmed'`,
    [bookingId]
  );
  const nominalDp = Number(bayarDp?.amount ?? booking.dp_amount ?? 0);

  // SUM juga — cicilan pelunasan (dikonfirmasi user 2026-10-14) bisa lebih
  // dari 1 payment type='lunas' confirmed per booking (gak lagi 1x bayar
  // langsung lunas total). Ambil cuma yang terakhir bakal nunjukin
  // "Pelunasan" di Kwitansi cuma sebesar cicilan PALING AKHIR doang,
  // bukan total semua cicilan yang beneran masuk.
  const [[bayarLunas]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE booking_id = ? AND type = 'lunas' AND status = 'confirmed'`,
    [bookingId]
  );
  // Math.max, bukan langsung pakai SUM payments doang (bug ditemukan user
  // 2026-10-14, "nominal kwitansi cuma 15 juta padahal udah semua
  // pelunasan") -- booking yang lunas-nya SEBAGIAN lewat Invoice-paid-
  // override (uang gak pernah masuk tabel payments sama sekali, lihat
  // syncKwitansiDariInvoice) bakal nunjukin SUM payments yang KURANG dari
  // seharusnya. Fungsi ini CUMA kepanggil begitu pelunasan_status UDAH
  // dipastikan 'paid' (dicek di atas) -- jadi total HARUS persis
  // total_harga, "Pelunasan" minimal nutup selisihnya, SUM payments asli
  // dipakai kalau itu udah cukup/lebih (lebih granular, lebih akurat).
  const nominalPelunasan = Math.max(Number(bayarLunas?.amount || 0), Number(booking.total_harga || 0) - nominalDp);
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

  // nomor DITUNDA (NULL) — baru dibakar pas dokumen beneran dibuka/dikirim
  // (lihat pastikanNomorDokumen), bukan di sini.
  const [result] = await pool.query(
    `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, nama, nominal, tanggal, is_manual, dibuat_oleh, nominal_dp, nominal_pelunasan, status)
     VALUES (NULL, 'kwitansi', ?, ?, ?, ?, 0, ?, ?, ?, 'paid')`,
    [bookingId, booking.pemesan_nama || '-', nominal, fmtTgl(new Date()), actorUserId || null, nominalDp, nominalPelunasan]
  );
  return { id: result.insertId, nomor: null, isNew: true };
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

  // Sisa BENERAN = sisa dari pembayaran ASLI (hitungSisaBayar — dp+lunas
  // confirmed di tabel payments) DIKURANGI semua Invoice yang udah
  // ditandai Paid manual (bug ditemukan user 2026-10-14: "invoice sisa
  // 111jt ditandai paid tapi tetap bilang belum lunas total"). Invoice-
  // paid merepresentasikan uang yang DITERIMA DI LUAR sistem (cash/
  // transfer manual, gak pernah ada baris di tabel payments) — sebelumnya
  // dicek CUMA dari SUM(invoice.nominal) doang, jadi DP yang udah dibayar
  // beneran lewat alur normal (gak pernah punya dokumen Invoice-nya sama
  // sekali) gak pernah ketung, bikin booking keliatan "belum nutup
  // total_harga" padahal gabungan DP asli + Invoice yang baru di-paid-in
  // ini udah pas/lebih.
  const sisaDariPembayaranAsli = await hitungSisaBayar(pool, inv.booking_id);
  const [[{ totalInvoicePaid }]] = await pool.query(
    `SELECT COALESCE(SUM(nominal), 0) AS totalInvoicePaid FROM invoice_kwitansi
     WHERE booking_id = ? AND jenis = 'invoice' AND status = 'paid'`,
    [inv.booking_id]
  );
  if (sisaDariPembayaranAsli - Number(totalInvoicePaid) > 0) return null; // belum nutup total_harga, belum lunas total

  // bookings.pelunasan_status DIIKUT-UPDATE di sini (ditemukan user
  // 2026-10-14: "udah paid-in invoice-nya tapi di Kelola Program masih
  // belum lunas") -- sebelumnya fungsi ini cuma bikin/update Kwitansi,
  // GAK PERNAH nyentuh pelunasan_status, padahal itu kolom yang dibaca
  // statusClosing()/Kelola Program/dashboard buat nentuin "udah lunas apa
  // belum". Kwitansi kebuat tapi booking-nya keliatan masih belum lunas.
  await pool.query("UPDATE bookings SET pelunasan_status = 'paid' WHERE id = ? AND pelunasan_status != 'paid'", [inv.booking_id]);

  // SUM — sama alasan kayak generateOrUpdateKwitansi di atas, 1 booking bisa
  // punya lebih dari 1 payment DP confirmed sejak fitur "Tambah Jamaah".
  const [[bayarDp]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE booking_id = ? AND type = 'dp' AND status = 'confirmed'`,
    [inv.booking_id]
  );
  const nominalDp = Number(bayarDp?.amount ?? booking.dp_amount ?? 0);

  // SUM juga — cicilan pelunasan (dikonfirmasi user 2026-10-14) bisa lebih
  // dari 1 payment type='lunas' confirmed per booking, bukan cuma yang
  // terakhir (lihat komentar sama di generateOrUpdateKwitansi).
  const [[bayarLunas]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE booking_id = ? AND type = 'lunas' AND status = 'confirmed'`,
    [inv.booking_id]
  );
  // Math.max — sama fix kayak generateOrUpdateKwitansi (bug "nominal
  // kwitansi kurang" ditemukan user 2026-10-14) -- di fungsi INI malah
  // lebih sering kena, karena dipicu justru dari Invoice yang DI-PAID-IN
  // (sumber duit yang gak pernah masuk payments). Total HARUS persis
  // total_harga begitu sampai sini (sisaDariPembayaranAsli - totalInvoicePaid
  // udah dipastikan <= 0 di atas).
  const nominalPelunasan = Math.max(Number(bayarLunas?.amount || 0), Number(booking.total_harga || 0) - nominalDp);
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

  // nomor DITUNDA (NULL) — sama pola kayak generateOrUpdateKwitansi di atas.
  const [result] = await pool.query(
    `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, nama, nominal, tanggal, is_manual, dibuat_oleh, nominal_dp, nominal_pelunasan, status)
     VALUES (NULL, 'kwitansi', ?, ?, ?, ?, 0, ?, ?, ?, 'paid')`,
    [inv.booking_id, booking.pemesan_nama || inv.nama || '-', nominal, fmtTgl(new Date()), inv.dibuat_oleh, nominalDp, nominalPelunasan]
  );
  return { id: result.insertId, nomor: null, isNew: true };
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

  // nomor DITUNDA (NULL) — baru dibakar pas dokumen beneran dibuka/dikirim
  // (lihat pastikanNomorDokumen), bukan di sini.
  const [result] = await pool.query(
    `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, payment_id, nama, nominal, tanggal, is_manual, dibuat_oleh, status)
     VALUES (NULL, 'tanda_terima', ?, ?, ?, ?, ?, 0, ?, 'paid')`,
    [payment.booking_id || null, paymentId, booking?.pemesan_nama || '-', Number(payment.amount), fmtTgl(payment.created_at || new Date()), actorUserId || null]
  );
  return { id: result.insertId, nomor: null, isNew: true };
}

// Kwitansi buat setoran pendaftaran Rp1.000.000 Sahabat Baitullah (gap
// ditemukan 2026-10-21, awalnya dibikin jenis 'tanda_terima' -- DIKOREKSI
// user hari sama: setoran ini LUNAS/TUNTAS buat transaksi ini, bukan DP yang
// masih nyisain pelunasan nanti, jadi aturannya sama kayak program biasa
// "Kwitansi cuma di pembayaran lunas total, TTU buat yang masih nyicil".
// Beda dari generateOrUpdateKwitansi di atas yang nempel ke tabel
// `payments`/`bookings`: setoran ini hidup di `sahabat_pendaftaran`, gak ada
// booking/payment row sama sekali, jadi booking_id & payment_id-nya NULL.
// Idempoten lewat sahabat_pendaftaran.kwitansi_setoran_pendaftaran_id
// (migration 246) — dipanggil ulang pas GANTI bukti TF gak bikin dobel.
export async function generateKwitansiSetoranPendaftaranSahabat(pool, userId, actorUserId) {
  const [[pendaftaran]] = await pool.query(
    'SELECT kwitansi_setoran_pendaftaran_id, program_id FROM sahabat_pendaftaran WHERE user_id = ?',
    [userId]
  );
  if (!pendaftaran) return null;
  if (pendaftaran.kwitansi_setoran_pendaftaran_id) {
    const [[existing]] = await pool.query('SELECT id, nomor FROM invoice_kwitansi WHERE id = ?', [pendaftaran.kwitansi_setoran_pendaftaran_id]);
    if (existing) return { id: existing.id, nomor: existing.nomor, isNew: false };
  }

  const [[user]] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  // Label baris item (dikonfirmasi user 2026-10-21) — DP buat target
  // keberangkatan yang dipilih pas wizard pendaftaran (bukan "Pembayaran
  // Total Paket" generik, itu kalimat buat kwitansi closing booking beneran
  // lunas). Reuse kolom `judul` yang sebelumnya cuma dipakai Invoice (lihat
  // migrations/111) -- DokumenCetak fallback ke LABEL_BARIS.kwitansi kalau
  // kolom ini NULL (mis. program_id belum keisi), jadi aman.
  let judul = null;
  if (pendaftaran.program_id) {
    const [[prog]] = await pool.query('SELECT tanggal_berangkat FROM programs WHERE id = ?', [pendaftaran.program_id]);
    if (prog?.tanggal_berangkat) {
      const bulanTahun = new Date(prog.tanggal_berangkat).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      judul = `DP Program Umroh Exclusive Sahabat Baitullah Keberangkatan ${bulanTahun}`;
    }
  }

  const [result] = await pool.query(
    `INSERT INTO invoice_kwitansi (nomor, jenis, booking_id, payment_id, nama, nominal, keterangan, judul, tanggal, is_manual, dibuat_oleh, status)
     VALUES (NULL, 'kwitansi', NULL, NULL, ?, 1000000, ?, ?, ?, 0, ?, 'paid')`,
    [user.name, 'Setoran pendaftaran Sahabat Baitullah', judul, fmtTgl(new Date()), actorUserId || userId]
  );
  await pool.query('UPDATE sahabat_pendaftaran SET kwitansi_setoran_pendaftaran_id = ? WHERE user_id = ?', [result.insertId, userId]);
  return { id: result.insertId, nomor: null, isNew: true };
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

/**
 * Booking LUNAS TOTAL (pelunasan_status='paid', bukan dibatalkan) yang
 * BELUM punya baris Kwitansi di invoice_kwitansi sama sekali — harusnya
 * HAMPIR SELALU auto-generate sendiri begitu lunas (lihat
 * generateOrUpdateKwitansi, dipanggil dari hook approve pembayaran &
 * checkout mandiri Sahabat Baitullah), jadi baris di sini nandain
 * KEMUNGKINAN ada yang kelewat/gagal auto-generate (dikonfirmasi user
 * 2026-10-13 — dipakai rekomendasi "perlu dibuatkan" di
 * /admin/invoice-kwitansi biar admin gak perlu cek manual program per
 * program).
 */
export async function daftarBookingPerluKwitansi(pool) {
  const [rows] = await pool.query(
    `SELECT b.id AS booking_id, b.prog_name, b.total_harga, u.name AS nama, u.wa
     FROM bookings b
     LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
     WHERE b.pelunasan_status = 'paid' AND b.status != 'dibatalkan'
       AND NOT EXISTS (SELECT 1 FROM invoice_kwitansi ik WHERE ik.booking_id = b.id AND ik.jenis = 'kwitansi')
     ORDER BY b.created_at DESC`
  );
  return rows;
}

/**
 * Payment DP CONFIRMED yang BELUM punya Tanda Terima Uang-nya sendiri — sama
 * alasannya kayak daftarBookingPerluKwitansi di atas, TTU harusnya auto
 * begitu payment di-approve (generateTandaTerimaUntukPayment), ini
 * nangkep kemungkinan kelewat/gagal (dikonfirmasi user 2026-10-13).
 * type='lunas' SENGAJA gak diikutkan (dikonfirmasi user 2026-10-14) — TTU
 * buat lunas emang udah gak pernah dibuat (digantikan Kwitansi), kalau
 * ikut dicek di sini bakal keitung "kelewat" terus padahal disengaja.
 */
export async function daftarPaymentPerluTandaTerima(pool) {
  const [rows] = await pool.query(
    `SELECT py.id AS payment_id, py.booking_id, py.type, py.amount, py.created_at,
            b.prog_name, u.name AS nama, u.wa
     FROM payments py
     LEFT JOIN bookings b ON b.id = py.booking_id
     LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
     WHERE py.status = 'confirmed' AND py.type = 'dp'
       AND NOT EXISTS (SELECT 1 FROM invoice_kwitansi ik WHERE ik.payment_id = py.id AND ik.jenis = 'tanda_terima')
     ORDER BY py.created_at DESC`
  );
  return rows;
}
