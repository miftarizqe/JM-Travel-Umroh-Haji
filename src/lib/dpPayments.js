// Satu booking sekarang bisa punya LEBIH dari 1 payment type='dp' seumur
// hidupnya — DP awal, DP pax tambahan (lihat src/lib/booking.js#tambahJamaahKeBooking),
// atau DP yang resubmit ulang setelah ditolak admin (lihat POST
// /api/payments?resubmit_dp). Helper ini satu sumber kebenaran buat
// nomorin tiap payment itu "DP 1"/"DP 2"/dst (urutan created_at), dipakai
// bareng di dashboard jamaah & tab Payments admin biar labelnya konsisten
// — jangan hitung ulang beda logic di tempat lain.

/** Ambil semua payment type='dp' buat 1 booking, urut created_at ASC, + nomor urut. */
export async function ambilDpPayments(pool, bookingId) {
  const [rows] = await pool.query(
    `SELECT id, amount, status, reject_reason, created_at FROM payments
     WHERE booking_id = ? AND type = 'dp' ORDER BY created_at ASC`,
    [bookingId]
  );
  return rows.map((r, i) => ({ ...r, urutan: i + 1 }));
}

/** Batch version — buat daftar booking sekaligus (dashboard/list), key = booking_id. */
export async function ambilDpPaymentsBatch(pool, bookingIds) {
  if (!bookingIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT id, booking_id, amount, status, reject_reason, created_at FROM payments
     WHERE booking_id IN (${bookingIds.map(() => '?').join(',')}) AND type = 'dp'
     ORDER BY created_at ASC`,
    bookingIds
  );
  const map = new Map();
  for (const r of rows) {
    const list = map.get(r.booking_id) || [];
    list.push(r);
    map.set(r.booking_id, list);
  }
  for (const [k, list] of map) {
    map.set(k, list.map((r, i) => ({ ...r, urutan: i + 1 })));
  }
  return map;
}

/** DP paling akhir yang statusnya 'rejected' DAN belum ada submission baru sesudahnya — satu-satunya yang perlu di-resubmit. */
export function dpPerluResubmit(dpPayments) {
  if (!dpPayments || dpPayments.length === 0) return null;
  const terakhir = dpPayments[dpPayments.length - 1];
  return terakhir.status === 'rejected' ? terakhir : null;
}
