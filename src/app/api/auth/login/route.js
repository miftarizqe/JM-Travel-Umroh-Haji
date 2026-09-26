import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ambilJwtSecret, headerCookieToken } from '@/lib/auth';
import { buatLimiter, ipKlien, responsTerlaluBanyak } from '@/lib/rateLimit';
import { varianWA } from '@/lib/validasiAkun';

// Per IP: menghitung SEMUA percobaan (sukses pun), biar penyerang tidak bisa
// memulihkan jatah pakai akun sendiri. Per akun: direset saat login berhasil.
const limitIP = buatLimiter(30, 15 * 60 * 1000);
const limitAkun = buatLimiter(10, 15 * 60 * 1000);

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json({ error: 'Email dan password wajib diisi' }, { status: 400 });
    }

    // Bersihkan spasi yang sering ikut saat copy-paste
    const login = String(email).trim();
    const kunciAkun = login.toLowerCase().slice(0, 128);

    const rIP = limitIP.cek(ipKlien(request));
    if (!rIP.boleh) return responsTerlaluBanyak(rIP.sisaDetik);
    const rAkun = limitAkun.cek(kunciAkun);
    if (!rAkun.boleh) return responsTerlaluBanyak(rAkun.sisaDetik);

    // Login via WA: cocokkan semua format (08…/628…/+628…) karena data lama
    // tersimpan campur. Input berisi '@' dianggap email saja.
    const wa = login.includes('@') ? [] : varianWA(login);
    const [users] = await pool.query(
      `SELECT * FROM users WHERE email = ? OR wa IN (?)`,
      [login, wa.length ? wa : [login]]
    );

    // Varian WA bisa cocok ke >1 akun lama (mis. 08… dan 628… terdaftar
    // terpisah) — pilih yang password-nya cocok.
    let user = null;
    for (const u of users) {
      if (await bcrypt.compare(String(password).trim(), u.password)) { user = u; break; }
    }
    if (!user) {
      return Response.json({ error: 'Email/WA atau password salah' }, { status: 401 });
    }
    limitAkun.reset(kunciAkun);

    // Blokir akun yang dinonaktifkan / ditolak admin
    if (user.status === 'nonaktif') {
      return Response.json(
        { error: 'Akun Anda dinonaktifkan. Hubungi admin JM Travel.' },
        { status: 403 }
      );
    }
    if (user.status === 'rejected') {
      return Response.json(
        { error: 'Pendaftaran Anda ditolak. Hubungi admin JM Travel.' },
        { status: 403 }
      );
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, role_kedua: user.role_kedua || null, name: user.name },
      ambilJwtSecret(),
      { expiresIn: '7d' }
    );

    const dataUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      wa: user.wa,
      nik: user.nik,
      agama: user.agama || null,
      role: user.role,
      role_kedua: user.role_kedua || null,
      kode_unik: user.kode_unik,
      status: user.status,
      wilayah: user.wilayah,
      points: user.points,
      tabungan_bsi: user.tabungan_bsi,
      wajib_ganti_password: !!user.wajib_ganti_password,
    };

    // Cookie di-set oleh SERVER dengan httpOnly:
    // token tidak bisa dibaca/dicuri lewat JavaScript di browser.
    const maxAge = 7 * 24 * 60 * 60; // 7 hari

    return new Response(
      JSON.stringify({ message: 'Login berhasil!', user: dataUser }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': headerCookieToken(token, maxAge),
        },
      }
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
