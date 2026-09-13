import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';

// POST /api/pks  body: { jenis: 'perwakilan'|'jamaah'|'sahabat_baitullah', booking_id? }
// Mencatat persetujuan Perjanjian Kerjasama.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { jenis, booking_id } = await request.json();
    if (!['perwakilan', 'jamaah', 'sahabat_baitullah'].includes(jenis)) {
      return Response.json({ error: 'Jenis PKS tidak dikenal' }, { status: 400 });
    }

    if (jenis === 'jamaah') {
      if (!booking_id) return Response.json({ error: 'booking_id wajib diisi' }, { status: 400 });
      // Pastikan booking milik user ini
      const [b] = await pool.query('SELECT id FROM bookings WHERE id = ? AND user_id = ?', [booking_id, auth.user.id]);
      if (b.length === 0) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });

      await pool.query('UPDATE bookings SET setuju_pks = 1, setuju_pks_at = NOW() WHERE id = ?', [booking_id]);
      await pastikanSnapshot(pool, String(booking_id), 'jamaah');
      return Response.json({ message: 'Persetujuan tercatat.' });
    }

    if (jenis === 'sahabat_baitullah') {
      // Konsep sama dengan perwakilan (persetujuan dicatat di users, role
      // eksklusif jadi kolom setuju_pks aman dipakai bareng) — snapshot pasal
      // SPK-AK dibekukan saat nomor surat pertama kali digenerate (lihat
      // siapkanData('spk_ak') di admin/dokumen-signature/route.js), bukan di
      // sini, karena user boleh centang persetujuan berkali-kali sebelum
      // benar-benar memicu TTD.
      await pool.query('UPDATE users SET setuju_pks = 1, setuju_pks_at = NOW() WHERE id = ?', [auth.user.id]);
      return Response.json({ message: 'Persetujuan tercatat.' });
    }

    // Perwakilan: catat di users, dan di agen_pendaftaran kalau ada
    // (tabel pendaftaran bersama, sekarang khusus role_diajukan='perwakilan').
    await pool.query('UPDATE users SET setuju_pks = 1, setuju_pks_at = NOW() WHERE id = ?', [auth.user.id]);

    try {
      await pool.query(
        'UPDATE agen_pendaftaran SET setuju_pks = 1, setuju_pks_at = NOW() WHERE user_id = ?',
        [auth.user.id]
      );
    } catch { /* belum ada pendaftaran, abaikan */ }

    return Response.json({ message: 'Persetujuan tercatat.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
