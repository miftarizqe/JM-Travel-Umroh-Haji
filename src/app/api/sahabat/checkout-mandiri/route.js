import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cekPemesanBolehOrder, buatSatuBooking } from '@/lib/booking';
import { cariVoucherValid, hitungPotonganItem, pakaiVoucher } from '@/lib/voucher';
import { cekDanFinalisasiLunasSahabat } from '@/lib/pembayaranSahabatMandiri';

// POST /api/sahabat/checkout-mandiri — checkout Program Sahabat Baitullah
// (publish_type='sahabat_baitullah') buat DIRI SENDIRI. Beda dari
// /api/bookings biasa: gak ada tahap DP terpisah — langsung diarahkan ke
// lunas, dibayar SELURUHNYA dari saldo tabungan umroh (dikonfirmasi user
// 2026-09-29 — bukan lagi mix saldo+transfer pribadi ke rekening PT
// Alkhalid, itu keliru: kalau saldo dari ujroh belum cukup, jamaah nabung
// sendiri ke rekening tabungan umroh MEREKA SENDIRI [no_rekening_tabungan_
// umroh, hasil blokir BSI], admin cek mutasi & catat via
// /api/admin/sahabat/setoran-mandiri — itu OTOMATIS nambah saldo_tabungan_
// umroh yang dipakai di sini, bukan jalur pembayaran terpisah per-booking).
// Checkout ditolak total kalau saldo belum cukup — TIDAK ADA lagi opsi
// upload bukti transfer buat nutup selisihnya. Booking baru beneran "paid"
// begitu pemakaian saldo di-acc admin — lihat cekDanFinalisasiLunasSahabat
// di src/lib/pembayaranSahabatMandiri.js.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const me = await cekPemesanBolehOrder(pool, auth.user.id);
    if (me.role !== 'sahabat_baitullah') {
      return Response.json({ error: 'Endpoint ini khusus Jamaah Sahabat Baitullah' }, { status: 403 });
    }

    const body = await request.json();
    const { prog_id, paket, kamar, nama, wa, jk, alamat, voucher_kode, opsi_tambahan_ids } = body;

    const [progs] = await pool.query('SELECT * FROM programs WHERE id = ?', [prog_id]);
    const prog = progs[0];
    if (!prog) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });
    if (prog.publish_type !== 'sahabat_baitullah') {
      return Response.json({ error: 'Program ini bukan Program Sahabat Baitullah — pakai jalur checkout biasa.' }, { status: 400 });
    }

    // Max 1 booking AKTIF per akun per program eksklusif (dikonfirmasi user
    // 2026-10-06) — boleh checkout lagi di program yang SAMA begitu booking
    // sebelumnya 'selesai'/batal, dan bebas checkout program LAIN kapan pun
    // (gak ada batasan lintas-program). menunggu_batal tetap dihitung aktif
    // (pembatalannya belum final).
    const [[bookingAktif]] = await pool.query(
      `SELECT id FROM bookings WHERE user_id = ? AND prog_id = ? AND status IN ('active','menunggu_batal') LIMIT 1`,
      [auth.user.id, prog_id]
    );
    if (bookingAktif) {
      return Response.json({ error: 'Anda sudah punya booking aktif di program eksklusif ini. Checkout ulang baru bisa dilakukan setelah booking sebelumnya selesai atau dibatalkan.' }, { status: 400 });
    }

    // Jalur "daftarin orang lain" cuma buat akun non-Muslim (dikonfirmasi
    // user 2026-10-06, lihat migration 192_referral-nonis-sahabat) — mereka
    // sendiri gak bisa umroh, jadi memberangkatkan orang lain (Muslim) pakai
    // akun/tabungannya. Akun Muslim checkout WAJIB buat diri sendiri — nama
    // dipaksa dari profil akun di server, APAPUN yang dikirim client (field
    // "Nama Lengkap" di UI-nya sendiri udah dikunci, ini lapisan server-side-nya).
    const namaFinal = me.agama === 'non_islam' ? String(nama || '').trim() : me.name;
    if (!namaFinal) return Response.json({ error: 'Nama jamaah wajib diisi' }, { status: 400 });

    // Voucher — pola sama persis POST /api/bookings, gak percaya nominal dari
    // client, dihitung ulang server-side.
    let voucherNominal = 0;
    let voucherKodeFinal = null;
    if (voucher_kode) {
      const voucher = await cariVoucherValid(pool, voucher_kode, prog_id, auth.user, 1);
      voucherNominal = await hitungPotonganItem(pool, prog, voucher, { paket, kamar, jumlah_jamaah: 1 }, null);
      voucherKodeFinal = voucher.kode;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Saldo tersedia — jenis SAMA kayak /api/sahabat/dashboard, DITAMBAH
      // pemakaian_saldo_sahabat biar pemakaian booking sebelumnya udah
      // kepotong. 'setoran_mandiri_sahabat' SEMPAT ketinggalan dari daftar
      // ini (bug ditemukan & diperbaiki 2026-09-29) — akibatnya setoran
      // mandiri jamaah (nabung sendiri ke rekening tabungan umroh pribadi,
      // dicatat admin via /api/admin/sahabat/setoran-mandiri) kehitung di
      // dashboard tapi TIDAK kehitung di sini pas checkout, jadi jamaah
      // dikira kurang saldo padahal sebenarnya udah cukup.
      const [saldoRows] = await conn.query(
        `SELECT nominal FROM komisi_ledger WHERE penerima_id = ? AND dikonfirmasi_at IS NOT NULL
         AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat','koreksi_saldo_sahabat')`,
        [auth.user.id]
      );
      const saldoTersedia = Math.max(0, saldoRows.reduce((s, r) => s + Number(r.nominal || 0), 0));

      const hasil = await buatSatuBooking(conn, {
        user_id: auth.user.id, ordered_by: auth.user.id, ordered_by_role: 'sahabat_baitullah',
        prog_id, paket, kamar, jumlah_jamaah: 1,
        namas: [namaFinal], was: [wa], jks: [jk], alamats: [alamat],
        voucher_kode_final: voucherKodeFinal, voucher_nominal: voucherNominal,
        opsi_tambahan_ids: opsi_tambahan_ids || [],
        meRole: 'sahabat_baitullah',
      });

      const totalHarga = hasil.totalHarga;
      // Wajib ditutup PENUH dari saldo tabungan umroh — TIDAK ADA lagi
      // opsi transfer pribadi buat nutup selisih (dikonfirmasi user
      // 2026-09-29). Kalau saldo dari ujroh belum cukup, jamaah nabung
      // sendiri ke rekening tabungan umrohnya sendiri dulu (admin catat via
      // setoran-mandiri, otomatis nambah saldoTersedia), baru checkout lagi.
      if (saldoTersedia < totalHarga) {
        throw Object.assign(new Error(
          `Saldo tabungan umroh Anda belum cukup (tersedia Rp${saldoTersedia.toLocaleString('id-ID')} dari Rp${totalHarga.toLocaleString('id-ID')}). ` +
          'Tambah saldo dengan menabung ke rekening tabungan umroh Anda sendiri, lalu tunggu admin memperbarui saldo Anda sebelum checkout lagi.'
        ), { status: 400 });
      }
      const saldoDipakai = totalHarga;

      if (saldoDipakai > 0) {
        await conn.query(
          `INSERT INTO komisi_ledger (booking_id, penerima_id, penerima_nama, jenis, nominal, keterangan)
           VALUES (?, ?, ?, 'pemakaian_saldo_sahabat', ?, ?)`,
          [hasil.bookingId, auth.user.id, auth.user.name, -saldoDipakai, `Pemakaian saldo tabungan untuk booking ${prog.name}`]
        );
      }

      // buatSatuBooking otomatis nyimpen 1 baris payments type='dp' (nominal
      // dpAmount) — gak relevan di jalur ini (gak ada tahap DP terpisah,
      // total_harga PENUH dilunasi dari saldo di atas, gak ada baris
      // payments 'lunas' lagi sama sekali sejak transfer-pribadi dicabut).
      // Nol-in nominalnya (bukan cuma confirm) biar gak KEDOBEL kehitung di
      // generateOrUpdateKwitansi (yang jumlahin payments dp+lunas confirmed).
      await conn.query("UPDATE payments SET status = 'confirmed', amount = 0 WHERE booking_id = ? AND type = 'dp'", [hasil.bookingId]);

      await conn.query(
        "UPDATE bookings SET dp_status = 'confirmed', pelunasan_status = 'pending_confirm' WHERE id = ?",
        [hasil.bookingId]
      );

      await conn.commit();

      if (voucherKodeFinal) {
        await pakaiVoucher(pool, voucherKodeFinal, 1);
      }

      // Jaring pengaman buat kasus total_harga 0 (misal voucher nutup penuh)
      // — gak ada baris debit ATAUPUN payment yang perlu di-acc sama sekali,
      // jadi langsung selesaikan di sini juga (no-op aman kalau salah satu
      // masih pending, lihat cekDanFinalisasiLunasSahabat).
      try {
        await cekDanFinalisasiLunasSahabat(pool, hasil.bookingId, auth.user);
      } catch (e) {
        console.error('Gagal cek finalisasi lunas sahabat mandiri pas checkout:', e);
      }

      return Response.json({
        message: 'Pendaftaran berhasil! Menunggu konfirmasi admin.',
        booking_id: hasil.bookingId,
        total_harga: totalHarga,
        saldo_dipakai: saldoDipakai,
      }, { status: 201 });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}
