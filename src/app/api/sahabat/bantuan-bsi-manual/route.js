import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// PATCH /api/sahabat/bantuan-bsi-manual — self-service. Gak semua KTP bisa
// daftar Tabungan Umroh via BYOND (dikonfirmasi user 2026-10-03) -- jamaah
// yang kejebak di situ bisa setuju identitasnya diserahkan JM Travel ke
// BSI buat dibukain rekening manual ke cabang. Rekening TETAP KOSONG
// (no_rekening_tabungan_umroh) -- admin isi manual belakangan begitu BSI
// selesai proses (lihat src/app/admin/sahabat/database/page.jsx). Begitu
// disetujui, step "Rekening Tabungan Umroh" di funnel dianggap selesai
// (lihat prasyarat.rekening_umroh_terisi di GET /api/status-pendaftaran-sahabat).
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { setuju } = await request.json();
    if (!setuju) return Response.json({ error: 'Centang persetujuan dulu' }, { status: 400 });

    const [[user]] = await pool.query(
      'SELECT role, no_rekening_tabungan_umroh, bantuan_bsi_manual_disetujui_at FROM users WHERE id = ?',
      [auth.user.id]
    );
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.no_rekening_tabungan_umroh) {
      return Response.json({ error: 'Rekening tabungan umroh sudah diisi, gak perlu bantuan manual lagi' }, { status: 400 });
    }
    if (user.bantuan_bsi_manual_disetujui_at) {
      return Response.json({ message: 'Sudah disetujui sebelumnya.' });
    }

    await pool.query('UPDATE users SET bantuan_bsi_manual_disetujui_at = NOW() WHERE id = ?', [auth.user.id]);
    return Response.json({ message: 'Persetujuan tersimpan. Admin JM Travel akan bantu proses pembuatan rekening ke cabang BSI.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
