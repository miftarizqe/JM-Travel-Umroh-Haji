import pool from '@/lib/db';

// GET /api/metode-pembayaran — PUBLIK, dipakai landing page & halaman
// transaksi (checkout, order-jamaah, pelunasan). Cuma balikin yang aktif.
// GET /api/metode-pembayaran?scope=sahabat — khusus rekening tujuan setoran
// pendaftaran Sahabat Baitullah (Rp1.000.000), beda dari rekening booking
// biasa (dikonfirmasi user 2026-09-03, nanti ada rekening terpisah). Kalau
// belum ada satupun metode yang ditandai admin `khusus_sahabat=1`,
// fallback ke semua metode aktif biar halaman gak kosong sebelum admin
// sempat setting.
//
// PENTING (dikonfirmasi user 2026-09-06): rekening `khusus_sahabat=1`
// keuangannya TERPISAH dari rekening booking biasa — jamaah/closing di
// LUAR pendaftaran Sahabat Baitullah TIDAK BOLEH nge-TF kesini. Makanya
// query umum (non-scope) di bawah WAJIB exclude `khusus_sahabat=1`, biar
// admin bisa nyalain "aktif" (dipakai) di rekening itu TANPA takut dia
// ikut nongol di checkout/booking publik biasa — dua concern ini sengaja
// dipisah (aktif = enabled/dipakai, khusus_sahabat = ruang lingkup mana
// dia boleh ditampilin).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    if (scope === 'sahabat_baitullah') {
      const [khusus] = await pool.query(
        'SELECT id, nama, nomor, atas_nama, catatan, gambar_qr FROM metode_pembayaran WHERE aktif = 1 AND khusus_sahabat = 1 ORDER BY urutan ASC'
      );
      if (khusus.length > 0) return Response.json({ metode: khusus });
    }
    const [rows] = await pool.query(
      'SELECT id, nama, nomor, atas_nama, catatan, gambar_qr FROM metode_pembayaran WHERE aktif = 1 AND khusus_sahabat = 0 ORDER BY urutan ASC'
    );
    return Response.json({ metode: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
