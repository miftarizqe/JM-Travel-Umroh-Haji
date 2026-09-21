import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/pks/data — data MILIK SENDIRI (user login) buat preview isi
// perjanjian di /pks sebelum disetujui. BEDA dari /api/admin/cetak-pks/[user_id]
// (admin-only, generate & bekukan nomor surat resmi) — di sini nomor surat
// SENGAJA tidak digenerate, krn user belum tentu jadi disetujui, dan nomor
// resmi baru boleh "dibakar" saat dokumen final beneran dicetak admin.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.nik, u.wa, u.role, u.agama, u.bank, u.no_rekening, u.nama_pemilik_rekening,
              sp.target_minat, sp.target_estimasi_harga
       FROM users u
       LEFT JOIN sahabat_pendaftaran sp ON sp.user_id = u.id
       WHERE u.id = ?`,
      [auth.user.id]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    }
    return Response.json({ user: rows[0] });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
