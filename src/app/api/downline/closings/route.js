import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';
import { apakahDalamJaringan } from '@/lib/jaringan';

// GET /api/downline/closings?user_id=xxx&target_id=yyy
// Dipanggil dari dashboard perwakilan: lihat closing booking milik
// seseorang di jaringan downline mereka (langsung ATAU berjenjang), plus
// downline_target sendiri untuk drill-down lebih dalam.
//
// SENGAJA cuma ambil field ringkasan booking (bukan jamaah_data) — data
// pribadi jamaah customer milik downline BUKAN urusan upline-nya.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const targetId = searchParams.get('target_id');
    if (!userId || !targetId) {
      return Response.json({ error: 'user_id dan target_id wajib diisi' }, { status: 400 });
    }

    const auth = wajibPemilikAtauAdmin(request, userId);
    if (auth.error) return auth.error;

    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    if (!isAdmin) {
      const boleh = await apakahDalamJaringan(pool, userId, targetId);
      if (!boleh) {
        return Response.json({ error: 'Orang ini bukan bagian dari jaringan downline Anda.' }, { status: 403 });
      }
    }

    const [targetRows] = await pool.query(
      'SELECT id, name, kode_unik, role, status FROM users WHERE id = ?',
      [targetId]
    );
    if (targetRows.length === 0) {
      return Response.json({ error: 'Downline tidak ditemukan' }, { status: 404 });
    }
    const target = targetRows[0];

    const [bookings] = await pool.query(
      `SELECT id, prog_name, paket, kamar, jumlah_jamaah, dp_status, pelunasan_status, status, created_at
       FROM bookings WHERE referral_perw_id = ?
       ORDER BY created_at DESC`,
      [targetId]
    );

    const [komisiRows] = await pool.query(
      `SELECT booking_id, jenis, nominal FROM komisi_ledger
       WHERE penerima_id = ? AND booking_id IN (${bookings.map(() => '?').join(',') || 'NULL'})`,
      [userId, ...bookings.map(b => b.id)]
    );
    const komisiPerBooking = {};
    for (const k of komisiRows) {
      if (!komisiPerBooking[k.booking_id]) komisiPerBooking[k.booking_id] = [];
      komisiPerBooking[k.booking_id].push({ jenis: k.jenis, nominal: Number(k.nominal) });
    }

    const closings = bookings.map(b => {
      const komisiSaya = komisiPerBooking[b.id] || [];
      return {
        ...b,
        komisi_saya: komisiSaya,
        total_komisi_saya: komisiSaya.reduce((s, k) => s + k.nominal, 0),
      };
    });

    const [downlineTarget] = await pool.query(
      `SELECT id, name, kode_unik, role, status
       FROM users WHERE perekrut_id = ? AND role = 'perwakilan'
       ORDER BY created_at DESC`,
      [targetId]
    );

    return Response.json({ target, closings, downline_target: downlineTarget });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
