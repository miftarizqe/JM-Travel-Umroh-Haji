import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

const KAMAR_KEY = (kamar) => kamar?.includes('Quad') ? 'quad' : kamar?.includes('Double') ? 'double' : 'triple';

// GET — detail satu booking (untuk halaman cetak formulir)
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS pemesan_nama, u.email AS pemesan_email, u.wa AS pemesan_wa
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }
    const booking = rows[0];

    // Kontrol akses: sama seperti GET /api/bookings?booking_id= —
    // boleh kalau pemilik booking, yang meng-order, atau admin.
    const uid = auth.user.id;
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    const boleh = isAdmin || booking.user_id === uid || booking.ordered_by === uid;
    if (!boleh) {
      return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });
    }

    if (typeof booking.jamaah_data === 'string') {
      try { booking.jamaah_data = JSON.parse(booking.jamaah_data); } catch { booking.jamaah_data = null; }
    }
    return Response.json({ booking });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH — simpan formulir jamaah + referral (perwakilan)
export async function PATCH(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;

    // Kontrol akses: sama seperti GET — boleh kalau pemilik booking,
    // yang meng-order (perwakilan/admin yang mendaftarkan), atau admin.
    const [existing] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [id]);
    if (existing.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }
    const uid = auth.user.id;
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    const boleh = isAdmin || existing[0].user_id === uid || existing[0].ordered_by === uid;
    if (!boleh) {
      return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });
    }

    const body = await request.json();
    const {
      form_filled, sumber_info, referral_kode,
      referral_perw_id, jamaah_data,
      paket, kamar, harga_custom,
    } = body;

    // Edit Paket/Kamar/Harga — ADMIN ONLY. Terpisah dari update formulir
    // jamaah di bawah (guard form_filled !== undefined) biar 1 PATCH gak
    // ambigu isinya formulir atau edit paket — dipakai staff kantor buat
    // koreksi manual booking yang udah dibuat (mis. jamaah minta ganti
    // paket/kamar di tengah jalan lewat telepon), sebelumnya gak ada jalur
    // sama sekali (dikonfirmasi user 2026-07-28). Harga per-jamaah default
    // ngikut harga_{paket}_{kamar} program terkini, admin bisa override manual
    // lewat harga_custom (mis. kasih diskon situasional).
    if (paket || kamar || harga_custom !== undefined) {
      if (!isAdmin) {
        return Response.json({ error: 'Cuma admin yang boleh mengedit paket/kamar/harga booking.' }, { status: 403 });
      }
      const [[bk]] = await pool.query('SELECT * FROM bookings WHERE id = ?', [id]);
      if (!bk) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
      if (bk.status === 'dibatalkan' || bk.status === 'selesai') {
        return Response.json({ error: 'Booking yang sudah dibatalkan/selesai tidak bisa diedit.' }, { status: 400 });
      }
      const [[prog]] = await pool.query('SELECT * FROM programs WHERE id = ?', [bk.prog_id]);
      if (!prog) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });

      const paketBaru = paket || bk.paket;
      const kamarBaru = kamar || bk.kamar;
      const kamarKey = KAMAR_KEY(kamarBaru);
      let hargaPerJamaah = prog[`harga_${paketBaru}_${kamarKey}`] || prog[`harga_${paketBaru}`] || 0;
      if (Number(harga_custom) > 0) hargaPerJamaah = Number(harga_custom);
      const opsiTotal = Number(bk.opsi_tambahan_total) || 0;
      const totalHargaBaru = hargaPerJamaah * (bk.jumlah_jamaah || 1) + opsiTotal;

      await pool.query(
        'UPDATE bookings SET paket = ?, kamar = ?, total_harga = ? WHERE id = ?',
        [paketBaru, kamarBaru, totalHargaBaru, id]
      );

      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'edit_booking_paket',
        target_type: 'booking',
        target_id: id,
        keterangan: `${bk.paket}/${bk.kamar} (Rp ${Number(bk.total_harga).toLocaleString('id-ID')}) → ${paketBaru}/${kamarBaru} (Rp ${totalHargaBaru.toLocaleString('id-ID')})${Number(harga_custom) > 0 ? ' — harga custom' : ''}`,
      });

      return Response.json({ message: 'Paket/kamar booking berhasil diperbarui!', total_harga: totalHargaBaru });
    }

    // Update formulir jamaah — cuma jalan kalau memang dikirim (bukan
    // request edit paket di atas), biar gak ke-NULL-kan form_filled/
    // jamaah_data pas admin cuma mau edit paket doang.
    if (form_filled !== undefined) {
      await pool.query(
        `UPDATE bookings SET
          form_filled = ?,
          jamaah_data = ?
        WHERE id = ?`,
        [
          form_filled,
          jamaah_data ? JSON.stringify(jamaah_data) : null,
          id,
        ]
      );
    }

    // sumber_info, referral_kode, referral_perw_id sudah dicatat saat booking
    // dibuat (checkout/order-jamaah) — hanya ditimpa kalau memang dikirim
    // eksplisit, biar tidak ke-null-kan tanpa sengaja.
    if (sumber_info) {
      await pool.query('UPDATE bookings SET sumber_info = ? WHERE id = ?', [sumber_info, id]);
    }
    if (referral_kode) {
      await pool.query('UPDATE bookings SET referral_kode = ? WHERE id = ?', [referral_kode, id]);
    }
    if (referral_perw_id) {
      await pool.query('UPDATE bookings SET referral_perw_id = ? WHERE id = ?', [referral_perw_id, id]);
    }

    return Response.json({ message: 'Formulir berhasil disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}