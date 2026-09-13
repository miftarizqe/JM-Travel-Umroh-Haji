import pool from '@/lib/db';
import jwt from 'jsonwebtoken';
import { wajibLogin } from '@/lib/auth';

// Ganti "mode" sesi aktif buat akun dual-role (perwakilan + sahabat) —
// JWT/session tetap cuma bawa SATU role aktif, ditukar di sini. Selalu
// ambil ULANG role & role_kedua dari DB (jangan percaya token lama) biar
// gak bisa dipalsuin lewat body request.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { ke } = await request.json();
    if (!['perwakilan', 'sahabat_baitullah'].includes(ke)) {
      return Response.json({ error: 'Tujuan role tidak valid' }, { status: 400 });
    }

    const [rows] = await pool.query(
      'SELECT id, name, email, wa, nik, role, role_kedua, kode_unik, status, wilayah, points, tabungan_bsi, wajib_ganti_password FROM users WHERE id = ?',
      [auth.user.id]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }
    const user = rows[0];

    if (ke !== user.role && ke !== user.role_kedua) {
      return Response.json({ error: 'Akun ini tidak punya role tersebut' }, { status: 403 });
    }
    if (ke === user.role) {
      return Response.json({ error: 'Sudah berada di mode ini' }, { status: 400 });
    }

    // Tukar posisi: role aktif baru jadi `ke`, role_kedua jadi role lama.
    const roleBaru = ke;
    const roleKeduaBaru = user.role;

    const token = jwt.sign(
      { id: user.id, role: roleBaru, role_kedua: roleKeduaBaru, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const dataUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      wa: user.wa,
      nik: user.nik,
      role: roleBaru,
      role_kedua: roleKeduaBaru,
      kode_unik: user.kode_unik,
      status: user.status,
      wilayah: user.wilayah,
      points: user.points,
      tabungan_bsi: user.tabungan_bsi,
      wajib_ganti_password: !!user.wajib_ganti_password,
    };

    const maxAge = 7 * 24 * 60 * 60;
    const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';

    return new Response(
      JSON.stringify({ message: 'Mode berhasil diganti.', user: dataUser }),
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
