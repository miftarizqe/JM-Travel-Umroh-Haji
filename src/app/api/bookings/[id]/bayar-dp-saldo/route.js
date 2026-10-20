import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { catatRekening } from '@/lib/rekeningLedger';
import { potongKuotaSeatDp } from '@/lib/booking';
import { potongSaldoDeposit, saldoDeposit } from '@/lib/depositSaldo';
import { generateTandaTerimaUntukPayment } from '@/lib/invoiceKwitansi';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

const errStatus = (message, status) => Object.assign(new Error(message), { status });

// POST /api/bookings/[id]/bayar-dp-saldo
// Bayar DP booking BARU pakai Saldo Deposit (dikonfirmasi user 2026-10-20) —
// alternatif dari transfer manual + upload bukti. KEBIJAKAN: cuma FULL
// (saldo wajib >= nominal DP persis), TIDAK ADA kombinasi sebagian-saldo-
// sebagian-transfer (dikonfirmasi lewat scoping awal, biar gak nambah
// matriks validasi "Transfer Tepat" admin yang udah kompleks). Kalau saldo
// kurang, jamaah tetap transfer manual seperti biasa — opsi ini cuma
// nongol di UI kalau saldo cukup (lihat checkout/dashboard jamaah).
//
// Mirror persis efek samping "admin confirm DP" di PATCH /api/payments
// (potong kuota seat, dp_status, rekening, TTU) TAPI gak nyentuh/refactor
// route itu (resiko regresi ke alur transfer manual yang udah jalan) —
// duplikasi orkestrasi ini SENGAJA, bukan lupa reuse.
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';

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
      if (saldo < dp.amount) {
        throw errStatus(`Saldo Deposit tidak cukup buat bayar DP ini (tersedia Rp ${saldo.toLocaleString('id-ID')}, butuh Rp ${Number(dp.amount).toLocaleString('id-ID')}). Saldo Deposit cuma bisa dipakai kalau menutup DP secara PENUH.`, 400);
      }

      // Kuota kursi dipotong DULU (mirror PATCH /api/payments) — biar kalau
      // program ini ternyata udah penuh, gagal bersih sebelum saldo kepotong.
      await potongKuotaSeatDp(conn, id);
      await potongSaldoDeposit(conn, {
        userId: pemakaiSaldo, bookingIdPakai: id,
        nominal: Number(dp.amount),
        keterangan: `Bayar DP booking ${id} (${bk.prog_name || '-'})`,
      });
      await conn.query("UPDATE payments SET status = 'confirmed' WHERE id = ?", [dp.id]);
      await conn.query("UPDATE bookings SET dp_status = 'confirmed' WHERE id = ?", [id]);

      await conn.commit();
      result = { bookingId: id, paymentId: dp.id, nominal: Number(dp.amount), progName: bk.prog_name, publishType: null };

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
    if (result.publishType !== 'sahabat_baitullah') {
      try {
        await catatRekening(pool, {
          rekening: 'alkhalid', jenis: 'masuk', sumber_tipe: 'payment_dp',
          sumber_id: result.paymentId, nominal: result.nominal,
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

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'bayar_dp_saldo_deposit',
      target_type: 'booking',
      target_id: id,
      keterangan: `DP Rp ${result.nominal.toLocaleString('id-ID')} dibayar pakai Saldo Deposit`,
    });

    return Response.json({ message: 'DP berhasil dibayar pakai Saldo Deposit.', nominal: result.nominal });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error('POST /api/bookings/[id]/bayar-dp-saldo gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
