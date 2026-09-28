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
 *
 * ?role=sahabat_baitullah DITUTUP (2026-09-28, dikonfirmasi user) — dulu
 * nge-list nama lengkap semua anggota Sahabat (jamaah perorangan) ke publik.
 * Sekarang selalu balikin list kosong (biar bundle client lama gak error);
 * pakai POST /api/referral-list/cek-sahabat (cek 1 kode, nama disamarkan).
 * Response key TETAP "perwakilan" apapun role-nya (bukan diganti dinamis)
 * biar caller lama (checkout, daftar-perwakilan) yang belum kirim ?role
 * gak perlu diubah sama sekali.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('role') === 'sahabat_baitullah') return Response.json({ perwakilan: [] });
    const role = 'perwakilan';

    const [perwakilan] = await pool.query(
      `SELECT id, name, kode_unik, wilayah
       FROM users
       WHERE role = ? AND status = 'active'
       ORDER BY name ASC`,
      [role]
    );

    return Response.json({ perwakilan });
  } catch (error) {
    console.error('GET /api/referral-list gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}