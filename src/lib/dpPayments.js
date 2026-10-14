// Satu booking sekarang bisa punya LEBIH dari 1 payment type='dp' ATAUPUN
// type='lunas' (cicilan pelunasan, dikonfirmasi user 2026-10-14) seumur
// hidupnya — DP awal, DP pax tambahan, DP/pelunasan yang resubmit ulang
// setelah ditolak, atau gelombang cicilan pelunasan berikutnya. Helper ini
// satu sumber kebenaran buat nomorin tiap payment itu "DP 1"/"DP 2"/
// "Lunas 1"/"Lunas 2"/dst (urutan created_at), dipakai bareng di dashboard
// jamaah & tab Payments admin biar labelnya konsisten — jangan hitung ulang
// beda logic di tempat lain.

/** Ambil semua payment type tertentu buat 1 booking, urut created_at ASC, + nomor urut. */
async function ambilPaymentsByJenis(pool, bookingId, jenis) {
  const [rows] = await pool.query(
    `SELECT id, amount, status, reject_reason, created_at FROM payments
     WHERE booking_id = ? AND type = ? ORDER BY created_at ASC`,
    [bookingId, jenis]
  );
  return rows.map((r, i) => ({ ...r, urutan: i + 1 }));
}

/** Batch version — buat daftar booking sekaligus (dashboard/list), key = booking_id. */
async function ambilPaymentsByJenisBatch(pool, bookingIds, jenis) {
  if (!bookingIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT id, booking_id, amount, status, reject_reason, created_at FROM payments
     WHERE booking_id IN (${bookingIds.map(() => '?').join(',')}) AND type = ?
     ORDER BY created_at ASC`,
    [...bookingIds, jenis]
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

/** Payment type tertentu PALING AKHIR yang statusnya 'rejected' DAN belum ada submission baru sesudahnya — satu-satunya yang perlu di-resubmit. */
export function dpPerluResubmit(payments) {
  if (!payments || payments.length === 0) return null;
  const terakhir = payments[payments.length - 1];
  return terakhir.status === 'rejected' ? terakhir : null;
}

export async function ambilDpPayments(pool, bookingId) {
  return ambilPaymentsByJenis(pool, bookingId, 'dp');
}

export async function ambilDpPaymentsBatch(pool, bookingIds) {
  return ambilPaymentsByJenisBatch(pool, bookingIds, 'dp');
}

export async function ambilLunasPayments(pool, bookingId) {
  return ambilPaymentsByJenis(pool, bookingId, 'lunas');
}

export async function ambilLunasPaymentsBatch(pool, bookingIds) {
  return ambilPaymentsByJenisBatch(pool, bookingIds, 'lunas');
}
