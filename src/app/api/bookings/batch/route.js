import { randomUUID } from 'crypto';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cekPemesanBolehOrder, buatSatuBooking, cariNikDipakaiProgramLain } from '@/lib/booking';
import { cariVoucherValid, hitungPotonganItem, pakaiVoucher } from '@/lib/voucher';

// POST /api/bookings/batch
// Keranjang multi-item dari checkout/order-jamaah: tiap item (kombinasi
// paket+kamar+jumlah bebas) jadi 1 booking row terpisah, dibungkus 1
// transaksi (semua sukses atau semua gagal) — supaya 1x upload bukti
// transfer & 1x kode unik bisa menutup beberapa booking sekaligus tanpa
// resiko sebagian ke-insert dan sebagian nggak kalau ada item yang gagal
// (mis. seat keburu habis di tengah loop).
//
// Voucher (opsional, level keranjang — bukan per item): kuota dicek SEKALI
// terhadap TOTAL jamaah gabungan seluruh item (bukan per item — cart 2 item
// @3 jamaah = 6, harus dicek sebagai 6 sekaligus, bukan 3 dan 3 terpisah yang
// bisa dua-duanya "lolos" padahal gabungannya nggak cukup kuota). Cap per-paket
// (hitungPotonganItem) tetap dicek per item karena emang beda-beda tiap paket.
// Kuota di-consume SEKALI di akhir sebesar total jamaah itu — apapun jumlah
// item di keranjang — supaya orang nggak bisa ngakalin kuota terbatas dengan
// mecah pesanan jadi banyak item kecil-kecil.
//
// Bayar DP dari saldo tabungan umroh buat program REGULER DICABUT TOTAL
// (dikonfirmasi user 2026-10-15) — saldo tabungan umroh itu duit buat
// target program EKSKLUSIF milik sahabat sendiri, bukan metode bayar buat
// program LAIN; begitu dia udah checkout eksklusifnya, management juga
// udah gak lagi berhak transaksiin rekening umrohnya. Checkout program
// reguler SEKARANG WAJIB transfer manual, sama kayak jamaah biasa — kalau
// ada FE lama yang masih kirim `bayar_dp_dari_saldo`, ditolak eksplisit di
// bawah (bukan di-skip diam-diam). /api/sahabat/checkout-mandiri (khusus
// program EKSKLUSIF, logic & kebijakan beda total) SAMA SEKALI gak
// tersentuh perubahan ini.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  const conn = await pool.getConnection();
  try {
    const me = await cekPemesanBolehOrder(conn, auth.user.id);

    const body = await request.json();
    const { items, voucher_kode, bayar_dp_dari_saldo, ...bersama } = body;
    const { kode_unik_dp } = body;
    if (bayar_dp_dari_saldo) {
      return Response.json({ error: 'Pembayaran DP dari saldo tabungan umroh sudah tidak didukung untuk program reguler. Silakan transfer manual.' }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Keranjang kosong' }, { status: 400 });
    }

    await conn.beginTransaction();

    // NIK dari checkout (akun Sahabat, dikonfirmasi user 2026-10-12): jamaah
    // #1 "Diri Sendiri" dipaksa NIK akun ini (bukan kiriman client), lalu 1
    // NIK gak boleh dobel — di keranjang ini maupun booking aktif lain di
    // program yang sama (aturan sama dengan simpan formulir).
    let nikAkun = null;
    if (items.some(it => it.untuk_diri_sendiri)) {
      const [[u]] = await conn.query('SELECT nik FROM users WHERE id = ?', [auth.user.id]);
      nikAkun = String(u?.nik || '').trim() || null;
    }
    const semuaNik = [];
    for (const it of items) {
      it.untuk_diri_sendiri = !!it.untuk_diri_sendiri && auth.user.role === 'sahabat_baitullah';
      // Checkout "Diri Sendiri" wajib 1 jamaah (dikonfirmasi user
      // 2026-10-15) — ujroh closing_langsung_sahabat ditentukan PER BOOKING
      // dari jamaah_data[0].untuk_diri_sendiri (closing.js/laporanUjroh.js).
      // Kalau item ini dibiarkan >1 jamaah, sisa jamaah (orang lain beneran)
      // ikut ke-skip dari ujroh gara-gara 1 booking dianggap "diri sendiri"
      // utuh. FE udah ngunci qty-nya, ini jaring pengaman server-side.
      if (it.untuk_diri_sendiri && Number(it.jumlah_jamaah) > 1) {
        throw Object.assign(new Error('Checkout untuk diri sendiri cuma bisa 1 jamaah. Daftarkan orang lain lewat item keranjang terpisah.'), { status: 400 });
      }
      const niks = (Array.isArray(it.niks) ? it.niks : []).map(n => String(n || '').trim());
      if (it.untuk_diri_sendiri && nikAkun) niks[0] = nikAkun;
      for (const n of niks) {
        if (n && !/^\d{16}$/.test(n)) throw Object.assign(new Error(`NIK ${n} tidak valid (wajib 16 digit).`), { status: 400 });
      }
      it.niks = niks;
      semuaNik.push(...niks.filter(Boolean));
    }
    const dobelLokal = semuaNik.find((n, i) => semuaNik.indexOf(n) !== i);
    if (dobelLokal) throw Object.assign(new Error(`NIK ${dobelLokal} dimasukkan lebih dari sekali.`), { status: 400 });
    if (semuaNik.length) {
      const dup = await cariNikDipakaiProgramLain(conn, { progId: bersama.prog_id, excludeBookingId: '', niks: semuaNik });
      if (dup) throw Object.assign(new Error(`NIK ${dup.nik} sudah terdaftar di program ini. Satu orang tidak bisa didaftarkan dua kali di program yang sama.`), { status: 400 });
    }

    const totalJamaah = items.reduce((s, it) => s + Number(it.jumlah_jamaah || 0), 0);

    let voucher = null;
    if (voucher_kode) {
      voucher = await cariVoucherValid(conn, voucher_kode, bersama.prog_id, auth.user, totalJamaah);
    }
    const [progs] = await conn.query('SELECT * FROM programs WHERE id = ?', [bersama.prog_id]);
    const prog = progs[0];
    if (!prog) throw Object.assign(new Error('Program tidak ditemukan'), { status: 404 });

    // 1 batch_id buat SEMUA item keranjang ini — 1x submit = 1x transfer +
    // 1x bukti beneran, meskipun jadi beberapa booking row terpisah (lihat
    // buatSatuBooking). Dipakai admin Payments tab buat nampilin & approve
    // sekaligus, bukan kartu berulang per booking dengan bukti yang sama.
    const batchId = randomUUID();

    const bookings = [];
    for (let i = 0; i < items.length; i++) {
      const voucherNominal = voucher
        ? await hitungPotonganItem(conn, prog, voucher, items[i], bersama.referral_perw_id)
        : 0;
      const hasil = await buatSatuBooking(conn, {
        ...bersama,
        ...items[i],
        batch_id: batchId,
        // auth.user.role (JWT sesi aktif), bukan me.role (role primer DB) —
        // lihat catatan sama di /api/bookings/route.js, biar akun dual-role
        // ngikutin mode yang lagi di-switch aktif pas checkout keranjang.
        meRole: auth.user.role,
        voucher_kode_final: voucher?.kode || null,
        voucher_nominal: voucherNominal,
        // Kode unik cuma nempel di item pertama — supaya total (DP semua
        // item + kode unik) match persis dengan 1x nominal transfer asli,
        // bukan kelipatan kode unik per item.
        kode_unik_dp: i === 0 ? kode_unik_dp : 0,
      });
      bookings.push({
        booking_id: hasil.bookingId, dp_amount: hasil.dpAmount, total_harga: hasil.totalHarga,
        voucher_nominal: voucherNominal,
      });
    }

    if (voucher) {
      await pakaiVoucher(conn, voucher.kode, totalJamaah);
    }

    await conn.commit();

    return Response.json({
      message: 'Booking berhasil!',
      bookings,
      total_dp: bookings.reduce((s, b) => s + b.dp_amount, 0),
      voucher_diskon_total: bookings.reduce((s, b) => s + b.voucher_nominal, 0),
    }, { status: 201 });

  } catch (error) {
    try { await conn.rollback(); } catch {}
    if (error.status) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}
