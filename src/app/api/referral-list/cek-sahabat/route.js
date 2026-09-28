import pool from '@/lib/db';
import { samarkanNama } from '@/lib/samarkanNama';

/**
 * POST /api/referral-list/cek-sahabat  body: { kode }
 *
 * Cek SATU kode anggota Sahabat Baitullah aktif — kode_unik (mis. SBJM0002)
 * ATAU kode_invite_sahabat (mis. 6X8AEVY, yang tampil di link rekrut Beranda),
 * biar kode mana pun yang dibagikan anggota tetap jalan (2026-09-28) —
 * pengganti GET /api/referral-list?role=sahabat_baitullah yang dulu nge-list
 * nama lengkap SEMUA anggota ke publik (ditutup 2026-09-28, dikonfirmasi
 * user). Nama dibalikin DISAMARKAN karena kode_unik itu sekuensial/gampang
 * ditebak — tanpa ini endpoint bisa dipakai nyedot nama anggota satu-satu.
 *
 * SENGAJA PUBLIK (tanpa login) — dipakai /register (link referral lama
 * berbasis kode_unik) & /checkout (jamaah isi kode Sahabat yang mengajak).
 */
export async function POST(request) {
  try {
    const { kode } = await request.json();
    const kodeTrim = String(kode || '').trim().toUpperCase();
    if (!kodeTrim) return Response.json({ valid: false });

    const [[row]] = await pool.query(
      `SELECT id, name, kode_unik FROM users
       WHERE role = 'sahabat_baitullah' AND status = 'active'
         AND (kode_unik = ? OR kode_invite_sahabat = ?)
       LIMIT 1`,
      [kodeTrim, kodeTrim]
    );
    if (!row) return Response.json({ valid: false });
    return Response.json({ valid: true, id: row.id, nama: samarkanNama(row.name), kode_unik: row.kode_unik });
  } catch (error) {
    console.error('POST /api/referral-list/cek-sahabat gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
