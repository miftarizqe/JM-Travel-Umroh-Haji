import pool from '@/lib/db';
import { wajibRole, wajibLogin } from '@/lib/auth';
import { kirimNotifikasi, kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { generateOrUpdateKwitansi, generateTandaTerimaUntukPayment } from '@/lib/invoiceKwitansi';

// GET — payments (admin/booking), termasuk bukti transfer
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    const status = searchParams.get('status');

    // JOIN bookings + referral perwakilan — dipakai buat nyusun pesan
    // WhatsApp ke jamaah (jamaah_data punya wa per orang) & ke perwakilan
    // yang refer booking ini (notifikasi ada closing baru pakai kode mereka).
    let query = `
      SELECT p.*, COALESCE(u.name, p.nama) AS nama,
             b.prog_name, b.jamaah_data, b.jumlah_jamaah, b.total_harga, b.dp_amount,
             b.referral_perw_id, b.referral_kode,
             ref.name AS referral_nama, ref.wa AS referral_wa
      FROM payments p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN users ref ON ref.id = b.referral_perw_id
    `;
    const params = [];

    if (bookingId) {
      query += ' WHERE p.booking_id = ?';
      params.push(bookingId);
    } else if (status) {
      query += ' WHERE p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.created_at DESC';

    const [payments] = await pool.query(query, params);
    return Response.json({ payments });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — submit bukti pembayaran (bukti_path WAJIB)
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { booking_id, user_id, type, amount, kode_unik, bukti_path, bukti_nama } = await request.json();

    if (!booking_id || !user_id || !type || !amount) {
      return Response.json({ error: 'Field wajib tidak lengkap' }, { status: 400 });
    }
    // Bukti transfer wajib — tidak boleh submit tanpa bukti
    if (!bukti_path) {
      return Response.json({ error: 'Bukti transfer wajib diunggah' }, { status: 400 });
    }

    const [bookings] = await pool.query(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [booking_id, user_id]
    );
    if (bookings.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }

    // Pelunasan hanya boleh setelah formulir jamaah lengkap
    if (type === 'lunas' && bookings[0].form_filled < bookings[0].form_total) {
      return Response.json(
        { error: 'Formulir jamaah belum lengkap. Lengkapi dulu sebelum pelunasan.' },
        { status: 400 }
      );
    }

    // Pelunasan hanya boleh setelah setuju Perjanjian Keberangkatan Jamaah
    if (type === 'lunas' && !bookings[0].setuju_pks) {
      return Response.json(
        { error: 'Anda belum menyetujui Perjanjian Keberangkatan Jamaah. Setujui dulu sebelum pelunasan.' },
        { status: 400 }
      );
    }

    const [users] = await pool.query('SELECT name FROM users WHERE id = ?', [user_id]);
    const nama = users.length ? users[0].name : null;

    await pool.query(
      `INSERT INTO payments
       (booking_id, user_id, nama, type, amount, kode_unik, bukti_path, bukti_nama, bukti_uploaded_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'pending')`,
      [booking_id, user_id, nama, type, amount, kode_unik || 0, bukti_path, bukti_nama || null]
    );

    if (type === 'lunas') {
      await pool.query(
        "UPDATE bookings SET pelunasan_status = 'pending_confirm' WHERE id = ?",
        [booking_id]
      );
    }

    await kirimNotifikasiAdmin(pool, {
      tipe: 'pembayaran_baru',
      judul: `Bukti ${type === 'lunas' ? 'Pelunasan' : 'DP'} Baru`,
      pesan: `${nama || 'Jamaah'} mengirim bukti ${type === 'lunas' ? 'pelunasan' : 'DP'} untuk booking ${booking_id}.`,
      link: '/admin?tab=payments',
    });

    return Response.json(
      { message: 'Bukti pembayaran berhasil dikirim! Menunggu konfirmasi admin.' },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH — admin approve/reject payment
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { payment_id, action, reject_reason } = await request.json();

    if (!payment_id || !action) {
      return Response.json({ error: 'payment_id dan action wajib diisi' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'Action harus approve atau reject' }, { status: 400 });
    }

    const [payments] = await pool.query('SELECT * FROM payments WHERE id = ?', [payment_id]);
    if (payments.length === 0) {
      return Response.json({ error: 'Payment tidak ditemukan' }, { status: 404 });
    }
    const payment = payments[0];

    const [bookingRows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [payment.booking_id]);
    const booking = bookingRows[0];
    // Kalau booking di-order-kan perwakilan, dua-duanya (jamaah & orderer) perlu tahu.
    const penerimaNotif = [booking?.user_id, booking?.ordered_by].filter((id, i, arr) => id && arr.indexOf(id) === i);

    if (action === 'approve') {
      await pool.query("UPDATE payments SET status = 'confirmed' WHERE id = ?", [payment_id]);

      if (payment.type === 'dp') {
        await pool.query("UPDATE bookings SET dp_status = 'confirmed' WHERE id = ?", [payment.booking_id]);
      } else if (payment.type === 'lunas') {
        await pool.query("UPDATE bookings SET pelunasan_status = 'paid' WHERE id = ?", [payment.booking_id]);
      }

      // Tanda Terima Uang digenerate OTOMATIS tiap pembayaran (DP/cicilan/
      // pelunasan) confirmed — 1 dokumen per payment, bukti uang itu spesifik
      // diterima. Gagal generate JANGAN sampai gagalin approve pembayarannya
      // sendiri — makanya try/catch.
      try {
        await generateTandaTerimaUntukPayment(pool, payment.id, auth.user.id);
      } catch (e) {
        console.error('Gagal auto-generate tanda terima:', e);
      }

      // Kwitansi Pembayaran cuma digenerate/di-update begitu LUNAS TOTAL
      // (payment.type 'lunas' confirmed) — bukan dari DP. Nomor dibekukan
      // pas lunas total pertama kali.
      if (payment.type === 'lunas') {
        try {
          await generateOrUpdateKwitansi(pool, payment.booking_id, auth.user.id);
        } catch (e) {
          console.error('Gagal auto-generate kwitansi:', e);
        }

        // Kalau sebelumnya udah pernah digenerate Invoice buat booking ini
        // (sbg tagihan, sebelum dibayar — bisa DP/Pelunasan/cicilan apa aja,
        // Invoice sekarang gak dibedain jenisnya lagi), begitu booking ini
        // beneran lunas total di sini, tandai semua Invoice-nya lunas
        // otomatis — nomor tetap sama, gak bikin dokumen baru, admin gak
        // perlu toggle status manual lagi.
        try {
          await pool.query(
            "UPDATE invoice_kwitansi SET status = 'paid' WHERE booking_id = ? AND jenis = 'invoice' AND status != 'paid'",
            [payment.booking_id]
          );
        } catch (e) {
          console.error('Gagal auto-settle invoice:', e);
        }
      }

      for (const uid of penerimaNotif) {
        await kirimNotifikasi(pool, {
          user_id: uid,
          tipe: payment.type === 'lunas' ? 'pelunasan_confirmed' : 'dp_confirmed',
          judul: payment.type === 'lunas' ? 'Pelunasan Dikonfirmasi' : 'DP Dikonfirmasi',
          pesan: `${payment.type === 'lunas' ? 'Pelunasan' : 'DP'} booking ${booking?.prog_name || payment.booking_id} sudah dikonfirmasi admin.`,
          link: '/dashboard/jamaah',
        });
      }

      await catatAudit(pool, {
        actor: auth.user,
        aksi: payment.type === 'lunas' ? 'approve_pelunasan' : 'approve_dp',
        target_type: 'payment',
        target_id: payment_id,
        keterangan: `Booking ${payment.booking_id} (${booking?.prog_name || '-'})`,
      });

      return Response.json({ message: 'Pembayaran berhasil dikonfirmasi!' });
    } else {
      await pool.query(
        "UPDATE payments SET status = 'rejected', reject_reason = ? WHERE id = ?",
        [reject_reason || 'Ditolak oleh admin', payment_id]
      );
      if (payment.type === 'lunas') {
        await pool.query("UPDATE bookings SET pelunasan_status = 'unpaid' WHERE id = ?", [payment.booking_id]);
      }

      for (const uid of penerimaNotif) {
        await kirimNotifikasi(pool, {
          user_id: uid,
          tipe: 'pembayaran_rejected',
          judul: 'Pembayaran Ditolak',
          pesan: `${payment.type === 'lunas' ? 'Pelunasan' : 'DP'} booking ${booking?.prog_name || payment.booking_id} ditolak: ${reject_reason || 'Ditolak oleh admin'}`,
          link: '/dashboard/jamaah',
        });
      }

      await catatAudit(pool, {
        actor: auth.user,
        aksi: payment.type === 'lunas' ? 'reject_pelunasan' : 'reject_dp',
        target_type: 'payment',
        target_id: payment_id,
        keterangan: `Booking ${payment.booking_id} (${booking?.prog_name || '-'}): ${reject_reason || 'Ditolak oleh admin'}`,
      });

      return Response.json({ message: 'Pembayaran ditolak.' });
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
