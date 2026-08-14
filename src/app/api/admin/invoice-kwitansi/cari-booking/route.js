import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET ?q=... — cari booking by Booking ID, nama pemesan, ATAU nama jamaah
// (jamaah_data di-LIKE apa adanya sbg teks JSON — cukup buat pencarian
// kasar, gak perlu JSON path query). Dipakai section "Generate dari Booking"
// di halaman invoice-kwitansi biar bisa cari pake nama, bukan cuma ID persis.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    if (!q) return Response.json({ bookings: [] });

    const like = `%${q}%`;
    // Ikut sertakan jamaah_data (buat ditampilin nama jamaahnya), tanggal
    // keberangkatan (dari programs), sama nama referral/perwakilan — biar admin
    // bisa MAKE SURE ini booking yang bener sebelum generate Invoice/Kwitansi,
    // bukan cuma nebak dari nama pemesan + booking ID doang.
    const [rows] = await pool.query(
      `SELECT b.id, b.prog_name, b.dp_status, b.pelunasan_status, b.total_harga, b.dp_amount,
              b.jumlah_jamaah, b.jamaah_data,
              p.tanggal_berangkat, u.name AS pemesan_nama, ref.name AS referral_nama
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN programs p ON p.id = b.prog_id
       LEFT JOIN users ref ON ref.id = b.referral_perw_id
       WHERE b.id LIKE ? OR u.name LIKE ? OR b.jamaah_data LIKE ?
       ORDER BY b.created_at DESC LIMIT 20`,
      [like, like, like]
    );

    // SEMUA pembayaran yang BENERAN udah confirmed (DP, cicilan, pelunasan —
    // bukan cuma DP doang), urut dari yang paling awal — biar admin bisa liat
    // histori "pembayaran ke-1/2/3 tanggal berapa, berapa duit" tanpa nebak2
    // nominal invoice yang mau digenerate berikutnya.
    let pembayaranPerBooking = {};
    if (rows.length > 0) {
      const [payRows] = await pool.query(
        `SELECT booking_id, type, amount, created_at FROM payments
         WHERE booking_id IN (?) AND status = 'confirmed'
         ORDER BY created_at ASC`,
        [rows.map(r => r.id)]
      );
      for (const p of payRows) {
        if (!pembayaranPerBooking[p.booking_id]) pembayaranPerBooking[p.booking_id] = [];
        pembayaranPerBooking[p.booking_id].push({ type: p.type, amount: p.amount, tanggal: p.created_at });
      }
    }

    const bookings = rows.map(b => {
      let jamaahNama = [];
      try {
        const parsed = typeof b.jamaah_data === 'string' ? JSON.parse(b.jamaah_data || '[]') : b.jamaah_data;
        jamaahNama = (Array.isArray(parsed) ? parsed : []).map(j => j.nama).filter(Boolean);
      } catch { jamaahNama = []; }
      return { ...b, jamaah_data: undefined, jamaah_nama: jamaahNama, pembayaran: pembayaranPerBooking[b.id] || [] };
    });
    return Response.json({ bookings });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
