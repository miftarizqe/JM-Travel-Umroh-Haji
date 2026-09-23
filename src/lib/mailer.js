// Klien SMTP generik buat kirim email (kode verifikasi, dst). Nama env var
// SENGAJA disamakan dengan mailer backend Go (SMTP_HOST/PORT/USER/PASSWORD/
// FROM/FROM_NAME/SECURITY) — satu kredensial SMTP bisa dipakai bareng dua
// aplikasi. Lihat internal/platform/mailer di repo jm-travel-api.
//
// SMTP_SECURITY: 'starttls' (default, port 587), 'tls' (port 465), atau
// 'none' (tanpa enkripsi — cuma buat server lokal/dev, mis. Mailpit).
import nodemailer from 'nodemailer';

const PORT_DEFAULT = { starttls: 587, tls: 465, none: 25 };

let transporter;

export function emailTerkonfigurasi() {
  return Boolean(process.env.SMTP_HOST);
}

function buatTransporter() {
  const security = process.env.SMTP_SECURITY || 'starttls';
  if (!(security in PORT_DEFAULT)) {
    throw new Error(`SMTP_SECURITY "${security}" tidak dikenal (starttls, tls, atau none)`);
  }
  const port = Number(process.env.SMTP_PORT) || PORT_DEFAULT[security];

  const opts = {
    host: process.env.SMTP_HOST,
    port,
    secure: security === 'tls', // TLS sejak awal koneksi (port 465)
    // 'starttls' WAJIB upgrade ke TLS — kalau server gak nawarin, nodemailer
    // gagal terang-terangan daripada diam-diam kirim kredensial+kode polos.
    requireTLS: security === 'starttls',
  };
  if (process.env.SMTP_USER) {
    opts.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD };
  }
  return nodemailer.createTransport(opts);
}

// Lempar error kalau SMTP belum dikonfigurasi — pemanggil yang menentukan
// fallback-nya (mis. kode_dev di mode development), bukan pura-pura berhasil.
export async function kirimEmail(to, subject, text) {
  if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST belum dikonfigurasi');
  if (!process.env.SMTP_FROM) throw new Error('SMTP_FROM belum dikonfigurasi');

  if (!transporter) transporter = buatTransporter();

  const from = process.env.SMTP_FROM_NAME
    ? `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM}>`
    : process.env.SMTP_FROM;

  await transporter.sendMail({ from, to, subject, text });
}
