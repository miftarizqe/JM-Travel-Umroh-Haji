import pool from '@/lib/db';
import { samarkanNama } from '@/lib/samarkanNama';

/**
 * POST /api/referral-list/cek-perwakilan  body: { kode }
 *
 * Cek SATU kode Perwakilan aktif — kode_unik (mis. PJM0002) ATAU
 * kode_invite_perwakilan (link rekrut admin) — mirror persis
 * cek-sahabat (dikonfirmasi user 2026-10-19: checkout sebelumnya
 * nge-list nama lengkap SEMUA perwakilan ke publik lewat
 * GET /api/referral-list, exposure yang sama yang udah ditutup buat
 * Sahabat Baitullah 2026-09-28, tapi kelewat di sini). Nama dibalikin
 * DISAMARKAN karena kode_unik sekarang bisa berbasis nama (slug) buat
 * agen -- tapi perwakilan masih format sekuensial (PJM####) yang gampang
 * ditebak, exposure nama penuh tetap harus dicegah.
 *
 * SENGAJA PUBLIK (tanpa login) — dipakai /checkout (jamaah isi kode
 * Perwakilan yang mengajak).
 */
export async function POST(request) {
  try {
    const { kode } = await request.json();
    const kodeTrim = String(kode || '').trim().toUpperCase();
    if (!kodeTrim) return Response.json({ valid: false });

    const [[row]] = await pool.query(
      `SELECT id, name, kode_unik FROM users
       WHERE role = 'perwakilan' AND status = 'active'
         AND (kode_unik = ? OR kode_invite_perwakilan = ?)
       LIMIT 1`,
      [kodeTrim, kodeTrim]
    );
    if (!row) return Response.json({ valid: false });
    return Response.json({ valid: true, id: row.id, nama: samarkanNama(row.name), kode_unik: row.kode_unik });
  } catch (error) {
    console.error('POST /api/referral-list/cek-perwakilan gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
