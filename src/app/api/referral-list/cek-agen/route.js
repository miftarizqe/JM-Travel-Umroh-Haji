import pool from '@/lib/db';
import { samarkanNama } from '@/lib/samarkanNama';

/**
 * POST /api/referral-list/cek-agen  body: { kode }
 *
 * Cek SATU kode akun agen aktif (kode_unik, sekarang berbasis slug nama
 * — mis. "ida-kuraeny", dikonfirmasi user 2026-10-19) — mirror persis
 * cek-sahabat/cek-perwakilan. Fallback MANUAL "Sumber Informasi: Agen"
 * di checkout (dikonfirmasi user 2026-10-19) SENGAJA gak nge-list semua
 * nama agen ke publik lewat GET /api/referral-list?role=agen lagi — satu
 * per satu doang, nama disamarkan.
 *
 * SENGAJA PUBLIK (tanpa login) — dipakai /checkout (jamaah isi kode
 * agen yang mengajak, fallback kalau tag localStorage dari link /a/[kode]
 * udah ilang).
 */
export async function POST(request) {
  try {
    const { kode } = await request.json();
    const kodeTrim = String(kode || '').trim().toLowerCase();
    if (!kodeTrim) return Response.json({ valid: false });

    const [[row]] = await pool.query(
      `SELECT id, name, kode_unik FROM users
       WHERE role = 'agen' AND status = 'active' AND kode_unik = ?
       LIMIT 1`,
      [kodeTrim]
    );
    if (!row) return Response.json({ valid: false });
    return Response.json({ valid: true, id: row.id, nama: samarkanNama(row.name), kode_unik: row.kode_unik });
  } catch (error) {
    console.error('POST /api/referral-list/cek-agen gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
