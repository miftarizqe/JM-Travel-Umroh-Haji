import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/vouchers/saya
// Daftar voucher yang bisa dipakai & TERLIHAT buat akun yang login sekarang:
// aktif, kuota jamaah masih ada, belum kedaluwarsa, `tampil=1` (voucher
// search-only/`tampil=0` sengaja TIDAK pernah muncul di sini buat siapa pun —
// itu cuma bisa dipakai kalau ketik kode manual di checkout, lihat
// src/app/admin/page.jsx tab Voucher), dan sesuai akses_role (publik / role
// akun ini / akun ini persis kalau akses_role='akun').
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT v.kode, v.potongan, v.kuota, v.terpakai, v.valid_until, v.catatan,
              v.for_user, v.akses_role, v.prog_id, p.name AS prog_name
       FROM vouchers v
       LEFT JOIN programs p ON p.id = v.prog_id
       WHERE v.aktif = 1
         AND v.tampil = 1
         AND (v.kuota IS NULL OR v.terpakai < v.kuota)
         AND (v.valid_until IS NULL OR v.valid_until >= CURDATE())
         AND (
           v.akses_role = 'publik'
           OR (v.akses_role = 'perwakilan' AND ? = 'perwakilan')
           OR (v.akses_role = 'akun' AND v.for_user = ?)
         )
       ORDER BY v.akses_role = 'publik' DESC, v.created_at DESC`,
      [auth.user.role, auth.user.id]
    );

    const vouchers = rows.map(v => ({
      kode: v.kode,
      potongan: Number(v.potongan || 0),
      valid_until: v.valid_until,
      catatan: v.catatan,
      khusus_untuk_saya: v.akses_role === 'akun',
      akses_role: v.akses_role,
      sisa_kuota: v.kuota != null ? Number(v.kuota) - Number(v.terpakai || 0) : null,
      prog_id: v.prog_id,
      prog_name: v.prog_name,
    }));

    return Response.json({ vouchers });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
