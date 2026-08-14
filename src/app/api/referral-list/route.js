import pool from '@/lib/db';

/**
 * GET /api/referral-list
 *
 * Daftar perwakilan AKTIF untuk dropdown "siapa yang mengajak" /
 * "siapa yang merekrut" di checkout DAN di form registrasi (sebelum login).
 *
 * MASALAH YANG DISELESAIKAN:
 * Checkout dipakai oleh JAMAAH, tapi sebelumnya memanggil
 * /api/admin/users yang sudah dikunci admin-only.
 * Jamaah kena 403 -> daftar perwakilan kosong -> referral_perw_id selalu NULL
 * -> komisi tidak pernah tercatat.
 *
 * SENGAJA PUBLIK (tanpa login): dipakai juga di /register sebelum akun
 * dibuat, jadi belum ada sesi. Endpoint ini hanya mengembalikan data yang
 * aman: nama, kode unik, wilayah. Tanpa NIK, alamat, rekening, atau komisi.
 */
export async function GET(request) {
  try {
    const [perwakilan] = await pool.query(
      `SELECT id, name, kode_unik, wilayah
       FROM users
       WHERE role = 'perwakilan' AND status = 'active'
       ORDER BY name ASC`
    );

    return Response.json({ perwakilan });
  } catch (error) {
    console.error('GET /api/referral-list gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}