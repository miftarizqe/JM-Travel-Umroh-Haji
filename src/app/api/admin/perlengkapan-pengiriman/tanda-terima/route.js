import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { ambilItemDikirimJamaah } from '@/lib/perlengkapan';

// GET /api/admin/perlengkapan-pengiriman/tanda-terima?booking_id=&idx=
// Data buat halaman cetak Tanda Terima Perlengkapan — nama jamaah, program,
// daftar item yang BENERAN dikirim (dibaca dari ledger, lihat
// ambilItemDikirimJamaah), tanggal kirim.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    const idx = Number(searchParams.get('idx'));
    if (!bookingId || Number.isNaN(idx)) {
      return Response.json({ error: 'booking_id dan idx wajib diisi' }, { status: 400 });
    }

    const [[b]] = await pool.query('SELECT id, prog_name, jamaah_data, user_id FROM bookings WHERE id = ?', [bookingId]);
    if (!b) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    const [[pemesan]] = await pool.query('SELECT name FROM users WHERE id = ?', [b.user_id]);

    let jd = b.jamaah_data;
    if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
    const jamaah = Array.isArray(jd) ? jd[idx] : null;
    if (!jamaah) return Response.json({ error: 'Jamaah tidak ditemukan pada booking ini' }, { status: 404 });

    const [[pengiriman]] = await pool.query(
      'SELECT dikirim_at FROM perlengkapan_pengiriman WHERE booking_id = ? AND jamaah_idx = ?',
      [bookingId, idx]
    );
    const items = await ambilItemDikirimJamaah(pool, { bookingId, jamaahIdx: idx });

    return Response.json({
      booking_id: bookingId,
      idx,
      prog_name: b.prog_name,
      pemesan_nama: pemesan?.name || '-',
      nama: jamaah.nama || '-',
      alamat_kirim: jamaah.alamat_kirim || null,
      dikirim_at: pengiriman?.dikirim_at || null,
      items,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
