import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// PATCH /api/sahabat/metode-ttd  body: { metode: 'kantor'|'kirim', tanggal_kunjungan?: 'YYYY-MM-DD' }
// Self-service — jamaah pilih cara TTD fisik ketiga dokumen (SPK-AK, SK-CIF,
// Surat Pemblokiran) SELAMA vendor esign/e-materai belum connect
// (dikonfirmasi user 2026-09-30, lihat src/lib/spkAkFlag.js). 'kantor' wajib
// sertakan tanggal rencana kunjungan (dipakai admin buat nunggu kedatangan);
// 'kirim' gak butuh tanggal, jamaah lanjut ke print-scan-unggah-kirim seperti
// biasa. Boleh ganti pilihan kapan saja SEBELUM dokumen beneran diproses
// (gak ada gate/lock di sini, murni preferensi buat ditampilin ke admin).
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { metode, tanggal_kunjungan } = await request.json();
    if (!['kantor', 'kirim'].includes(metode)) {
      return Response.json({ error: 'Metode harus "kantor" atau "kirim"' }, { status: 400 });
    }
    if (metode === 'kantor' && !tanggal_kunjungan) {
      return Response.json({ error: 'Tanggal rencana kunjungan wajib diisi' }, { status: 400 });
    }

    const [[user]] = await pool.query('SELECT role FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });

    await pool.query(
      'UPDATE users SET metode_ttd_sahabat = ?, rencana_kunjungan_kantor_at = ? WHERE id = ?',
      [metode, metode === 'kantor' ? tanggal_kunjungan : null, auth.user.id]
    );
    return Response.json({ message: 'Pilihan metode TTD tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
