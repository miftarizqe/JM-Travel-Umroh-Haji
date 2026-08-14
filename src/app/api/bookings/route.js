import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cekPemesanBolehOrder, buatSatuBooking } from '@/lib/booking';
import { cariVoucherValid, hitungPotonganItem, pakaiVoucher } from '@/lib/voucher';

export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const bookingId = searchParams.get('booking_id');

    // Ambil 1 booking by booking_id (dipakai form-jamaah untuk perwakilan/admin)
    if (bookingId) {
      const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      if (rows.length === 0) {
        return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
      }
      const b = rows[0];
      // Kontrol akses: boleh kalau pemilik booking, yang meng-order, atau admin
      const uid = auth.user.id;
      const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
      const boleh = isAdmin || b.user_id === uid || b.ordered_by === uid;
      if (!boleh) {
        return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });
      }
      return Response.json({ bookings: [b] });
    }

    if (!userId) {
      return Response.json({ error: 'user_id atau booking_id wajib diisi' }, { status: 400 });
    }
    const [bookings] = await pool.query(
      'SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Status perlengkapan per jamaah (WMS) — cuma relevan begitu DP confirmed,
    // dilampirkan di sini biar dashboard jamaah gak perlu fetch endpoint
    // terpisah. Identitas jamaah = (booking_id, idx array jamaah_data), sama
    // seperti pola manifest/perlengkapan-pengiriman.
    const bookingIdsDpConfirmed = bookings.filter(b => b.dp_status === 'confirmed').map(b => b.id);
    if (bookingIdsDpConfirmed.length > 0) {
      const [pengirimanRows] = await pool.query(
        `SELECT booking_id, jamaah_idx, status FROM perlengkapan_pengiriman WHERE booking_id IN (${bookingIdsDpConfirmed.map(() => '?').join(',')})`,
        bookingIdsDpConfirmed
      );
      const statusMap = new Map(pengirimanRows.map(p => [`${p.booking_id}:${p.jamaah_idx}`, p.status]));
      for (const b of bookings) {
        if (b.dp_status !== 'confirmed') continue;
        let jd = b.jamaah_data;
        if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
        const entries = Array.isArray(jd) ? jd : [];
        b.perlengkapan_status = entries.map((j, idx) => ({
          idx,
          nama: j.nama || `Jamaah ${idx + 1}`,
          status: statusMap.get(`${b.id}:${idx}`) || 'belum_diproses',
        }));
      }
    }

    return Response.json({ bookings });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const me = await cekPemesanBolehOrder(pool, auth.user.id);

    const body = await request.json();
    const { prog_id, paket, kamar, voucher_kode, jumlah_jamaah, referral_perw_id } = body;

    // ====== VOUCHER ======
    // Admin yang membuat kode; perwakilan/jamaah memakainya. Diskon memotong
    // margin pribadi perwakilan yang closing (kalau ada referral_perw_id) —
    // makanya butuh data harga jual perwakilan + cost basis di sini, terpisah
    // dari buatSatuBooking yang gak perlu tau soal voucher.
    let voucherNominal = 0;
    let voucherKodeFinal = null;
    if (voucher_kode) {
      const [progs] = await pool.query('SELECT * FROM programs WHERE id = ?', [prog_id]);
      const prog = progs[0];
      if (!prog) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });

      const voucher = await cariVoucherValid(pool, voucher_kode, prog_id, auth.user, jumlah_jamaah);
      voucherNominal = await hitungPotonganItem(pool, prog, voucher, { paket, kamar, jumlah_jamaah }, referral_perw_id);
      voucherKodeFinal = voucher.kode;
    }

    const hasil = await buatSatuBooking(pool, {
      ...body,
      meRole: me.role,
      voucher_kode_final: voucherKodeFinal,
      voucher_nominal: voucherNominal,
    });

    if (voucherKodeFinal) {
      await pakaiVoucher(pool, voucherKodeFinal, jumlah_jamaah);
    }

    return Response.json({
      message: 'Booking berhasil!',
      booking_id: hasil.bookingId,
      dp_amount: hasil.dpAmount,
      total_harga: hasil.totalHarga
    }, { status: 201 });

  } catch (error) {
    if (error.status) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}