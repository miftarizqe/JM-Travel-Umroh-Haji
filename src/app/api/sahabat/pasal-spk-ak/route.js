import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/sahabat/pasal-spk-ak — isi pasal SPK-AK (atau varian Non-Muslim
// spk_ak_nonis, dicek dari agama akun) buat layar BACA & SETUJU di /pks,
// LIVE langsung dari dokumen_pasal (dikonfirmasi user 2026-10-03) — BUKAN
// lewat /api/pasal (route itu gak dipakai di prod, Caddy kirim ke Go) & BUKAN
// dari PDF template (iframe PDF gak kebaca di Android/Samsung Browser).
// Cetak fisik SPK-AK TETAP pakai template PDF resmi (/api/sahabat/unduh-spk-ak),
// gak kesentuh — dua sumber ini sengaja beda tujuan (baca vs cetak/tanda tangan).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const [[user]] = await pool.query('SELECT role, agama FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    const dokumen = user.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
    const [pasal] = await pool.query(
      'SELECT nomor, tipe, judul, isi FROM dokumen_pasal WHERE dokumen = ? ORDER BY nomor ASC',
      [dokumen]
    );
    return Response.json({ pasal });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
