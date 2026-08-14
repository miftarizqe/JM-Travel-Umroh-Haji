import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json({ error: 'Email dan password wajib diisi' }, { status: 400 });
    }

    // Bersihkan spasi yang sering ikut saat copy-paste
    const login = String(email).trim();

    const [users] = await pool.query(
      'SELECT * FROM users WHERE email=? OR wa=?',
      [login, login]
    );

    if (users.length === 0) {
      return Response.json({ error: 'Email/WA atau password salah' }, { status: 401 });
    }

    const user = users[0];

    const valid = await bcrypt.compare(String(password).trim(), user.password);
    if (!valid) {
      return Response.json({ error: 'Email/WA atau password salah' }, { status: 401 });
    }

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
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const dataUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      wa: user.wa,
      nik: user.nik,
      role: user.role,
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
    const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';

    return new Response(
      JSON.stringify({ message: 'Login berhasil!', user: dataUser }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `token=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax;${secure}`,
        },
      }
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
