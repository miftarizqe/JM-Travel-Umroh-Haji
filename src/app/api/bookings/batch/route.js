import { randomUUID } from 'crypto';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cekPemesanBolehOrder, buatSatuBooking } from '@/lib/booking';
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
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  const conn = await pool.getConnection();
  try {
    const me = await cekPemesanBolehOrder(conn, auth.user.id);

    const body = await request.json();
    const { items, kode_unik_dp, voucher_kode, ...bersama } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Keranjang kosong' }, { status: 400 });
    }

    await conn.beginTransaction();

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
        meRole: me.role,
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
