import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimEmail } from '@/lib/mailer';

// Kode 6 digit
function buatKode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/verifikasi/kirim  body: { metode: 'whatsapp'|'email' }
// Membuat kode & menyimpannya. Email dikirim lewat SMTP (src/lib/mailer.js).
// WhatsApp belum ada penyedia (Fonnte/Twilio) — ditolak di production.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { metode } = await request.json();
    if (!['whatsapp', 'email'].includes(metode)) {
      return Response.json({ error: 'Pilih metode: whatsapp atau email' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT wa, email, terverifikasi FROM users WHERE id = ?', [auth.user.id]);
    if (rows.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    const u = rows[0];

    if (u.terverifikasi) {
      return Response.json({ error: 'Akun sudah terverifikasi' }, { status: 400 });
    }
    if (metode === 'email' && !u.email) {
      return Response.json({ error: 'Email belum diisi di profil Anda' }, { status: 400 });
    }
    if (metode === 'whatsapp' && !u.wa) {
      return Response.json({ error: 'No. WhatsApp belum diisi di profil Anda' }, { status: 400 });
    }

    const kode = buatKode();
    await pool.query(
      `UPDATE users SET verifikasi_metode = ?, verifikasi_kode = ?,
       verifikasi_expired = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?`,
      [metode, kode, auth.user.id]
    );

    const tujuan = metode === 'whatsapp'
      ? String(u.wa).replace(/(\d{4})\d+(\d{3})/, '$1****$2')
      : String(u.email).replace(/(.{2}).*(@.*)/, '$1***$2');

    // dev: kalau pengiriman gagal/belum dikonfigurasi, kode tetap dikembalikan
    // di response (kode_dev) supaya alur tetap bisa diuji tanpa SMTP/WA asli.
    const dev = process.env.NODE_ENV !== 'production';

    if (metode === 'email') {
      try {
        await kirimEmail(
          u.email,
          'Kode verifikasi JM Travel',
          `Kode verifikasi akun Anda: ${kode}\n\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun.`
        );
      } catch (err) {
        console.error('[verifikasi] gagal kirim email:', err.message);
        // Produksi: jangan bilang "terkirim" padahal enggak — SMTP belum
        // dikonfigurasi atau server SMTP menolak.
        if (!dev) {
          return Response.json(
            { error: 'Gagal mengirim email verifikasi. Coba lagi nanti atau hubungi admin.' },
            { status: 502 }
          );
        }
      }
    } else if (metode === 'whatsapp' && !dev) {
      // Belum ada penyedia WA (Fonnte/Twilio) terpasang — di produksi jangan
      // pura-pura terkirim, kodenya memang tidak sampai ke mana pun.
      return Response.json(
        { error: 'Verifikasi via WhatsApp belum tersedia. Gunakan email dulu.' },
        { status: 503 }
      );
    }

    return Response.json({
      message: `Kode verifikasi dikirim via ${metode} ke ${tujuan}`,
      tujuan,
      berlaku_menit: 10,
      ...(dev ? { kode_dev: kode } : {}),
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/verifikasi/kirim  body: { kode }
// Memverifikasi kode yang dimasukkan user.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { kode } = await request.json();
    if (!kode) return Response.json({ error: 'Kode wajib diisi' }, { status: 400 });

    const [rows] = await pool.query(
      'SELECT verifikasi_kode, verifikasi_expired, terverifikasi FROM users WHERE id = ?',
      [auth.user.id]
    );
    if (rows.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    const u = rows[0];

    if (u.terverifikasi) return Response.json({ message: 'Akun sudah terverifikasi' });
    if (!u.verifikasi_kode) return Response.json({ error: 'Belum ada kode. Kirim ulang.' }, { status: 400 });
    if (u.verifikasi_expired && new Date(u.verifikasi_expired) < new Date()) {
      return Response.json({ error: 'Kode kedaluwarsa. Kirim ulang.' }, { status: 400 });
    }
    if (String(kode).trim() !== String(u.verifikasi_kode)) {
      return Response.json({ error: 'Kode salah' }, { status: 400 });
    }

    await pool.query(
      'UPDATE users SET terverifikasi = 1, verifikasi_kode = NULL, verifikasi_expired = NULL WHERE id = ?',
      [auth.user.id]
    );

    return Response.json({ message: 'Akun berhasil diverifikasi!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
