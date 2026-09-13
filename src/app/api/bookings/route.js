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

      // Status TTD Perjanjian Jamaah (dokumen_signature dokumen='jamaah') —
      // dipakai getStage() di dashboard jamaah buat nentuin apakah jalur
      // digital sudah selesai atau masih perlu lanjut ke /tanda-tangan/[id].
      const [sigRows] = await pool.query(
        `SELECT ref_id, id, fase, metode FROM dokumen_signature WHERE dokumen = 'jamaah' AND ref_id IN (${bookingIdsDpConfirmed.map(() => '?').join(',')})`,
        bookingIdsDpConfirmed
      );
      const sigMap = new Map(sigRows.map(s => [String(s.ref_id), { id: s.id, fase: s.fase, metode: s.metode }]));

      // Penyesuaian harga (kenaikan tiket/force majeure) yang masih pending
      // persetujuan jamaah — dipakai gate di /pelunasan.
      const [penyesuaianRows] = await pool.query(
        `SELECT id, booking_id, harga_baru, alasan FROM booking_penyesuaian_harga WHERE booking_id IN (${bookingIdsDpConfirmed.map(() => '?').join(',')}) AND status = 'pending'`,
        bookingIdsDpConfirmed
      );
      const penyesuaianMap = new Map(penyesuaianRows.map(p => [String(p.booking_id), { id: p.id, harga_baru: p.harga_baru, alasan: p.alasan }]));

      // Info Manasik per program (jadwal/lokasi/catatan) — sekadar info,
      // tampil di dashboard jamaah begitu DP confirmed.
      const progIds = [...new Set(bookings.filter(b => b.dp_status === 'confirmed').map(b => b.prog_id).filter(Boolean))];
      let manasikMap = new Map();
      if (progIds.length > 0) {
        const [progRows] = await pool.query(
          `SELECT id, manasik_tanggal, manasik_lokasi, manasik_catatan FROM programs WHERE id IN (${progIds.map(() => '?').join(',')})`,
          progIds
        );
        manasikMap = new Map(progRows.filter(p => p.manasik_tanggal).map(p => [String(p.id), {
          tanggal: p.manasik_tanggal, lokasi: p.manasik_lokasi, catatan: p.manasik_catatan,
        }]));
      }

      // Refund pembatalan yang sudah disetujui — dp_status booking yang
      // dibatalkan TIDAK pernah direset (lihat setujuiPembatalan di
      // src/app/api/pembatalan/route.js), jadi tetap ke-cover subset ini.
      const [refundRows] = await pool.query(
        `SELECT booking_id, refund_nominal, refund_persen, refund_status, bukti_refund_path
         FROM pembatalan WHERE booking_id IN (${bookingIdsDpConfirmed.map(() => '?').join(',')}) AND status = 'disetujui'`,
        bookingIdsDpConfirmed
      );
      const refundMap = new Map(refundRows.map(r => [String(r.booking_id), {
        nominal: r.refund_nominal, persen: r.refund_persen, status: r.refund_status, bukti_path: r.bukti_refund_path,
      }]));

      for (const b of bookings) {
        if (b.dp_status !== 'confirmed') continue;
        b.perjanjian_sig = sigMap.get(String(b.id)) || null;
        b.penyesuaian_pending = penyesuaianMap.get(String(b.id)) || null;
        b.manasik = manasikMap.get(String(b.prog_id)) || null;
        b.refund = refundMap.get(String(b.id)) || null;
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
      // `auth.user.role` (JWT sesi aktif), BUKAN `me.role` (kolom role
      // PRIMER di DB) — buat akun dual-role (role_kedua, lihat
      // migration-role-kedua.sql), meRole harus ngikutin mode yang lagi
      // di-switch aktif (mis. checkout sebagai Perwakilan walau role
      // primernya sahabat_baitullah), bukan selalu role primer. Ditemukan &
      // diperbaiki 2026-09-06 — sebelumnya auto-atribusi closing-langsung
      // ke Head of Program (buatSatuBooking di src/lib/booking.js) tetap
      // kepicu walau user udah pindah mode ke Perwakilan. `me` dari
      // cekPemesanBolehOrder di atas TETAP dipakai buat gerbang status/
      // terverifikasi (query DB fresh, benar buat itu).
      meRole: auth.user.role,
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