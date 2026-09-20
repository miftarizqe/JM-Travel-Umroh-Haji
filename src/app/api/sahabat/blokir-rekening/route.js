import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// Jangka waktu blokir SELALU 90 hari (dikonfirmasi user 2026-09-20, sesuai
// isi perjanjian SPK-AK) — bukan lagi input bebas, dihardcode di server
// biar gak bisa dipalsuin lewat body request langsung.
const JANGKA_WAKTU_BLOKIR_HARI = 90;

// PATCH /api/sahabat/blokir-rekening  body: { tanggal_mulai }
// Self-service — anggota sahabat cuma pilih tanggal mulai blokir; nominal
// & jangka waktu SUDAH TIDAK diinput manual lagi (dikonfirmasi user
// 2026-09-20) — nominal_blokir_tabungan diturunkan otomatis dari target
// tabungan (sahabat_pendaftaran.target_estimasi_harga, sudah dikunci sejak
// wizard daftar-sahabat) & jangka waktu tetap 90 hari sesuai perjanjian.
// Dipakai buat isi Surat Pernyataan Kuasa Blokir Rekening (surat_pemblokiran).
// Cuma boleh diisi SEKALI (WHERE nominal_blokir_tabungan IS NULL) — pola
// sama persis /api/sahabat/cif-bsi, biar surat yang sudah
// dibekukan/ditandatangani jangan sampai gak nyambung sama angka yang tercatat.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { tanggal_mulai } = await request.json();
    if (!tanggal_mulai) return Response.json({ error: 'Tanggal mulai blokir wajib diisi' }, { status: 400 });

    const [[user]] = await pool.query('SELECT role, nominal_blokir_tabungan FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.nominal_blokir_tabungan) {
      return Response.json({ error: 'Data blokir sudah diisi sebelumnya. Hubungi admin kalau perlu diubah.' }, { status: 400 });
    }

    const [[pendaftaran]] = await pool.query(
      "SELECT target_estimasi_harga FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [auth.user.id]
    );
    const nominal = Number(pendaftaran?.target_estimasi_harga || 0);
    if (!nominal || nominal <= 0) {
      return Response.json({ error: 'Target Impian belum diisi — lengkapi dulu data diri pendaftaran' }, { status: 400 });
    }

    await pool.query(
      `UPDATE users SET nominal_blokir_tabungan = ?, jangka_waktu_blokir_hari = ?, tanggal_mulai_blokir = ?
       WHERE id = ? AND nominal_blokir_tabungan IS NULL`,
      [nominal, JANGKA_WAKTU_BLOKIR_HARI, tanggal_mulai, auth.user.id]
    );
    return Response.json({ message: 'Data blokir tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
