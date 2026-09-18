import pool from '@/lib/db';
import { wajibLogin, wajibRole } from '@/lib/auth';
import { kirimNotifikasi, kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { lepasVoucher } from '@/lib/voucher';

/**
 * Pembatalan Program
 *
 * Aturan:
 *  - Belum bayar DP  -> jamaah membatalkan LANGSUNG, tanpa persetujuan admin
 *  - Sudah bayar DP  -> harus MENGAJUKAN, admin yang memutuskan
 *  - Refund 100% kalau kesalahan JM Travel
 *  - Selain itu mengikuti S&K (nominal ditentukan admin)
 */

// GET /api/pembatalan               -> pengajuan milik user login
// GET /api/pembatalan?status=menunggu -> untuk admin
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';

    let query = `
      SELECT p.*, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah,
             b.total_harga, b.dp_amount, b.dp_status,
             u.name AS pemohon_nama, u.wa AS pemohon_wa
      FROM pembatalan p
      LEFT JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE 1=1
    `;
    const params = [];

    // Non-admin hanya melihat pengajuannya sendiri
    if (!isAdmin) {
      query += ' AND p.user_id = ?';
      params.push(auth.user.id);
    }
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.created_at DESC';

    const [rows] = await pool.query(query, params);
    return Response.json({ pembatalan: rows });
  } catch (error) {
    console.error('GET /api/pembatalan gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/pembatalan   body: { booking_id, alasan, bukti_path?, jamaah_idx? }
// Admin/super_admin bisa langsung eksekusi pembatalan (bypass antrian
// "menunggu" persetujuan) dengan kirim admin_langsung: true + penyebab/
// refund_nominal/catatan_admin sekalian — dipakai buat jamaah yang telepon/
// dateng langsung minta batal, staff kantor gak perlu suruh jamaahnya login
// & ngajuin sendiri dulu (dikonfirmasi user 2026-07-28).
//
// jamaah_idx (opsional, ADMIN LANGSUNG SAJA) — batalkan SATU jamaah spesifik
// di dalam booking (index array jamaah_data), bukan seluruh booking. Booking
// bisa isi banyak orang, kadang cuma 1 yang batal (dikonfirmasi user
// 2026-08-15). Kosong = perilaku lama, batalkan seluruh booking.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { booking_id, alasan, bukti_path, admin_langsung, penyebab, refund_nominal, catatan_admin, jamaah_idx } = await request.json();
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';

    if (!booking_id) {
      return Response.json({ error: 'booking_id wajib diisi' }, { status: 400 });
    }
    if (jamaah_idx != null && !(isAdmin && admin_langsung)) {
      return Response.json({ error: 'Pembatalan per-jamaah cuma bisa dieksekusi langsung oleh admin.' }, { status: 400 });
    }

    // Jamaah cuma boleh batalin booking miliknya sendiri; admin boleh
    // booking siapa aja (dipakai buat pembatalan langsung atas permintaan
    // jamaah yang telepon/dateng, bukan ngajuin dari akunnya sendiri).
    const [rows] = isAdmin
      ? await pool.query('SELECT * FROM bookings WHERE id = ?', [booking_id])
      : await pool.query('SELECT * FROM bookings WHERE id = ? AND user_id = ?', [booking_id, auth.user.id]);
    if (rows.length === 0) {
      return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    }
    const b = rows[0];

    if (b.status === 'selesai') {
      return Response.json({ error: 'Perjalanan sudah selesai, tidak bisa dibatalkan.' }, { status: 400 });
    }
    if (b.status === 'dibatalkan') {
      return Response.json({ error: 'Booking ini sudah dibatalkan.' }, { status: 400 });
    }
    if (b.status === 'menunggu_batal') {
      return Response.json({ error: 'Pengajuan pembatalan sedang diproses admin.' }, { status: 400 });
    }

    // Validasi jamaah_idx — harus nunjuk entry beneran di jamaah_data & belum
    // dibatalkan sebelumnya.
    if (jamaah_idx != null) {
      let jd = b.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      const entries = Array.isArray(jd) ? jd : [];
      const target = entries[jamaah_idx];
      if (!target) {
        return Response.json({ error: 'Jamaah tidak ditemukan pada booking ini' }, { status: 404 });
      }
      if (target.status_jamaah === 'dibatalkan') {
        return Response.json({ error: 'Jamaah ini sudah dibatalkan sebelumnya.' }, { status: 400 });
      }
    }

    // Total yang sudah benar-benar dibayar (pembayaran terkonfirmasi) — ini
    // total BOOKING (belum dipecah per-jamaah, sistem gak nyimpen breakdown
    // segitu detail), dipakai sebagai batas atas refund walau yang batal cuma
    // 1 orang — admin yang menilai nominal refund wajarnya berapa.
    const [bayar] = await pool.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE booking_id = ? AND status = 'confirmed'",
      [booking_id]
    );
    const totalDibayar = Number(bayar[0]?.total || 0);
    const dpSudahDibayar = b.dp_status === 'confirmed';

    // SEMUA pengajuan pembatalan JAMAAH (bukan admin_langsung) — dibayar
    // maupun belum — wajib lewat persetujuan admin. dp_sudah_dibayar/
    // total_sudah_dibayar tetap dicatat sebagai info buat admin (relevan
    // kalau ada dana yang perlu di-refund).
    const alasanFinal = alasan && String(alasan).trim() ? String(alasan).trim() : 'Dibatalkan langsung oleh admin';
    if (!isAdmin || !admin_langsung) {
      if (!alasan || !String(alasan).trim()) {
        return Response.json(
          { error: 'Alasan pembatalan wajib diisi.' },
          { status: 400 }
        );
      }
    }

    // Cegah pengajuan ganda — buat pembatalan whole-booking (jamaah_idx
    // NULL) cukup cek booking_id-nya aja; buat per-jamaah cek kombinasi
    // booking_id+jamaah_idx-nya spesifik (null-safe pakai <=>, biar row
    // whole-booking yang lain gak ikut keblokir).
    const [ada] = await pool.query(
      "SELECT id FROM pembatalan WHERE booking_id = ? AND jamaah_idx <=> ? AND status = 'menunggu'",
      [booking_id, jamaah_idx ?? null]
    );
    if (ada.length > 0) {
      return Response.json({ error: 'Pengajuan pembatalan sedang diproses.' }, { status: 409 });
    }

    const [insertResult] = await pool.query(
      `INSERT INTO pembatalan
       (booking_id, jamaah_idx, user_id, alasan, bukti_path, dp_sudah_dibayar, total_sudah_dibayar, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'menunggu')`,
      [booking_id, jamaah_idx ?? null, b.user_id, alasanFinal, bukti_path || null,
       dpSudahDibayar ? 1 : 0, totalDibayar]
    );
    const pembatalanId = insertResult.insertId;

    // Admin batal langsung — gak usah nunggu, terus eksekusi ke "disetujui"
    // sekarang juga (reuse logika yang sama kayak PATCH approve).
    if (isAdmin && admin_langsung) {
      const hasil = await setujuiPembatalan(pembatalanId, auth.user, { penyebab, refund_nominal, catatan_admin });
      if (hasil.error) return Response.json({ error: hasil.error }, { status: hasil.status });
      return Response.json({
        message: jamaah_idx != null ? 'Jamaah berhasil dibatalkan.' : 'Booking berhasil dibatalkan.',
        langsung: true,
        ...hasil.data,
      }, { status: 201 });
    }

    await pool.query("UPDATE bookings SET status = 'menunggu_batal' WHERE id = ?", [booking_id]);

    await kirimNotifikasiAdmin(pool, {
      tipe: 'pembatalan_baru',
      judul: 'Pengajuan Pembatalan Baru',
      pesan: `Booking ${booking_id} (${b.prog_name || ''}) mengajukan pembatalan, sudah dibayar Rp ${totalDibayar.toLocaleString('id-ID')}.`,
      link: '/admin',
    });

    return Response.json({
      message: 'Pengajuan pembatalan terkirim. Menunggu keputusan admin.',
      langsung: false,
      total_sudah_dibayar: totalDibayar,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/pembatalan gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// Finalisasi 1 pengajuan pembatalan jadi "disetujui" — dipakai DUA jalur:
// (1) PATCH di bawah (admin memutuskan pengajuan yang jamaah kirim), dan
// (2) POST di atas (admin_langsung — booking baru aja diajukan batal SAAT
// ITU JUGA oleh admin, tanpa nunggu). Isinya sama persis kayak sebelumnya,
// cuma ditarik keluar biar gak dobel logic.
async function setujuiPembatalan(id, actorUser, { penyebab, refund_nominal, catatan_admin }) {
  const [rows] = await pool.query('SELECT * FROM pembatalan WHERE id = ?', [id]);
  if (rows.length === 0) {
    return { error: 'Pengajuan tidak ditemukan', status: 404 };
  }
  const p = rows[0];
  if (p.status !== 'menunggu') {
    return { error: 'Pengajuan ini sudah diproses.', status: 400 };
  }

  const totalDibayar = Number(p.total_sudah_dibayar || 0);

  // Program Sahabat Baitullah eksklusif (checkout mandiri, setoran 1jt) TIDAK
  // PERNAH ada refund cash — setoran itu sudah berwujud voucher, dan kalau
  // batal vouchernya dialihfungsikan ke jamaah lain (lepasVoucher di bawah),
  // bukan ditransfer balik. Dikonfirmasi user 2026-09-18.
  const [[progInfo]] = await pool.query(
    `SELECT pr.publish_type FROM bookings b LEFT JOIN programs pr ON pr.id = b.prog_id WHERE b.id = ?`,
    [p.booking_id]
  );
  const sahabatEksklusif = progInfo?.publish_type === 'sahabat_baitullah';

  let nominal;
  if (sahabatEksklusif) {
    nominal = 0;
  } else if (penyebab === 'kesalahan_jm_travel') {
    nominal = totalDibayar;
  } else {
    nominal = Number(refund_nominal || 0);
    if (nominal > totalDibayar) {
      return { error: `Refund tidak boleh melebihi yang sudah dibayar (Rp ${totalDibayar.toLocaleString('id-ID')}).`, status: 400 };
    }
    if (nominal < 0) {
      return { error: 'Refund tidak boleh negatif.', status: 400 };
    }
  }

  const persen = totalDibayar > 0 ? Math.round((nominal / totalDibayar) * 100) : 0;
  // Nominal 0 = tidak ada apa pun yang perlu ditransfer balik, jadi refund
  // langsung 'selesai' (skip tahap upload bukti TF yang cuma relevan kalau
  // beneran ada uang keluar).
  const refundStatusAwal = nominal > 0 ? 'diproses' : 'selesai';
  let progIdSeatDibuka = null;
  let namaJamaahDibatalkan = null; // cuma keisi kalau ini pembatalan per-jamaah

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE pembatalan SET status='disetujui', penyebab=?, refund_nominal=?,
       refund_persen=?, catatan_admin=?, diproses_oleh=?, diproses_at=NOW(),
       refund_status=? WHERE id = ?`,
      [penyebab || 'lainnya', nominal, persen, catatan_admin || null, actorUser.id, refundStatusAwal, id]
    );

    const [bkRows] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [p.booking_id]);
    const bk = bkRows[0];

    if (p.jamaah_idx == null) {
      // ---- Batalkan SELURUH booking (perilaku lama, tidak berubah) ----
      await conn.query("UPDATE bookings SET status = 'dibatalkan' WHERE id = ?", [p.booking_id]);
      if (bk) {
        await conn.query(
          'UPDATE programs SET used_seat = GREATEST(0, used_seat - ?) WHERE id = ?',
          [bk.jumlah_jamaah || 1, bk.prog_id]
        );
        progIdSeatDibuka = bk.prog_id;
        if (bk.voucher_kode) {
          await lepasVoucher(conn, bk.voucher_kode, bk.jumlah_jamaah || 1);
        }
      }
    } else {
      // ---- Batalkan SATU jamaah spesifik di dalam booking ----
      // Entry-nya TETAP di array (bukan di-splice) — index dipakai di banyak
      // tempat lain (perlengkapan_pengiriman, manifest, dst), splice bakal
      // geser index semua orang sesudahnya & bikin referensi lama nyasar.
      // Cukup ditandai status_jamaah='dibatalkan', tempat lain yang baca
      // jamaah_data tinggal skip entry berstatus ini.
      let jd = bk.jamaah_data;
      if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
      const entriesAsli = Array.isArray(jd) ? jd : [];
      const target = entriesAsli[p.jamaah_idx];
      if (!target || target.status_jamaah === 'dibatalkan') {
        throw Object.assign(new Error('Jamaah ini sudah dibatalkan atau tidak ditemukan.'), { status: 400 });
      }
      namaJamaahDibatalkan = target.nama || `Jamaah ke-${p.jamaah_idx + 1}`;

      const entries = entriesAsli.map((e, i) => i === p.jamaah_idx
        ? { ...e, status_jamaah: 'dibatalkan', dibatalkan_at: new Date().toISOString() }
        : e);

      const opsiTotal = Number(bk.opsi_tambahan_total) || 0;
      const sisaAktif = entries.filter(e => e.status_jamaah !== 'dibatalkan').length;

      // Booking yang PERNAH diedit per-orang (invariant all-or-nothing: kalau
      // target-nya eksplisit, semua saudara aktifnya juga eksplisit, lihat
      // src/lib/jamaahHarga.js) — jumlahkan harga_jual presisi tiap orang.
      // harga_jual itu PRE-voucher (snapshot catalog price, sama kayak yang
      // dipakai cetak-formulir), voucher dikurangi SEKALI di sini.
      //
      // Booking yang MASIH SERAGAM (belum pernah diedit per-orang) — pola
      // LAMA dipertahankan PERSIS: rata-ratakan total_harga (udah termasuk
      // potongan voucher) lalu susutkan proporsional sesuai sisa jamaah.
      // SENGAJA tidak disatukan lewat resolveJamaahHarga (yang fallback-nya
      // nambah voucher balik dulu sebelum dirata-rata) — itu bakal geser
      // angka buat booking lama yang belum pernah kesentuh fitur ini, biar
      // 0 regresi buat kasus paling umum.
      const sudahDieditPerOrang = target.paket && target.kamar && target.harga_jual != null;
      let totalHargaBaru;
      if (sudahDieditPerOrang) {
        const voucherNominal = Number(bk.voucher_nominal) || 0;
        const jumlahHargaJual = entries.reduce((s, e) => s + (e.status_jamaah === 'dibatalkan' ? 0 : Number(e.harga_jual) || 0), 0);
        totalHargaBaru = Math.max(0, Math.round(jumlahHargaJual + opsiTotal - voucherNominal));
      } else {
        const jumlahJamaahLama = Number(bk.jumlah_jamaah) || 1;
        const hargaPerJamaahLama = jumlahJamaahLama > 0 ? (Number(bk.total_harga) - opsiTotal) / jumlahJamaahLama : 0;
        totalHargaBaru = Math.round(hargaPerJamaahLama * sisaAktif + opsiTotal);
      }

      // Semua jamaah aktif udah dibatalkan satu-satu — statusnya jadi sama
      // kayak booking dibatalkan utuh. Kalau masih ada sisa, booking TETAP
      // aktif, cuma jumlah_jamaah & total_harga-nya nyusut.
      await conn.query(
        `UPDATE bookings SET jamaah_data = ?, jumlah_jamaah = ?, total_harga = ?, status = ? WHERE id = ?`,
        [JSON.stringify(entries), sisaAktif, totalHargaBaru, sisaAktif === 0 ? 'dibatalkan' : bk.status, p.booking_id]
      );

      await conn.query('UPDATE programs SET used_seat = GREATEST(0, used_seat - 1) WHERE id = ?', [bk.prog_id]);
      progIdSeatDibuka = bk.prog_id;
      if (bk.voucher_kode) {
        await lepasVoucher(conn, bk.voucher_kode, 1);
      }
    }

    await conn.commit();
    conn.release();
  } catch (e) {
    try { await conn.rollback(); } catch {}
    conn.release();
    throw e;
  }

  await kirimNotifikasi(pool, {
    user_id: p.user_id,
    tipe: 'pembatalan_disetujui',
    judul: 'Pembatalan Disetujui',
    pesan: namaJamaahDibatalkan
      ? `Pembatalan ${namaJamaahDibatalkan} pada booking ${p.booking_id} disetujui. Refund Rp ${nominal.toLocaleString('id-ID')} (${persen}%).`
      : `Pembatalan booking ${p.booking_id} disetujui. Refund Rp ${nominal.toLocaleString('id-ID')} (${persen}%).`,
    link: '/dashboard/jamaah',
  });

  // Seat kebuka — kabarin semua yang daftar "Infokan Jika Ada Slot Kosong"
  // buat program ini (lihat migration-program-waitlist.sql), lalu hapus
  // baris waitlist-nya (one-shot, bukan langganan permanen — kalau
  // kehabisan lagi belakangan, harus daftar ulang).
  if (progIdSeatDibuka) {
    const [peminat] = await pool.query(
      'SELECT w.user_id, p.name AS prog_name FROM program_waitlist w JOIN programs p ON p.id = w.program_id WHERE w.program_id = ?',
      [progIdSeatDibuka]
    );
    for (const w of peminat) {
      await kirimNotifikasi(pool, {
        user_id: w.user_id,
        tipe: 'slot_kosong',
        judul: 'Slot Tersedia!',
        pesan: `Slot untuk program "${w.prog_name}" sekarang tersedia — buruan sebelum penuh lagi.`,
        link: `/checkout?prog_id=${progIdSeatDibuka}`,
      });
    }
    if (peminat.length > 0) await pool.query('DELETE FROM program_waitlist WHERE program_id = ?', [progIdSeatDibuka]);
  }

  await catatAudit(pool, {
    actor: actorUser,
    aksi: 'approve_pembatalan',
    target_type: 'pembatalan',
    target_id: id,
    keterangan: `Booking ${p.booking_id}${namaJamaahDibatalkan ? ` — jamaah: ${namaJamaahDibatalkan}` : ''} — refund Rp ${nominal.toLocaleString('id-ID')} (${persen}%)${catatan_admin ? ', catatan: ' + catatan_admin : ''}`,
  });

  return {
    data: {
      refund_nominal: nominal,
      refund_persen: persen,
      catatan: penyebab === 'kesalahan_jm_travel'
        ? 'Kesalahan JM Travel: refund 100% dari total yang sudah dibayar.'
        : 'Refund mengikuti syarat & ketentuan.',
    },
  };
}

// PATCH /api/pembatalan  (ADMIN)
// body: { id, action: 'approve'|'reject', penyebab?, refund_nominal?, catatan_admin? }
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { id, action, penyebab, refund_nominal, catatan_admin } = await request.json();

    if (!id || !action) {
      return Response.json({ error: 'id dan action wajib diisi' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'action harus approve atau reject' }, { status: 400 });
    }

    // ---- DITOLAK: booking kembali aktif ----
    if (action === 'reject') {
      const [rows] = await pool.query('SELECT * FROM pembatalan WHERE id = ?', [id]);
      if (rows.length === 0) {
        return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });
      }
      const p = rows[0];
      if (p.status !== 'menunggu') {
        return Response.json({ error: 'Pengajuan ini sudah diproses.' }, { status: 400 });
      }

      await pool.query(
        `UPDATE pembatalan SET status='ditolak', catatan_admin=?,
         diproses_oleh=?, diproses_at=NOW() WHERE id = ?`,
        [catatan_admin || null, auth.user.id, id]
      );
      await pool.query("UPDATE bookings SET status = 'active' WHERE id = ?", [p.booking_id]);

      await kirimNotifikasi(pool, {
        user_id: p.user_id,
        tipe: 'pembatalan_ditolak',
        judul: 'Pengajuan Pembatalan Ditolak',
        pesan: `Pengajuan pembatalan booking ${p.booking_id} ditolak.${catatan_admin ? ' Catatan: ' + catatan_admin : ''}`,
        link: '/dashboard/jamaah',
      });

      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'reject_pembatalan',
        target_type: 'pembatalan',
        target_id: id,
        keterangan: `Booking ${p.booking_id}${catatan_admin ? ': ' + catatan_admin : ''}`,
      });

      return Response.json({ message: 'Pengajuan ditolak. Booking kembali aktif.' });
    }

    // ---- DISETUJUI ----
    const hasil = await setujuiPembatalan(id, auth.user, { penyebab, refund_nominal, catatan_admin });
    if (hasil.error) return Response.json({ error: hasil.error }, { status: hasil.status });
    return Response.json({ message: 'Pembatalan disetujui.', ...hasil.data });
  } catch (error) {
    console.error('PATCH /api/pembatalan gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
