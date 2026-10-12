import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cekPemesanBolehOrder, buatSatuBooking, cariNikDipakaiProgramLain } from '@/lib/booking';
import { cariVoucherValid, hitungPotonganItem, pakaiVoucher } from '@/lib/voucher';
import { saldoSahabat } from '@/lib/saldoSahabat';

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
// `bayar_dp_dari_saldo` (khusus akun Sahabat Baitullah, program reguler) —
// total DP keranjang dibayar dari saldo tabungan umroh, LANGSUNG kepotong
// begitu submit (hold `pemakaian_saldo_sahabat` per booking, pola sama
// checkout-mandiri), gak nunggu admin ACC — biar Sahabat langsung tau sisa
// saldonya (dikonfirmasi user 2026-10-11). Gak ada kode unik / bukti TF.
// ACC admin (DP di tab Payments ATAU baris saldo di tab komisi) cuma
// nandain resmi, saling sinkron — lihat konfirmasiDpDariSaldoSahabat.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  const conn = await pool.getConnection();
  try {
    const me = await cekPemesanBolehOrder(conn, auth.user.id);

    const body = await request.json();
    const { items, voucher_kode, bayar_dp_dari_saldo, password, ...bersama } = body;
    let { kode_unik_dp } = body;
    const bayarDariSaldo = !!bayar_dp_dari_saldo;
    if (bayarDariSaldo && auth.user.role !== 'sahabat_baitullah') {
      return Response.json({ error: 'Bayar DP dari saldo khusus akun Sahabat Baitullah' }, { status: 403 });
    }
    if (bayarDariSaldo) {
      // Wajib konfirmasi password akun sebelum saldo dipotong (dikonfirmasi
      // user 2026-10-11) — jaga-jaga sesi yang ketinggalan login di device
      // orang lain. Trim sama kayak /api/auth/login.
      if (!password) {
        return Response.json({ error: 'Masukkan password akun Anda untuk konfirmasi pembayaran dari saldo.' }, { status: 400 });
      }
      const [[u]] = await conn.query('SELECT password FROM users WHERE id = ?', [auth.user.id]);
      if (!u || !(await bcrypt.compare(String(password).trim(), u.password))) {
        return Response.json({ error: 'Password salah.' }, { status: 401 });
      }
      kode_unik_dp = 0;
      bersama.bukti_path = null;
      bersama.bukti_nama = null;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Keranjang kosong' }, { status: 400 });
    }

    await conn.beginTransaction();

    // Kunci baris user SEBELUM baca saldo — pasangan lock yang sama di
    // checkout-mandiri & admin komisi confirm/unconfirm (anti race 2 tab).
    let saldoTersedia = 0;
    if (bayarDariSaldo) {
      await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [auth.user.id]);
      saldoTersedia = await saldoSahabat(conn, auth.user.id);
    }

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

    let saldoDipakai = 0;
    if (bayarDariSaldo) {
      saldoDipakai = bookings.reduce((s, b) => s + b.dp_amount, 0);
      if (saldoTersedia < saldoDipakai) {
        throw Object.assign(new Error(
          `Saldo tabungan umroh Anda belum cukup untuk DP (tersedia Rp${saldoTersedia.toLocaleString('id-ID')} dari Rp${saldoDipakai.toLocaleString('id-ID')}). Bayar DP via transfer.`
        ), { status: 400 });
      }
      for (const b of bookings) {
        if (b.dp_amount <= 0) continue;
        await conn.query(
          `INSERT INTO komisi_ledger (booking_id, penerima_id, penerima_nama, jenis, nominal, keterangan)
           VALUES (?, ?, ?, 'pemakaian_saldo_sahabat', ?, ?)`,
          [b.booking_id, auth.user.id, auth.user.name, -b.dp_amount, `Pemakaian saldo tabungan untuk DP booking ${prog.name}`]
        );
      }
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
      ...(bayarDariSaldo ? { saldo_dipakai: saldoDipakai, saldo_sisa: saldoTersedia - saldoDipakai } : {}),
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
