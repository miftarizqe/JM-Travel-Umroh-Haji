import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// PATCH /api/sahabat/blokir-rekening  body: { nominal_blokir, jangka_waktu_hari, tanggal_mulai }
// Self-service — anggota sahabat isi nominal/jangka waktu/tanggal mulai
// blokir rekening tabungan umroh mereka sendiri, dipakai buat isi Surat
// Pernyataan Kuasa Blokir Rekening (surat_pemblokiran). Cuma boleh diisi
// SEKALI (WHERE nominal_blokir_tabungan IS NULL) — pola sama persis
// /api/sahabat/cif-bsi, biar surat yang sudah dibekukan/ditandatangani
// jangan sampai gak nyambung sama angka yang tercatat.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { nominal_blokir, jangka_waktu_hari, tanggal_mulai } = await request.json();
    const nominal = Number(nominal_blokir);
    const jangkaWaktu = Number(jangka_waktu_hari);
    if (!nominal || nominal <= 0) return Response.json({ error: 'Nominal blokir wajib diisi' }, { status: 400 });
    if (!jangkaWaktu || jangkaWaktu <= 0) return Response.json({ error: 'Jangka waktu blokir wajib diisi' }, { status: 400 });
    if (!tanggal_mulai) return Response.json({ error: 'Tanggal mulai blokir wajib diisi' }, { status: 400 });

    const [[user]] = await pool.query('SELECT role, nominal_blokir_tabungan FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.nominal_blokir_tabungan) {
      return Response.json({ error: 'Data blokir sudah diisi sebelumnya. Hubungi admin kalau perlu diubah.' }, { status: 400 });
    }

    await pool.query(
      `UPDATE users SET nominal_blokir_tabungan = ?, jangka_waktu_blokir_hari = ?, tanggal_mulai_blokir = ?
       WHERE id = ? AND nominal_blokir_tabungan IS NULL`,
      [nominal, jangkaWaktu, tanggal_mulai, auth.user.id]
    );
    return Response.json({ message: 'Data blokir tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
