// Sisa yang HARUS dibayar buat booking lunas total — dihitung dari total
// harga dikurangi DP, dikurangi lagi SEMUA pembayaran type='lunas' yang
// udah confirmed (cicilan, dikonfirmasi user 2026-10-14 — sebelumnya
// sistem anggap 1x bayar 'lunas' = langsung lunas total, gak ada jalur
// bayar sebagian). SATU sumber kebenaran dipakai bareng POST /api/payments
// (validasi nominal cicilan gak boleh ngelebihin sisa), PATCH /api/payments
// (nentuin cicilan ini BENERAN nutup sisa apa belum), & /pelunasan (nampilin
// sisa ke jamaah) — jangan hitung ulang beda logic di tempat lain.
export async function hitungSisaBayar(pool, bookingId) {
  const [[b]] = await pool.query('SELECT total_harga, dp_amount FROM bookings WHERE id = ?', [bookingId]);
  if (!b) return 0;
  const [[sudah]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE booking_id = ? AND type = 'lunas' AND status = 'confirmed'`,
    [bookingId]
  );
  const sisa = Number(b.total_harga || 0) - Number(b.dp_amount || 0) - Number(sudah.total || 0);
  return Math.max(0, sisa);
}
