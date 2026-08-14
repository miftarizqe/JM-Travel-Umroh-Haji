import pool from '@/lib/db';
import { wajibLogin, wajibRole } from '@/lib/auth';
import { kirimNotifikasi, kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';

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

// POST /api/pembatalan   body: { booking_id, alasan, bukti_path? }
// Admin/super_admin bisa langsung eksekusi pembatalan (bypass antrian
// "menunggu" persetujuan) dengan kirim admin_langsung: true + penyebab/
// refund_nominal/catatan_admin sekalian — dipakai buat jamaah yang telepon/
// dateng langsung minta batal, staff kantor gak perlu suruh jamaahnya login
// & ngajuin sendiri dulu (dikonfirmasi user 2026-07-28).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { booking_id, alasan, bukti_path, admin_langsung, penyebab, refund_nominal, catatan_admin } = await request.json();
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';

    if (!booking_id) {
      return Response.json({ error: 'booking_id wajib diisi' }, { status: 400 });
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

    // Total yang sudah benar-benar dibayar (pembayaran terkonfirmasi)
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

    // Cegah pengajuan ganda
    const [ada] = await pool.query(
      "SELECT id FROM pembatalan WHERE booking_id = ? AND status = 'menunggu'",
      [booking_id]
    );
    if (ada.length > 0) {
      return Response.json({ error: 'Pengajuan pembatalan sedang diproses.' }, { status: 409 });
    }

    const [insertResult] = await pool.query(
      `INSERT INTO pembatalan
       (booking_id, user_id, alasan, bukti_path, dp_sudah_dibayar, total_sudah_dibayar, status)
       VALUES (?, ?, ?, ?, ?, ?, 'menunggu')`,
      [booking_id, b.user_id, alasanFinal, bukti_path || null,
       dpSudahDibayar ? 1 : 0, totalDibayar]
    );
    const pembatalanId = insertResult.insertId;

    // Admin batal langsung — gak usah nunggu, terus eksekusi ke "disetujui"
    // sekarang juga (reuse logika yang sama kayak PATCH approve).
    if (isAdmin && admin_langsung) {
      const hasil = await setujuiPembatalan(pembatalanId, auth.user, { penyebab, refund_nominal, catatan_admin });
      if (hasil.error) return Response.json({ error: hasil.error }, { status: hasil.status });
      return Response.json({
        message: 'Booking berhasil dibatalkan.',
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
  let nominal;
  if (penyebab === 'kesalahan_jm_travel') {
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
  let progIdSeatDibuka = null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE pembatalan SET status='disetujui', penyebab=?, refund_nominal=?,
       refund_persen=?, catatan_admin=?, diproses_oleh=?, diproses_at=NOW(),
       refund_status='diproses' WHERE id = ?`,
      [penyebab || 'lainnya', nominal, persen, catatan_admin || null, actorUser.id, id]
    );

    await conn.query("UPDATE bookings SET status = 'dibatalkan' WHERE id = ?", [p.booking_id]);

    // Kembalikan kuota seat
    const [bk] = await conn.query('SELECT prog_id, jumlah_jamaah FROM bookings WHERE id = ?', [p.booking_id]);
    if (bk.length) {
      await conn.query(
        'UPDATE programs SET used_seat = GREATEST(0, used_seat - ?) WHERE id = ?',
        [bk[0].jumlah_jamaah || 1, bk[0].prog_id]
      );
      progIdSeatDibuka = bk[0].prog_id;
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
    pesan: `Pembatalan booking ${p.booking_id} disetujui. Refund Rp ${nominal.toLocaleString('id-ID')} (${persen}%).`,
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
    keterangan: `Booking ${p.booking_id} — refund Rp ${nominal.toLocaleString('id-ID')} (${persen}%)${catatan_admin ? ', catatan: ' + catatan_admin : ''}`,
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
