import pool from '@/lib/db';

const KOLOM_PER_TIPE = {
  perwakilan: 'kode_invite_perwakilan',
  sahabat: 'kode_invite_sahabat',
};

/**
 * POST /api/referral-list/verify-invite  body: { kode, tipe? }
 *
 * Cek 1 kode undangan rekrut-perwakilan/sahabat-BARU (`tipe` default
 * 'perwakilan' buat backward-compat) — SENGAJA cuma nerima & balikin hasil
 * 1 kode by-value, TIDAK PERNAH nge-list/expose kode siapapun (beda dari
 * /api/referral-list yang memang publik-listable pakai kode_unik). Kalau
 * endpoint ini ikut nge-return daftar kode, gunanya kode acak buat nyegah
 * tebak-tebakan jadi percuma (dikonfirmasi user 2026-09-03).
 *
 * SENGAJA PUBLIK (tanpa login) — dipakai di /register sebelum akun dibuat,
 * sama alasannya kayak /api/referral-list.
 */
export async function POST(request) {
  try {
    const { kode, tipe } = await request.json();
    const kodeTrim = String(kode || '').trim().toUpperCase();
    if (!kodeTrim) {
      return Response.json({ valid: false });
    }
    const role = tipe === 'sahabat_baitullah' ? 'sahabat_baitullah' : 'perwakilan';
    const kolom = KOLOM_PER_TIPE[role];

    const [rows] = await pool.query(
      `SELECT id, name, kode_unik FROM users
       WHERE role = ? AND status = 'active' AND ${kolom} = ?`,
      [role, kodeTrim]
    );
    if (rows.length === 0) {
      return Response.json({ valid: false });
    }
    return Response.json({ valid: true, id: rows[0].id, name: rows[0].name, kode_unik: rows[0].kode_unik });
  } catch (error) {
    console.error('POST /api/referral-list/verify-invite gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
