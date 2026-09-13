import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { ambilItemDikirimJamaah } from '@/lib/perlengkapan';
import { KAMAR_KEY, hargaProgram, resolveJamaahHarga } from '@/lib/jamaahHarga';

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

    // Status perlengkapan (WMS) per jamaah — sama pola kayak GET /api/bookings
    // (dashboard jamaah), cuma di sini dilengkapi daftar item yang BENERAN
    // udah dikirim (dibaca dari ledger, lihat ambilItemDikirimJamaah) buat
    // ditampilin sebagai card "Tanda Terima" langsung di modal detail admin,
    // gak perlu buka halaman cetak buat sekadar liat apa aja yang dikirim.
    if (booking.dp_status === 'confirmed' && Array.isArray(booking.jamaah_data)) {
      const [pengirimanRows] = await pool.query(
        'SELECT jamaah_idx, status, dikirim_at, diterima_at FROM perlengkapan_pengiriman WHERE booking_id = ?',
        [booking.id]
      );
      const statusMap = new Map(pengirimanRows.map(p => [p.jamaah_idx, p]));
      booking.perlengkapan_status = await Promise.all(booking.jamaah_data.map(async (j, idx) => {
        const p = statusMap.get(idx);
        const status = p?.status || 'belum_diproses';
        const items = (status === 'dikirim' || status === 'diterima')
          ? await ambilItemDikirimJamaah(pool, { bookingId: booking.id, jamaahIdx: idx })
          : [];
        return {
          idx, nama: j.nama || `Jamaah ${idx + 1}`, status,
          dikirim_at: p?.dikirim_at || null, diterima_at: p?.diterima_at || null, items,
        };
      }));
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
      paket, kamar, harga_custom, jamaah_edit,
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
      let hargaPerJamaah = hargaProgram(prog, paketBaru, kamarKey);
      if (Number(harga_custom) > 0) hargaPerJamaah = Number(harga_custom);

      // Samakan SEMUA entry jamaah aktif ke kombo seragam ini juga — biar
      // tombol ini tetap berfungsi "reset semua orang ke kombo ini",
      // termasuk menetralkan booking yang sebelumnya sempat diedit campur
      // per-orang lewat jamaah_edit (lihat branch di bawah).
      let jd = bk.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      const entries = Array.isArray(jd) ? jd : [];
      const entriesBaru = entries.map(e => e.status_jamaah === 'dibatalkan'
        ? e : { ...e, paket: paketBaru, kamar: kamarBaru, harga_jual: hargaPerJamaah });
      const aktifCount = entriesBaru.filter(e => e.status_jamaah !== 'dibatalkan').length || bk.jumlah_jamaah || 1;
      const opsiTotal = Number(bk.opsi_tambahan_total) || 0;
      const totalHargaBaru = hargaPerJamaah * aktifCount + opsiTotal;

      if (entries.length > 0) {
        await pool.query(
          'UPDATE bookings SET paket = ?, kamar = ?, total_harga = ?, jamaah_data = ? WHERE id = ?',
          [paketBaru, kamarBaru, totalHargaBaru, JSON.stringify(entriesBaru), id]
        );
      } else {
        await pool.query(
          'UPDATE bookings SET paket = ?, kamar = ?, total_harga = ? WHERE id = ?',
          [paketBaru, kamarBaru, totalHargaBaru, id]
        );
      }

      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'edit_booking_paket',
        target_type: 'booking',
        target_id: id,
        keterangan: `${bk.paket}/${bk.kamar} (Rp ${Number(bk.total_harga).toLocaleString('id-ID')}) → ${paketBaru}/${kamarBaru} (Rp ${totalHargaBaru.toLocaleString('id-ID')})${Number(harga_custom) > 0 ? ' — harga custom' : ''}`,
      });

      return Response.json({ message: 'Paket/kamar booking berhasil diperbarui!', total_harga: totalHargaBaru });
    }

    // Edit Paket/Kamar 1 JAMAAH SPESIFIK — ADMIN ONLY. Beda dari branch di
    // atas yang nyamain semua orang; ini buat kasus 1 orang minta upgrade/
    // ganti kamar sendiri, jamaah lain di booking yang sama gak kesentuh.
    // Lazy-backfill: begitu booking ini pertama kali diedit per-orang, SEMUA
    // entry aktif lain ikut dikasih kombo eksplisit (dari nilai booking-level
    // saat ini) dulu sebelum entry target diubah — jaga invariant "semua
    // entry aktif punya kombo sendiri, atau semua kosong" (lihat
    // src/lib/jamaahHarga.js).
    if (jamaah_edit) {
      if (!isAdmin) {
        return Response.json({ error: 'Cuma admin yang boleh mengedit paket/kamar jamaah.' }, { status: 403 });
      }
      const { idx, paket: paketJamaahBaru, kamar: kamarJamaahBaru, harga_custom: hargaCustomJamaah } = jamaah_edit;
      if (idx == null) {
        return Response.json({ error: 'idx jamaah wajib diisi' }, { status: 400 });
      }
      const [[bk]] = await pool.query('SELECT * FROM bookings WHERE id = ?', [id]);
      if (!bk) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
      if (bk.status === 'dibatalkan' || bk.status === 'selesai') {
        return Response.json({ error: 'Booking yang sudah dibatalkan/selesai tidak bisa diedit.' }, { status: 400 });
      }
      const [[prog]] = await pool.query('SELECT * FROM programs WHERE id = ?', [bk.prog_id]);
      if (!prog) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });

      let jd = bk.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      const entries = Array.isArray(jd) ? jd : [];
      const target = entries[idx];
      if (!target) return Response.json({ error: 'Jamaah tidak ditemukan pada booking ini' }, { status: 404 });
      if (target.status_jamaah === 'dibatalkan') {
        return Response.json({ error: 'Jamaah ini sudah dibatalkan.' }, { status: 400 });
      }

      const bkUntukResolve = { ...bk, jamaah_data: entries };
      entries.forEach((e, i) => {
        if (e.status_jamaah === 'dibatalkan') return;
        if (!(e.paket && e.kamar && e.harga_jual != null)) {
          const resolved = resolveJamaahHarga(bkUntukResolve, e);
          entries[i] = { ...e, paket: resolved.paket, kamar: resolved.kamar, harga_jual: resolved.hargaJual };
        }
      });

      const paketBaru = paketJamaahBaru || entries[idx].paket;
      const kamarBaru = kamarJamaahBaru || entries[idx].kamar;
      const kamarKeyBaru = KAMAR_KEY(kamarBaru);
      let hargaBaru = hargaProgram(prog, paketBaru, kamarKeyBaru);
      if (bk.referral_perw_id) {
        const [phRows] = await pool.query(
          'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?',
          [bk.referral_perw_id, bk.prog_id]
        );
        const jualPerw = phRows[0]?.[`jual_${paketBaru}_${kamarKeyBaru}`];
        if (jualPerw && Number(jualPerw) > 0) hargaBaru = Number(jualPerw);
      }
      if (Number(hargaCustomJamaah) > 0) hargaBaru = Number(hargaCustomJamaah);

      const sebelum = `${entries[idx].paket}/${entries[idx].kamar} (Rp ${Number(entries[idx].harga_jual).toLocaleString('id-ID')})`;
      entries[idx] = { ...entries[idx], paket: paketBaru, kamar: kamarBaru, harga_jual: hargaBaru };

      const opsiTotal = Number(bk.opsi_tambahan_total) || 0;
      const totalHargaBaru = entries.reduce(
        (s, e) => s + (e.status_jamaah === 'dibatalkan' ? 0 : Number(e.harga_jual) || 0), 0
      ) + opsiTotal;

      await pool.query(
        'UPDATE bookings SET jamaah_data = ?, total_harga = ? WHERE id = ?',
        [JSON.stringify(entries), totalHargaBaru, id]
      );

      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'edit_jamaah_paket_kamar',
        target_type: 'booking',
        target_id: id,
        keterangan: `${entries[idx].nama || `jamaah ke-${Number(idx) + 1}`}: ${sebelum} → ${paketBaru}/${kamarBaru} (Rp ${hargaBaru.toLocaleString('id-ID')})${Number(hargaCustomJamaah) > 0 ? ' — harga custom' : ''}`,
      });

      return Response.json({ message: 'Paket/kamar jamaah berhasil diperbarui!', total_harga: totalHargaBaru });
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
      // Referral perwakilan jamaah terkunci sejak registrasi/booking pertama
      // (lihat src/lib/booking.js#buatSatuBooking) — cuma admin yang boleh
      // koreksi manual lewat sini, jamaah/perwakilan pemilik booking sendiri
      // tidak boleh self-service ubah atribusi ujroh-nya.
      if (!isAdmin) {
        return Response.json({ error: 'Referral booking ini terkunci, hanya admin yang bisa mengubah.' }, { status: 403 });
      }
      await pool.query('UPDATE bookings SET referral_perw_id = ? WHERE id = ?', [referral_perw_id, id]);
    }

    return Response.json({ message: 'Formulir berhasil disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}