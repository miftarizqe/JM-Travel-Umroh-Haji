// Dana yang masih bisa direfund dari 1 booking — dipakai bareng sama
// eksekusi pembatalan (batas atas refund, /api/pembatalan) dan modal detail
// booking admin (info buat admin sebelum isi nominal), biar angka yang
// dilihat admin = angka yang divalidasi server.
//
// totalDibayar  = payment confirmed (uang yang BENERAN masuk), dihitung live.
// sudahDirefund = refund pembatalan yang udah disetujui sebelumnya di booking
//                 yang sama (batal per-jamaah bisa berkali-kali).
// kecualiPembatalanId: baris pembatalan yang lagi dieksekusi, jangan ikut
//                 dihitung sebagai "sudah direfund".
export async function infoDanaRefund(db, bookingId, kecualiPembatalanId = null) {
  const [[bayar]] = await db.query(
    "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE booking_id = ? AND status = 'confirmed'",
    [bookingId]
  );
  const [[sudah]] = await db.query(
    "SELECT COALESCE(SUM(refund_nominal),0) AS total FROM pembatalan WHERE booking_id = ? AND status = 'disetujui' AND id <> ?",
    [bookingId, kecualiPembatalanId ?? 0]
  );
  const totalDibayar = Number(bayar.total || 0);
  const sudahDirefund = Number(sudah.total || 0);
  return { totalDibayar, sudahDirefund, sisaBisaDirefund: Math.max(0, totalDibayar - sudahDirefund) };
}
