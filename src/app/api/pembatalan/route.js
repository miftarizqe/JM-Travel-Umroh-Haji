import pool from '@/lib/db';
import { wajibLogin, wajibRole } from '@/lib/auth';
import { kirimNotifikasi, kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { lepasVoucher } from '@/lib/voucher';
import { lepasHoldSaldoSahabat, saldoSahabat, catatPerubahanSaldo } from '@/lib/saldoSahabat';
import { pembayaranSudahDiAcc } from '@/lib/bookingStage';
import { releaseNomorSuratJikaBulanSama } from '@/lib/nomorSurat';
import { infoDanaRefund, porsiRefund } from '@/lib/danaRefund';

/**
 * Pembatalan Program
 *
 * Aturan:
 *  - Belum bayar DP  -> jamaah membatalkan LANGSUNG, tanpa persetujuan admin
 *  - Sudah bayar DP  -> harus MENGAJUKAN, admin yang memutuskan
 *  - Refund 100% kalau kesalahan JM Travel
 *  - Selain itu mengikuti S&K (nominal ditentukan admin)
 */

// GET /api/pembatalan               -> pengajuan milik user login
// GET /api/pembatalan?status=menunggu -> untuk admin
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';

    let query = `
      SELECT p.*, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah,
             b.total_harga, b.dp_amount, b.dp_status,
             u.name AS pemohon_nama, u.wa AS pemohon_wa
      FROM pembatalan p
      LEFT JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE 1=1
    `;
    const params = [];

    // Non-admin hanya melihat pengajuannya sendiri
    if (!isAdmin) {
      query += ' AND p.user_id = ?';
      params.push(auth.user.id);
    }
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.created_at DESC';

    const [rows] = await pool.query(query, params);
    return Response.json({ pembatalan: rows });
  } catch (error) {
    console.error('GET /api/pembatalan gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/pembatalan   body: { booking_id, alasan, bukti_path?, jamaah_idx? }
// Admin/super_admin bisa langsung eksekusi pembatalan (bypass antrian
// "menunggu" persetujuan) dengan kirim admin_langsung: true + penyebab/
// refund_nominal/catatan_admin sekalian — dipakai buat jamaah yang telepon/
// dateng langsung minta batal, staff kantor gak perlu suruh jamaahnya login
// & ngajuin sendiri dulu (dikonfirmasi user 2026-07-28).
//
// jamaah_idx (opsional, ADMIN LANGSUNG SAJA) — batalkan SATU jamaah spesifik
// di dalam booking (index array jamaah_data), bukan seluruh booking. Booking
// bisa isi banyak orang, kadang cuma 1 yang batal (dikonfirmasi user
// 2026-08-15). Kosong = perilaku lama, batalkan seluruh booking.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { booking_id, alasan, bukti_path, admin_langsung, penyebab, refund_nominal, catatan_admin, jamaah_idx } = await request.json();
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';

    if (!booking_id) {
      return Response.json({ error: 'booking_id wajib diisi' }, { status: 400 });
    }
    if (jamaah_idx != null && !(isAdmin && admin_langsung)) {
      return Response.json({ error: 'Pembatalan per-jamaah cuma bisa dieksekusi langsung oleh admin.' }, { status: 400 });
    }

    // Jamaah cuma boleh batalin booking miliknya sendiri; admin boleh
    // booking siapa aja (dipakai buat pembatalan langsung atas permintaan
    // jamaah yang telepon/dateng, bukan ngajuin dari akunnya sendiri).
    const sqlBooking = 'SELECT b.*, p.publish_type AS prog_publish_type FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id WHERE b.id = ?';
    const [rows] = isAdmin
      ? await pool.query(sqlBooking, [booking_id])
      : await pool.query(`${sqlBooking} AND b.user_id = ?`, [booking_id, auth.user.id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }
    const b = rows[0];

    if (b.status === 'selesai') {
      return Response.json({ error: 'Perjalanan sudah selesai, tidak bisa dibatalkan.' }, { status: 400 });
    }
    if (b.status === 'dibatalkan') {
      return Response.json({ error: 'Booking ini sudah dibatalkan.' }, { status: 400 });
    }
    if (b.status === 'menunggu_batal') {
      return Response.json({ error: 'Pengajuan pembatalan sedang diproses admin.' }, { status: 400 });
    }
    // Pembayaran sudah di-ACC admin -> jamaah/sahabat gak bisa batal sendiri
    // lagi, cuma admin (dikonfirmasi user 2026-10-12, lihat pembayaranSudahDiAcc).
    if (!isAdmin && pembayaranSudahDiAcc(b)) {
      return Response.json({ error: 'Pembayaran booking ini sudah dikonfirmasi admin, tidak bisa dibatalkan sendiri. Hubungi admin JM Travel.' }, { status: 403 });
    }

    // Validasi jamaah_idx — harus nunjuk entry beneran di jamaah_data & belum
    // dibatalkan sebelumnya.
    if (jamaah_idx != null) {
      let jd = b.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      const entries = Array.isArray(jd) ? jd : [];
      const target = entries[jamaah_idx];
      if (!target) {
        return Response.json({ error: 'Jamaah tidak ditemukan pada booking ini' }, { status: 404 });
      }
      if (target.status_jamaah === 'dibatalkan') {
        return Response.json({ error: 'Jamaah ini sudah dibatalkan sebelumnya.' }, { status: 400 });
      }
    }

    // Total yang sudah benar-benar dibayar (pembayaran terkonfirmasi) — ini
    // total BOOKING (belum dipecah per-jamaah), disimpan sebagai snapshot
    // info buat admin. Batas refund SEBENARNYA dihitung ulang live di
    // hitungRefund (dikurangi refund yang udah disetujui sebelumnya).
    const [bayar] = await pool.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE booking_id = ? AND status = 'confirmed'",
      [booking_id]
    );
    const totalDibayar = Number(bayar[0]?.total || 0);
    const dpSudahDibayar = b.dp_status === 'confirmed';

    // SEMUA pengajuan pembatalan JAMAAH (bukan admin_langsung) — dibayar
    // maupun belum — wajib lewat persetujuan admin. dp_sudah_dibayar/
    // total_sudah_dibayar tetap dicatat sebagai info buat admin (relevan
    // kalau ada dana yang perlu di-refund).
    const alasanFinal = alasan && String(alasan).trim() ? String(alasan).trim() : 'Dibatalkan langsung oleh admin';
    if (!isAdmin || !admin_langsung) {
      if (!alasan || !String(alasan).trim()) {
        return Response.json(
          { error: 'Alasan pembatalan wajib diisi.' },
          { status: 400 }
        );
      }
    }

    // Admin batal langsung — insert pengajuan + eksekusi "disetujui" dalam
    // SATU transaksi. Dulu insert-nya jalan duluan di luar transaksi, jadi
    // kalau eksekusinya gagal (mis. refund kebablasan), baris 'menunggu'
    // yatim ketinggalan dan booking-nya kekunci 409 "sedang diproses"
    // selamanya. Sekarang gagal = rollback bersih, admin tinggal coba lagi.
    if (isAdmin && admin_langsung) {
      const { pembatalanId, hasil } = await dalamTransaksi(async (conn) => {
        // Kunci booking + cek ulang status di dalam lock — 2 admin/2 tab klik
        // bareng gak boleh sama-sama lolos.
        const [[bkLock]] = await conn.query('SELECT status FROM bookings WHERE id = ? FOR UPDATE', [booking_id]);
        if (!bkLock) throw gagal('Booking tidak ditemukan', 404);
        if (bkLock.status === 'dibatalkan') throw gagal('Booking ini sudah dibatalkan.');
        if (bkLock.status === 'selesai') throw gagal('Perjalanan sudah selesai, tidak bisa dibatalkan.');
        if (bkLock.status === 'menunggu_batal') throw gagal('Pengajuan pembatalan sedang diproses admin.');
        const [ada] = await conn.query(
          "SELECT id FROM pembatalan WHERE booking_id = ? AND jamaah_idx <=> ? AND status = 'menunggu'",
          [booking_id, jamaah_idx ?? null]
        );
        if (ada.length > 0) throw gagal('Pengajuan pembatalan sedang diproses.', 409);

        const [ins] = await conn.query(
          `INSERT INTO pembatalan
           (booking_id, jamaah_idx, user_id, alasan, bukti_path, dp_sudah_dibayar, total_sudah_dibayar, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'menunggu')`,
          [booking_id, jamaah_idx ?? null, b.user_id, alasanFinal, bukti_path || null,
           dpSudahDibayar ? 1 : 0, totalDibayar]
        );
        const [[p]] = await conn.query('SELECT * FROM pembatalan WHERE id = ?', [ins.insertId]);
        return { pembatalanId: ins.insertId, hasil: await eksekusiPembatalan(conn, p, auth.user, { penyebab, refund_nominal, catatan_admin }) };
      });
      const data = await setelahPembatalanDisetujui(pembatalanId, auth.user, hasil, catatan_admin, 'batal_langsung_admin');
      return Response.json({
        message: jamaah_idx != null ? 'Jamaah berhasil dibatalkan.' : 'Booking berhasil dibatalkan.',
        langsung: true,
        ...data,
      }, { status: 201 });
    }

    // Cegah pengajuan ganda — buat pembatalan whole-booking (jamaah_idx
    // NULL) cukup cek booking_id-nya aja; buat per-jamaah cek kombinasi
    // booking_id+jamaah_idx-nya spesifik (null-safe pakai <=>, biar row
    // whole-booking yang lain gak ikut keblokir).
    const [ada] = await pool.query(
      "SELECT id FROM pembatalan WHERE booking_id = ? AND jamaah_idx <=> ? AND status = 'menunggu'",
      [booking_id, jamaah_idx ?? null]
    );
    if (ada.length > 0) {
      return Response.json({ error: 'Pengajuan pembatalan sedang diproses.' }, { status: 409 });
    }

    await pool.query(
      `INSERT INTO pembatalan
       (booking_id, jamaah_idx, user_id, alasan, bukti_path, dp_sudah_dibayar, total_sudah_dibayar, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'menunggu')`,
      [booking_id, jamaah_idx ?? null, b.user_id, alasanFinal, bukti_path || null,
       dpSudahDibayar ? 1 : 0, totalDibayar]
    );

    await pool.query("UPDATE bookings SET status = 'menunggu_batal' WHERE id = ?", [booking_id]);

    await kirimNotifikasiAdmin(pool, {
      tipe: 'pembatalan_baru',
      judul: 'Pengajuan Pembatalan Baru',
      pesan: `Booking ${booking_id} (${b.prog_name || ''}) mengajukan pembatalan, sudah dibayar Rp ${totalDibayar.toLocaleString('id-ID')}.`,
      link: '/admin',
    });

    return Response.json({
      message: 'Pengajuan pembatalan terkirim. Menunggu keputusan admin.',
      langsung: false,
      total_sudah_dibayar: totalDibayar,
    }, { status: 201 });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error('POST /api/pembatalan gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// Error yang pesannya aman ditampilin apa adanya ke admin (validasi/bisnis),
// beda dari error teknis yang di-mask jadi "Terjadi kesalahan server".
function gagal(pesan, status = 400) {
  return Object.assign(new Error(pesan), { status });
}

function parseJamaahData(jd) {
  if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
  return Array.isArray(jd) ? jd : [];
}

// Booking batal TOTAL — payment DP/pelunasan yang masih pending ikut
// ditolak. Kalau dibiarin pending, admin masih bisa ACC belakangan: kuota
// kursi kepotong lagi & uang kecatat masuk buat booking yang udah batal.
async function tolakPaymentPending(conn, bookingId) {
  await conn.query(
    "UPDATE payments SET status = 'rejected', reject_reason = 'Booking dibatalkan' WHERE booking_id = ? AND status = 'pending'",
    [bookingId]
  );
}

async function dalamTransaksi(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const hasil = await fn(conn);
    await conn.commit();
    return hasil;
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

// Nominal refund 1 pembatalan. Batas atasnya = uang yang BENERAN masuk
// (payment confirmed, dihitung live) DIKURANGI refund yang udah disetujui
// sebelumnya di booking yang sama — tanpa pengurangan ini, batal per-jamaah
// berkali-kali bisa nge-refund total booking berulang (3 orang × 30jt = 90jt
// padahal uang masuk cuma 30jt).
//
// "Kesalahan JM Travel" = refund 100% dari PORSI yang dibatalkan: seluruh
// sisa kalau batal booking utuh / jamaah aktif terakhir, porsi 1 orang
// (bobot harga_jual kalau booking pernah diedit per-orang, rata kalau
// seragam) kalau batal per-jamaah — bukan total seluruh booking.
//
// Program Sahabat Baitullah eksklusif: gak ada refund tunai — SEMUA dana
// masuk (porsi yang dibatalkan) dikembalikan ke saldo tabungan, otomatis,
// nominal dari admin diabaikan (dikonfirmasi user 2026-10-16).
async function hitungRefund(conn, { p, entries, sahabatEksklusif, penyebab, refund_nominal }) {
  const { totalDibayar, sudahDirefund, sisaBisaDirefund } = await infoDanaRefund(conn, p.booking_id, p.id, { sahabatEksklusif });

  let nominal;
  if (sahabatEksklusif || penyebab === 'kesalahan_jm_travel') {
    nominal = porsiRefund(entries, p.jamaah_idx, sisaBisaDirefund);
  } else {
    nominal = Number(refund_nominal || 0);
    if (!Number.isFinite(nominal)) throw gagal('Nominal refund tidak valid.');
    if (nominal < 0) throw gagal('Refund tidak boleh negatif.');
    if (nominal > sisaBisaDirefund) {
      throw gagal(sudahDirefund > 0
        ? `Refund tidak boleh melebihi sisa dana yang bisa direfund (Rp ${sisaBisaDirefund.toLocaleString('id-ID')} — dibayar Rp ${totalDibayar.toLocaleString('id-ID')}, sudah direfund Rp ${sudahDirefund.toLocaleString('id-ID')}).`
        : `Refund tidak boleh melebihi yang sudah dibayar (Rp ${totalDibayar.toLocaleString('id-ID')}).`);
    }
  }
  const persen = totalDibayar > 0 ? Math.round((nominal / totalDibayar) * 100) : 0;
  return { nominal, persen };
}

// Finalisasi 1 pengajuan pembatalan jadi "disetujui" — WAJIB dipanggil di
// dalam transaksi (conn), dipakai DUA jalur: PATCH approve (pengajuan dari
// jamaah) dan POST admin_langsung (pengajuan + eksekusi sekaligus). Gagal di
// mana pun = throw gagal(...), caller yang rollback. Efek di luar DB
// (notifikasi, waitlist, audit) ada di setelahPembatalanDisetujui, jalan
// SETELAH commit.
async function eksekusiPembatalan(conn, p, actorUser, { penyebab, refund_nominal, catatan_admin }) {
  const [bkRows] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [p.booking_id]);
  const bk = bkRows[0];
  if (!bk) throw gagal('Booking tidak ditemukan', 404);
  if (bk.status === 'dibatalkan') throw gagal('Booking ini sudah dibatalkan.');
  if (bk.status === 'selesai') throw gagal('Perjalanan sudah selesai, tidak bisa dibatalkan.');

  // Program Sahabat Baitullah eksklusif (checkout mandiri) TIDAK PERNAH ada
  // refund cash (dikonfirmasi user 2026-09-18) — dananya dikembalikan ke
  // saldo tabungan Sahabat pemilik booking, biar bisa dipakai checkout
  // program lain (dikonfirmasi user 2026-10-16, lihat kreditSaldoPembatalan).
  const [[progInfo]] = await conn.query('SELECT publish_type FROM programs WHERE id = ?', [bk.prog_id]);
  const sahabatEksklusif = progInfo?.publish_type === 'sahabat_baitullah';

  const entriesAsli = parseJamaahData(bk.jamaah_data);
  let target = null;
  if (p.jamaah_idx != null) {
    target = entriesAsli[p.jamaah_idx];
    if (!target || target.status_jamaah === 'dibatalkan') {
      throw gagal('Jamaah ini sudah dibatalkan atau tidak ditemukan.');
    }
  }

  // Hold saldo yang belum di-ACC — dilepas (dihapus) kalau booking batal
  // total, saldo balik sendiri. Dicatat buat info "kembali ke saldo".
  const [[hold]] = await conn.query(
    "SELECT COALESCE(-SUM(nominal),0) AS n FROM komisi_ledger WHERE booking_id = ? AND jenis = 'pemakaian_saldo_sahabat' AND dikonfirmasi_at IS NULL",
    [p.booking_id]
  );

  const { nominal, persen } = await hitungRefund(conn, {
    p, entries: entriesAsli, sahabatEksklusif, penyebab, refund_nominal,
  });

  // Nominal 0 = tidak ada apa pun yang perlu ditransfer balik, jadi refund
  // langsung 'selesai' (skip tahap upload bukti TF yang cuma relevan kalau
  // beneran ada uang keluar).
  // Kredit ke saldo Sahabat juga langsung 'selesai' — gak ada transfer
  // keluar yang perlu bukti TF.
  const refundStatusAwal = nominal > 0 && !sahabatEksklusif ? 'diproses' : 'selesai';
  let namaJamaahDibatalkan = null; // cuma keisi kalau ini pembatalan per-jamaah

  await conn.query(
    `UPDATE pembatalan SET status='disetujui', penyebab=?, refund_nominal=?,
     refund_persen=?, catatan_admin=?, diproses_oleh=?, diproses_at=NOW(),
     refund_status=? WHERE id = ?`,
    [penyebab || 'lainnya', nominal, persen, catatan_admin || null, actorUser.id, refundStatusAwal, p.id]
  );

  if (p.jamaah_idx == null) {
    // ---- Batalkan SELURUH booking ----
    // seat_dipotong ikut di-nol-kan biar kalau ada eksekusi dobel/race,
    // kuota gak dikembalikan dua kali.
    await conn.query("UPDATE bookings SET status = 'dibatalkan', seat_dipotong = 0 WHERE id = ?", [p.booking_id]);
    // Nomor Perjanjian Jamaah (SPJ) yang udah kebakar admin cetak
    // sebelum dibatalkan -- dilepas biar gak jadi gap percuma (sama pola
    // kayak SPKA-Ins/SPK-AK, dikonfirmasi user 2026-10-12).
    await releaseNomorSuratJikaBulanSama(conn, p.booking_id, 'no_perjanjian_jamaah', 'SPJ', 'bookings');
    // Lepas hold saldo checkout mandiri Sahabat Baitullah yang belum
    // sempat dikonfirmasi admin (dikonfirmasi user 2026-10-08) -- kalau
    // enggak, saldo jamaah ketahan selamanya padahal bookingnya batal.
    // No-op kalau booking ini bukan checkout mandiri atau udah terlanjur
    // dikonfirmasi (itu kasus refund beneran, bukan lepas hold).
    await lepasHoldSaldoSahabat(conn, p.booking_id);
    await tolakPaymentPending(conn, p.booking_id);
    // Kuota kursi SEKARANG baru kepotong pas DP dikonfirmasi admin
    // (dikonfirmasi user 2026-10-13, lihat potongKuotaSeatDp) -- booking
    // yang DP-nya masih pending gak pernah motong kuota sama sekali,
    // jadi JANGAN ikut dikembalikan di sini (bakal bikin used_seat
    // salah/kebablasan ngurang punya booking lain). Dikembalikan PERSIS
    // sejumlah bk.seat_dipotong (bukan jumlah_jamaah mentah) -- sejak
    // fitur "Tambah Jamaah" (potongKuotaSeatDp bisa jalan berkali-kali
    // per booking), seat_dipotong itu satu-satunya angka yang akurat
    // soal berapa seat booking ini BENERAN lagi nahan di used_seat.
    const refundSeat = bk.seat_dipotong || 0;
    if (refundSeat > 0) {
      await conn.query(
        'UPDATE programs SET used_seat = GREATEST(0, used_seat - ?) WHERE id = ?',
        [refundSeat, bk.prog_id]
      );
    }
    if (bk.voucher_kode) {
      await lepasVoucher(conn, bk.voucher_kode, bk.jumlah_jamaah || 1);
    }
  } else {
    // ---- Batalkan SATU jamaah spesifik di dalam booking ----
    // Entry-nya TETAP di array (bukan di-splice) — index dipakai di banyak
    // tempat lain (perlengkapan_pengiriman, manifest, dst), splice bakal
    // geser index semua orang sesudahnya & bikin referensi lama nyasar.
    // Cukup ditandai status_jamaah='dibatalkan', tempat lain yang baca
    // jamaah_data tinggal skip entry berstatus ini.
    namaJamaahDibatalkan = target.nama || `Jamaah ke-${p.jamaah_idx + 1}`;

    const entries = entriesAsli.map((e, i) => i === p.jamaah_idx
      ? { ...e, status_jamaah: 'dibatalkan', dibatalkan_at: new Date().toISOString() }
      : e);

    const opsiTotal = Number(bk.opsi_tambahan_total) || 0;
    const sisaAktif = entries.filter(e => e.status_jamaah !== 'dibatalkan').length;
    const habis = sisaAktif === 0;

    // Booking yang PERNAH diedit per-orang (invariant all-or-nothing: kalau
    // target-nya eksplisit, semua saudara aktifnya juga eksplisit, lihat
    // src/lib/jamaahHarga.js) — jumlahkan harga_jual presisi tiap orang.
    // harga_jual itu PRE-voucher (snapshot catalog price, sama kayak yang
    // dipakai cetak-formulir), voucher dikurangi SEKALI di sini.
    //
    // Booking yang MASIH SERAGAM (belum pernah diedit per-orang) — pola
    // LAMA dipertahankan PERSIS: rata-ratakan total_harga (udah termasuk
    // potongan voucher) lalu susutkan proporsional sesuai sisa jamaah.
    // SENGAJA tidak disatukan lewat resolveJamaahHarga (yang fallback-nya
    // nambah voucher balik dulu sebelum dirata-rata) — itu bakal geser
    // angka buat booking lama yang belum pernah kesentuh fitur ini, biar
    // 0 regresi buat kasus paling umum.
    const sudahDieditPerOrang = target.paket && target.kamar && target.harga_jual != null;
    let totalHargaBaru;
    if (sudahDieditPerOrang) {
      const voucherNominal = Number(bk.voucher_nominal) || 0;
      const jumlahHargaJual = entries.reduce((s, e) => s + (e.status_jamaah === 'dibatalkan' ? 0 : Number(e.harga_jual) || 0), 0);
      totalHargaBaru = Math.max(0, Math.round(jumlahHargaJual + opsiTotal - voucherNominal));
    } else {
      const jumlahJamaahLama = Number(bk.jumlah_jamaah) || 1;
      const hargaPerJamaahLama = jumlahJamaahLama > 0 ? (Number(bk.total_harga) - opsiTotal) / jumlahJamaahLama : 0;
      totalHargaBaru = Math.round(hargaPerJamaahLama * sisaAktif + opsiTotal);
    }

    // Kembaliin 1 seat kalau booking ini emang masih nahan minimal 1 seat
    // di seat_dipotong (pernah motong kuota buat jamaah ini). Jamaah aktif
    // TERAKHIR = booking habis, kembaliin SEMUA sisa seat_dipotong (sama
    // kayak batal booking utuh) biar gak ada seat nyangkut.
    const refundSeat = habis ? (bk.seat_dipotong || 0) : Math.min(1, bk.seat_dipotong || 0);
    const seatDipotongBaru = (bk.seat_dipotong || 0) - refundSeat;

    // Semua jamaah aktif udah dibatalkan satu-satu — statusnya jadi sama
    // kayak booking dibatalkan utuh. Kalau masih ada sisa, booking TETAP
    // aktif, cuma jumlah_jamaah & total_harga-nya nyusut.
    await conn.query(
      `UPDATE bookings SET jamaah_data = ?, jumlah_jamaah = ?, total_harga = ?, status = ?, seat_dipotong = ? WHERE id = ?`,
      [JSON.stringify(entries), sisaAktif, totalHargaBaru, habis ? 'dibatalkan' : bk.status, seatDipotongBaru, p.booking_id]
    );
    if (habis) {
      // Booking jadi batal total — bersih-bersih yang sama kayak cabang
      // batal booking utuh di atas (dulu hold saldo Sahabat ketinggalan).
      await releaseNomorSuratJikaBulanSama(conn, p.booking_id, 'no_perjanjian_jamaah', 'SPJ', 'bookings');
      await lepasHoldSaldoSahabat(conn, p.booking_id);
      await tolakPaymentPending(conn, p.booking_id);
    }

    if (refundSeat > 0) {
      await conn.query('UPDATE programs SET used_seat = GREATEST(0, used_seat - ?) WHERE id = ?', [refundSeat, bk.prog_id]);
    }
    if (bk.voucher_kode) {
      await lepasVoucher(conn, bk.voucher_kode, 1);
    }
  }

  // Hold cuma beneran dilepas kalau booking-nya jadi batal total.
  const [[bkAkhir]] = await conn.query('SELECT status FROM bookings WHERE id = ?', [p.booking_id]);
  const holdDilepas = bkAkhir?.status === 'dibatalkan' ? Number(hold.n || 0) : 0;

  let kreditSaldo = 0;
  if (sahabatEksklusif && nominal > 0) {
    await kreditSaldoPembatalan(conn, { p, bk, nominal, actorUser });
    kreditSaldo = nominal;
  }

  return {
    p, nominal, persen, penyebab, sahabatEksklusif, progIdSeatDibuka: bk.prog_id, namaJamaahDibatalkan,
    kembaliKeSaldo: sahabatEksklusif ? kreditSaldo + holdDilepas : 0,
  };
}

// Kembalikan dana booking Sahabat Baitullah yang batal ke saldo tabungan
// pemilik booking. Pakai jenis koreksi_saldo_sahabat (bukan jenis baru —
// daftar jenis saldo juga dipakai service jm-travel-api, nambah enum berarti
// wajib ubah 2 repo bareng), DIBEDAIN dari koreksi manual admin lewat
// booking_id terisi + ref_id 'pembatalan:<id>' (koreksi manual booking_id
// NULL). Riwayat saldo nampilin baris ini sebagai "Pengembalian Pembatalan".
async function kreditSaldoPembatalan(conn, { p, bk, nominal, actorUser }) {
  const [[u]] = await conn.query('SELECT name FROM users WHERE id = ?', [bk.user_id]);
  const saldoSebelum = await saldoSahabat(conn, bk.user_id);
  const keterangan = `Pengembalian dana pembatalan booking ${bk.id}`;
  const [ins] = await conn.query(
    `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan, dikonfirmasi_at)
     VALUES (?, ?, ?, ?, 'koreksi_saldo_sahabat', 1, ?, ?, NOW())`,
    [bk.id, `pembatalan:${p.id}`, bk.user_id, u?.name || null, nominal, keterangan]
  );
  await catatPerubahanSaldo(conn, {
    actor: actorUser,
    userId: bk.user_id,
    saldoSebelum,
    aksi: 'sahabat_pengembalian_pembatalan',
    target_type: 'komisi_ledger',
    target_id: String(ins.insertId),
    keterangan: `${keterangan} (${bk.prog_name || '-'}) — Rp${nominal.toLocaleString('id-ID')} kembali ke saldo tabungan ${u?.name || bk.user_id}`,
  });
}

// Efek di luar transaksi setelah pembatalan disetujui & ke-commit:
// notifikasi pemilik booking, kabarin waitlist, audit log.
// aksiAudit: 'approve_pembatalan' (setujui pengajuan jamaah) atau
// 'batal_langsung_admin' (admin eksekusi sendiri tanpa pengajuan) — dulu
// dua-duanya kecatat approve_pembatalan, jadi gak kebedain di audit log.
async function setelahPembatalanDisetujui(id, actorUser, hasil, catatan_admin, aksiAudit = 'approve_pembatalan') {
  const { p, nominal, persen, penyebab, sahabatEksklusif, progIdSeatDibuka, namaJamaahDibatalkan, kembaliKeSaldo } = hasil;

  const subjek = namaJamaahDibatalkan
    ? `Pembatalan ${namaJamaahDibatalkan} pada booking ${p.booking_id} disetujui.`
    : `Pembatalan booking ${p.booking_id} disetujui.`;
  await kirimNotifikasi(pool, {
    user_id: p.user_id,
    tipe: 'pembatalan_disetujui',
    judul: 'Pembatalan Disetujui',
    pesan: sahabatEksklusif
      ? `${subjek} Rp ${kembaliKeSaldo.toLocaleString('id-ID')} dikembalikan ke saldo tabungan umroh Anda dan bisa dipakai untuk program lain.`
      : `${subjek} Refund Rp ${nominal.toLocaleString('id-ID')} (${persen}%).`,
    link: sahabatEksklusif ? '/dashboard/sahabat/riwayat' : '/dashboard/jamaah',
  });

  // Seat kebuka — kabarin semua yang daftar "Infokan Jika Ada Slot Kosong"
  // buat program ini (lihat migration-program-waitlist.sql), lalu hapus
  // baris waitlist-nya (one-shot, bukan langganan permanen — kalau
  // kehabisan lagi belakangan, harus daftar ulang).
  if (progIdSeatDibuka) {
    const [peminat] = await pool.query(
      'SELECT w.user_id, p.name AS prog_name FROM program_waitlist w JOIN programs p ON p.id = w.program_id WHERE w.program_id = ?',
      [progIdSeatDibuka]
    );
    for (const w of peminat) {
      await kirimNotifikasi(pool, {
        user_id: w.user_id,
        tipe: 'slot_kosong',
        judul: 'Slot Tersedia!',
        pesan: `Slot untuk program "${w.prog_name}" sekarang tersedia — buruan sebelum penuh lagi.`,
        link: `/checkout?prog_id=${progIdSeatDibuka}`,
      });
    }
    if (peminat.length > 0) await pool.query('DELETE FROM program_waitlist WHERE program_id = ?', [progIdSeatDibuka]);
  }

  await catatAudit(pool, {
    actor: actorUser,
    aksi: aksiAudit,
    target_type: 'pembatalan',
    target_id: id,
    keterangan: `Booking ${p.booking_id}${namaJamaahDibatalkan ? ` — jamaah: ${namaJamaahDibatalkan}` : ''} — ${sahabatEksklusif ? `kembali ke saldo Rp ${kembaliKeSaldo.toLocaleString('id-ID')}` : `refund Rp ${nominal.toLocaleString('id-ID')} (${persen}%)`}${catatan_admin ? ', catatan: ' + catatan_admin : ''}`,
  });

  return {
    refund_nominal: nominal,
    refund_persen: persen,
    sahabat_eksklusif: sahabatEksklusif,
    kembali_ke_saldo: kembaliKeSaldo,
    catatan: sahabatEksklusif
      ? `Program Sahabat Baitullah: Rp ${kembaliKeSaldo.toLocaleString('id-ID')} dikembalikan ke saldo tabungan, bisa dipakai untuk program lain.`
      : penyebab === 'kesalahan_jm_travel'
        ? 'Kesalahan JM Travel: refund 100% dari porsi yang dibatalkan.'
        : 'Refund mengikuti syarat & ketentuan.',
  };
}

// Jalur PATCH approve — pengajuan dari jamaah yang udah nunggu di antrian.
async function setujuiPembatalan(id, actorUser, opts) {
  const hasil = await dalamTransaksi(async (conn) => {
    const [[p]] = await conn.query('SELECT * FROM pembatalan WHERE id = ? FOR UPDATE', [id]);
    if (!p) throw gagal('Pengajuan tidak ditemukan', 404);
    if (p.status !== 'menunggu') throw gagal('Pengajuan ini sudah diproses.');
    return eksekusiPembatalan(conn, p, actorUser, opts);
  });
  return setelahPembatalanDisetujui(id, actorUser, hasil, opts.catatan_admin);
}

// PATCH /api/pembatalan  (ADMIN)
// body: { id, action: 'approve'|'reject', penyebab?, refund_nominal?, catatan_admin? }
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { id, action, penyebab, refund_nominal, catatan_admin } = await request.json();

    if (!id || !action) {
      return Response.json({ error: 'id dan action wajib diisi' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'action harus approve atau reject' }, { status: 400 });
    }

    // ---- DITOLAK: booking kembali aktif ----
    if (action === 'reject') {
      const [rows] = await pool.query('SELECT * FROM pembatalan WHERE id = ?', [id]);
      if (rows.length === 0) {
        return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
      }
      const p = rows[0];
      if (p.status !== 'menunggu') {
        return Response.json({ error: 'Pengajuan ini sudah diproses.' }, { status: 400 });
      }

      await pool.query(
        `UPDATE pembatalan SET status='ditolak', catatan_admin=?,
         diproses_oleh=?, diproses_at=NOW() WHERE id = ?`,
        [catatan_admin || null, auth.user.id, id]
      );
      await pool.query("UPDATE bookings SET status = 'active' WHERE id = ?", [p.booking_id]);

      await kirimNotifikasi(pool, {
        user_id: p.user_id,
        tipe: 'pembatalan_ditolak',
        judul: 'Pengajuan Pembatalan Ditolak',
        pesan: `Pengajuan pembatalan booking ${p.booking_id} ditolak.${catatan_admin ? ' Catatan: ' + catatan_admin : ''}`,
        link: '/dashboard/jamaah',
      });

      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'reject_pembatalan',
        target_type: 'pembatalan',
        target_id: id,
        keterangan: `Booking ${p.booking_id}${catatan_admin ? ': ' + catatan_admin : ''}`,
      });

      return Response.json({ message: 'Pengajuan ditolak. Booking kembali aktif.' });
    }

    // ---- DISETUJUI ----
    const data = await setujuiPembatalan(id, auth.user, { penyebab, refund_nominal, catatan_admin });
    return Response.json({ message: 'Pembatalan disetujui.', ...data });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error('PATCH /api/pembatalan gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
