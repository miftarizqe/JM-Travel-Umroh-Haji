import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { catatRekening } from '@/lib/rekeningLedger';
import { potongKuotaSeatDp } from '@/lib/booking';
import { potongSaldoDeposit, saldoDeposit } from '@/lib/depositSaldo';
import { generateTandaTerimaUntukPayment } from '@/lib/invoiceKwitansi';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

const errStatus = (message, status) => Object.assign(new Error(message), { status });

// POST /api/bookings/[id]/bayar-dp-saldo  body opsional: { nominal }
// Potong DP booking BARU pakai Saldo Deposit (dikonfirmasi user 2026-10-20) —
// BOLEH SEBAGIAN (gak harus nutup penuh, dikonfirmasi user 2026-10-20 lagi):
// `nominal` opsional, default "sebanyak mungkin" (min saldo, sisa DP). Kalau
// potongannya nutup penuh sisa DP, payment langsung confirmed (mirror efek
// samping "admin confirm DP" di PATCH /api/payments — potong kuota seat,
// dp_status, rekening, TTU — duplikasi SENGAJA, gak nyentuh/refactor route
// itu, lihat catatan di eksekusiPembatalan). Kalau cuma motong SEBAGIAN,
// payment TETAP pending dengan amount yang udah dikurangi — jamaah masih
// perlu transfer manual + upload bukti buat sisanya, lewat alur normal
// (gak ada efek samping lain yang jalan duluan, aman).
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    let nominalDiminta = null;
    try {
      const body = await request.json();
      if (body && body.nominal != null) nominalDiminta = Number(body.nominal);
    } catch { /* body kosong -> pakai default "sebanyak mungkin" */ }

    const conn = await pool.getConnection();
    let result;
    try {
      await conn.beginTransaction();

      const [[bk]] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
      if (!bk) throw errStatus('Booking tidak ditemukan', 404);
      if (!isAdmin && bk.user_id !== auth.user.id && bk.ordered_by !== auth.user.id) {
        throw errStatus('Anda tidak punya akses ke booking ini', 403);
      }
      if (bk.status !== 'active') {
        throw errStatus('Booking ini tidak dalam status aktif.', 400);
      }
      if (bk.dp_status === 'confirmed') {
        throw errStatus('DP booking ini sudah dikonfirmasi.', 400);
      }

      const [[dp]] = await conn.query(
        "SELECT * FROM payments WHERE booking_id = ? AND type = 'dp' AND status = 'pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [id]
      );
      if (!dp) throw errStatus('Tidak ada pembayaran DP yang menunggu untuk booking ini.', 400);

      // Saldo dipakai PUNYA AKUN LOGIN yang checkout (bukan NIK jamaah di
      // booking) — bisa dipakai bayar DP booking atas nama siapa saja,
      // sama kayak kebijakan "boleh pakai atas nama siapa aja" (dikonfirmasi
      // user 2026-10-20).
      const pemakaiSaldo = isAdmin ? bk.user_id : auth.user.id;
      const saldo = await saldoDeposit(conn, pemakaiSaldo);
      const sisaDp = Number(dp.amount);
      const potongan = Math.min(nominalDiminta != null ? nominalDiminta : saldo, saldo, sisaDp);
      if (!(potongan > 0)) {
        throw errStatus(saldo <= 0 ? 'Saldo Deposit Anda kosong.' : 'Nominal potongan tidak valid.', 400);
      }

      await potongSaldoDeposit(conn, {
        userId: pemakaiSaldo, bookingIdPakai: id,
        nominal: potongan,
        keterangan: `Potong DP booking ${id} (${bk.prog_name || '-'}) pakai Saldo Deposit`,
      });

      const sisaSetelahPotongan = sisaDp - potongan;
      await conn.query("UPDATE payments SET amount = ?, sumber_dana = 'saldo_deposit' WHERE id = ?", [sisaSetelahPotongan, dp.id]);

      const lunasPenuh = sisaSetelahPotongan === 0;
      if (lunasPenuh) {
        // Kuota kursi dipotong DULU (mirror PATCH /api/payments) — biar kalau
        // program ini ternyata udah penuh, gagal bersih sebelum saldo kepotong.
        await potongKuotaSeatDp(conn, id);
        await conn.query("UPDATE payments SET status = 'confirmed' WHERE id = ?", [dp.id]);
        await conn.query("UPDATE bookings SET dp_status = 'confirmed' WHERE id = ?", [id]);
      }

      await conn.commit();
      result = { bookingId: id, paymentId: dp.id, potongan, sisaSetelahPotongan, lunasPenuh, progName: bk.prog_name, publishType: null };

      const [[prog]] = await conn.query('SELECT publish_type FROM programs WHERE id = ?', [bk.prog_id]);
      result.publishType = prog?.publish_type || null;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }

    // Efek di luar transaksi (rekening, TTU, audit) — gagal di sini JANGAN
    // batalin pembayaran yang udah beneran confirmed, mirror pola
    // PATCH /api/payments (try/catch per efek, log doang kalau gagal).
    // Cuma jalan kalau lunasPenuh — kalau cuma potongan sebagian, payment
    // masih pending, efek samping ini nunggu admin confirm transfer
    // sisanya lewat alur normal (gak diduplikasi di sini).
    if (result.lunasPenuh) {
      if (result.publishType !== 'sahabat_baitullah') {
        try {
          await catatRekening(pool, {
            rekening: 'alkhalid', jenis: 'masuk', sumber_tipe: 'payment_dp',
            sumber_id: result.paymentId, nominal: result.potongan,
            keterangan: `DP (Saldo Deposit) — ${result.progName || id}`,
          });
        } catch (e) {
          console.error('Gagal catat rekening Alkhalid (DP via saldo deposit):', e);
        }
      }
      try {
        const ttu = await generateTandaTerimaUntukPayment(pool, result.paymentId, auth.user.id);
        if (ttu?.id) {
          await kirimNotifikasiAdmin(pool, {
            tipe: 'dokumen_perlu_dikirim',
            judul: 'Tanda Terima Uang Perlu Dikirim',
            pesan: `DP booking ${result.progName || id} dibayar pakai Saldo Deposit — Tanda Terima Uang perlu dicek & dikirim ke jamaah.`,
            link: `/admin/cetak-invoice/${ttu.id}`,
          });
        }
      } catch (e) {
        console.error('Gagal auto-generate tanda terima (DP via saldo deposit):', e);
      }
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'potong_dp_saldo_deposit',
      target_type: 'booking',
      target_id: id,
      keterangan: `DP Rp ${result.potongan.toLocaleString('id-ID')} dipotong dari Saldo Deposit${result.lunasPenuh ? ' (DP lunas penuh)' : ` — sisa Rp ${result.sisaSetelahPotongan.toLocaleString('id-ID')} masih perlu transfer manual`}`,
    });

    return Response.json({
      message: result.lunasPenuh
        ? 'DP berhasil dilunasi penuh pakai Saldo Deposit.'
        : `Rp ${result.potongan.toLocaleString('id-ID')} dipotong dari Saldo Deposit. Sisa Rp ${result.sisaSetelahPotongan.toLocaleString('id-ID')} masih perlu ditransfer manual.`,
      potongan: result.potongan,
      sisa: result.sisaSetelahPotongan,
      lunas_penuh: result.lunasPenuh,
    });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error('POST /api/bookings/[id]/bayar-dp-saldo gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
