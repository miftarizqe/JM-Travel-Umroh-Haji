import { parseJamaahData, DOC_KEYS } from '@/lib/dokumenPendukung';
import { ambilDpPaymentsBatch, dpPerluResubmit } from '@/lib/dpPayments';

// Daftar tindakan yang masih harus dibereskan pemilik booking — SATU sumber
// buat badge "Booking Saya" di sidebar jamaah & Sahabat Baitullah (lihat
// hitungBookingPerluTindakan di bawah) DAN badge per kartu "📦 Booking Aktif"
// di /dashboard/jamaah (dikonfirmasi user 2026-10-12). Pure function (aman
// dipakai client), `b` = baris bookings + `prog_publish_type` +
// `status_lunas_terakhir` (status payments type='lunas' terbaru) +
// `dp_payments` (array dari src/lib/dpPayments.js). Kriteria:
//   - formulir jamaah belum lengkap (bisa diisi sejak DP masih menunggu)
//   - formulir lengkap + DP confirmed tapi Perjanjian Jamaah belum disetujui
//     (bukan program eksklusif Sahabat — gak punya tahap perjanjian, lihat
//     perjanjianSelesai() di bookingStage.js)
//   - ada dokumen pendukung yang DITOLAK admin (perlu diganti)
//   - pembayaran pelunasan terakhir DITOLAK admin (perlu kirim ulang)
//   - DP (wave manapun) DITOLAK admin & belum ada submission baru (perlu
//     upload ulang lewat /bayar-dp, dikonfirmasi user 2026-10-14 — dulu
//     sengaja gak dihitung karena belum ada jalur unggah ulangnya).
export function alasanPerluTindakan(b) {
  if (!b || b.status !== 'active') return [];
  // Lunas = data & dokumen dikunci (dikonfirmasi user 2026-10-12), gak ada
  // lagi yang bisa ditindaklanjuti pemilik booking.
  if (b.pelunasan_status === 'paid') return [];
  const alasan = [];
  if (b.form_filled < b.form_total) alasan.push('Formulir jamaah belum lengkap');
  if (b.dp_status === 'confirmed' && b.form_filled >= b.form_total && !b.setuju_pks
      && !b.perjanjian_scan_path && b.prog_publish_type !== 'sahabat_baitullah') {
    alasan.push('Perjanjian Jamaah belum disetujui');
  }
  if (parseJamaahData(b.jamaah_data).some(j =>
    DOC_KEYS.some(k => j?.[k] && j.doc_status?.[k]?.status === 'ditolak'))) {
    alasan.push('Dokumen ditolak, perlu diganti');
  }
  if (b.pelunasan_status === 'unpaid' && b.status_lunas_terakhir === 'rejected') {
    alasan.push('Pelunasan ditolak, kirim ulang');
  }
  if (dpPerluResubmit(b.dp_payments)) {
    alasan.push('DP ditolak, upload bukti baru');
  }
  return alasan;
}

// Subquery status pelunasan terakhir — dipakai bareng di sini & GET
// /api/bookings biar alasanPerluTindakan() dapet field yang sama.
export const SQL_STATUS_LUNAS_TERAKHIR =
  `(SELECT py.status FROM payments py WHERE py.booking_id = b.id AND py.type = 'lunas'
    ORDER BY py.created_at DESC LIMIT 1) AS status_lunas_terakhir`;

// Jumlah booking (milik sendiri ATAU yang di-order-in akun ini) yang masih
// punya tindakan — 1 booking dihitung 1 walau tindakannya lebih dari satu.
export async function hitungBookingPerluTindakan(pool, userId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.status, b.form_filled, b.form_total, b.dp_status, b.setuju_pks, b.perjanjian_scan_path,
            b.pelunasan_status, b.jamaah_data, p.publish_type AS prog_publish_type,
            ${SQL_STATUS_LUNAS_TERAKHIR}
     FROM bookings b
     LEFT JOIN programs p ON p.id = b.prog_id
     WHERE (b.user_id = ? OR b.ordered_by = ?) AND b.status = 'active'`,
    [userId, userId]
  );
  const dpMap = await ambilDpPaymentsBatch(pool, rows.map(r => r.id));
  for (const r of rows) r.dp_payments = dpMap.get(r.id) || [];
  return rows.filter(b => alasanPerluTindakan(b).length > 0).length;
}
