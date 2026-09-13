import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cekPemesanBolehOrder, buatSatuBooking } from '@/lib/booking';
import { cariVoucherValid, hitungPotonganItem, pakaiVoucher } from '@/lib/voucher';
import { cekDanFinalisasiLunasSahabat } from '@/lib/pembayaranSahabatMandiri';

// POST /api/sahabat/checkout-mandiri — checkout Program Sahabat Baitullah
// (publish_type='sahabat_baitullah') buat DIRI SENDIRI. Beda dari /api/bookings biasa:
// gak ada tahap DP terpisah — langsung diarahkan ke lunas, dibayar dari saldo
// tabungan umroh (wajib dipakai duluan) + sisa pribadi via transfer manual
// kalau saldo belum cukup (dikonfirmasi user 2026-08-29). Booking baru beneran
// "paid" begitu KEDUA sumber dana (kalau ada) di-acc admin terpisah — lihat
// cekDanFinalisasiLunasSahabat di src/lib/pembayaranSahabatMandiri.js.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const me = await cekPemesanBolehOrder(pool, auth.user.id);
    if (me.role !== 'sahabat_baitullah') {
      return Response.json({ error: 'Endpoint ini khusus Jamaah Sahabat Baitullah' }, { status: 403 });
    }

    const body = await request.json();
    const { prog_id, paket, kamar, nama, wa, jk, alamat, voucher_kode, bukti_path, bukti_nama, opsi_tambahan_ids } = body;

    const [progs] = await pool.query('SELECT * FROM programs WHERE id = ?', [prog_id]);
    const prog = progs[0];
    if (!prog) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });
    if (prog.publish_type !== 'sahabat_baitullah') {
      return Response.json({ error: 'Program ini bukan Program Sahabat Baitullah — pakai jalur checkout biasa.' }, { status: 400 });
    }

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
      // pemakaian_saldo_sahabat biar pemakaian booking sebelumnya udah kepotong.
      const [saldoRows] = await conn.query(
        `SELECT nominal FROM komisi_ledger WHERE penerima_id = ? AND dikonfirmasi_at IS NOT NULL
         AND jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat')`,
        [auth.user.id]
      );
      const saldoTersedia = Math.max(0, saldoRows.reduce((s, r) => s + Number(r.nominal || 0), 0));

      const hasil = await buatSatuBooking(conn, {
        user_id: auth.user.id, ordered_by: auth.user.id, ordered_by_role: 'sahabat_baitullah',
        prog_id, paket, kamar, jumlah_jamaah: 1,
        namas: [nama], was: [wa], jks: [jk], alamats: [alamat],
        voucher_kode_final: voucherKodeFinal, voucher_nominal: voucherNominal,
        opsi_tambahan_ids: opsi_tambahan_ids || [],
        meRole: 'sahabat_baitullah',
      });

      const totalHarga = hasil.totalHarga;
      const saldoDipakai = Math.min(saldoTersedia, totalHarga);
      const sisaPribadi = totalHarga - saldoDipakai;

      if (sisaPribadi > 0 && !bukti_path) {
        throw Object.assign(new Error('Saldo tabungan belum cukup — bukti transfer buat sisa pembayaran wajib diunggah.'), { status: 400 });
      }

      if (saldoDipakai > 0) {
        await conn.query(
          `INSERT INTO komisi_ledger (booking_id, penerima_id, penerima_nama, jenis, nominal, keterangan)
           VALUES (?, ?, ?, 'pemakaian_saldo_sahabat', ?, ?)`,
          [hasil.bookingId, auth.user.id, auth.user.name, -saldoDipakai, `Pemakaian saldo tabungan untuk booking ${prog.name}`]
        );
      }

      if (sisaPribadi > 0) {
        await conn.query(
          `INSERT INTO payments (booking_id, user_id, nama, type, amount, kode_unik, bukti_path, bukti_nama, bukti_uploaded_at, status)
           VALUES (?, ?, ?, 'lunas', ?, 0, ?, ?, NOW(), 'pending')`,
          [hasil.bookingId, auth.user.id, auth.user.name, sisaPribadi, bukti_path, bukti_nama || null]
        );
      }

      // buatSatuBooking otomatis nyimpen 1 baris payments type='dp' (nominal
      // dpAmount) — gak relevan di jalur ini (gak ada tahap DP terpisah,
      // total_harga PENUH direpresentasiin baris 'lunas' di atas). Nol-in
      // nominalnya (bukan cuma confirm) biar gak KEDOBEL kehitung di
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
        sisa_pribadi: sisaPribadi,
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
