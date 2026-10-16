import { STATUS_BELUM_BERANGKAT_DANA_TERTAHAN } from '@/lib/statusBooking';

/**
 * Total duit jamaah yang SUDAH masuk (payments confirmed) tapi programnya
 * BELUM berangkat — belum boleh dianggap "aman dipakai" buat apapun selain
 * nganter jamaah itu sendiri (dikonfirmasi user 2026-10-16, "jangan pakai
 * dana Rek Utama buat operasional"). Dipakai widget "Cek Dana Jamaah" di
 * /admin/finance/rekening, dibandingin sama saldo rekening Alkhalid.
 *
 * Pakai payments.amount (duit yang BENERAN diterima), bukan
 * bookings.total_harga (kontrak penuh) — booking yang baru bayar DP belum
 * punya pelunasan di rekening sama sekali, jadi total_harga bakal
 * overstate dana yang beneran perlu "dijaga".
 *
 * Program Sahabat Baitullah eksklusif (publish_type='sahabat_baitullah')
 * DIKECUALIKAN — pembayarannya emang sengaja gak pernah masuk rekening
 * Alkhalid sama sekali (lihat catatRekening di /api/payments), jadi gak
 * relevan buat dibandingin ke saldo Alkhalid di sini.
 */
export async function hitungDanaJamaahBelumBerangkat(pool) {
  const [[row]] = await pool.query(
    `SELECT COALESCE(SUM(pm.amount), 0) AS total
     FROM payments pm
     JOIN bookings b ON b.id = pm.booking_id
     LEFT JOIN programs p ON p.id = b.prog_id
     WHERE pm.status = 'confirmed'
       AND b.status IN (${STATUS_BELUM_BERANGKAT_DANA_TERTAHAN.map(() => '?').join(',')})
       AND (p.publish_type IS NULL OR p.publish_type != 'sahabat_baitullah')`,
    STATUS_BELUM_BERANGKAT_DANA_TERTAHAN
  );
  return Number(row.total);
}
