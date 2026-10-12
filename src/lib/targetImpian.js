// Target Impian Sahabat Baitullah yang SUDAH di-checkout (dikonfirmasi user
// 2026-10-12) — begitu akun ini punya booking (gak dibatalkan) di program
// targetnya, program itu diperlakukan kayak program eksklusif biasa: kartu
// "🎯 Progress Tabungan" + tombol "🔄 Ganti Target Impian" di Beranda
// disembunyikan, dan gak lagi disematkan sebagai "Program Impian Anda" di
// /programs. Diturunkan dari bookings (bukan kolom baru), jadi otomatis balik
// jadi target lagi kalau booking-nya dibatalkan.
export async function targetSudahDicheckout(pool, userId, programId) {
  if (!userId || !programId) return false;
  const [[r]] = await pool.query(
    `SELECT 1 AS ada FROM bookings
     WHERE user_id = ? AND prog_id = ? AND status IN ('active','menunggu_batal','selesai') LIMIT 1`,
    [userId, programId]
  );
  return !!r;
}
