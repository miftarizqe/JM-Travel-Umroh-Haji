import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// PATCH /api/sahabat/setuju-sk-cif-pemblokiran  body: {} (tanpa payload)
// Self-service — checkbox "sudah baca & setuju" gabungan buat SK-CIF & Surat
// Pernyataan Kuasa Blokir Rekening (dikonfirmasi user 2026-09-19: satu
// centang buat dua surat, bukan dua checkbox terpisah). Cuma bisa dicentang
// kalau data blokir rekening udah lengkap (dipakai buat merge-field kedua
// surat itu pas dicetak). No. CIF BSI SUDAH DICABUT dari syarat (dikonfirmasi
// user 2026-09-27) — bug ditemukan & diperbaiki 2026-09-28, kelewat pas
// nyabut CIF dari tempat lain, endpoint ini masih nolak kalau gak isi CIF.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[user]] = await pool.query(
      `SELECT role, nominal_blokir_tabungan, jangka_waktu_blokir_hari, tanggal_mulai_blokir
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (!user.nominal_blokir_tabungan || !user.jangka_waktu_blokir_hari || !user.tanggal_mulai_blokir) {
      return Response.json({ error: 'Data blokir rekening belum lengkap' }, { status: 400 });
    }

    await pool.query('UPDATE users SET setuju_sk_cif_pemblokiran_at = NOW() WHERE id = ?', [auth.user.id]);
    return Response.json({ message: 'Persetujuan tercatat.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
