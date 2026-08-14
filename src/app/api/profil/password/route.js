import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';

// PATCH /api/profil/password
// User ganti password sendiri (wajib kasih password_lama, langsung final —
// wajib_ganti_password dimatiin), ATAU admin reset password user lain
// (tanpa perlu tahu password_lama — dianggap sementara, wajib_ganti_password
// dinyalain biar orangnya dipaksa ganti sendiri pas pertama kali login).
export async function PATCH(request) {
  try {
    const { user_id, password_lama, password_baru } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, user_id);
    if (auth.error) return auth.error;

    if (!password_baru || String(password_baru).trim().length < 6) {
      return Response.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 });
    }

    const isAdminResetOrangLain = (auth.user.role === 'admin' || auth.user.role === 'super_admin') && String(auth.user.id) !== String(user_id);

    if (!isAdminResetOrangLain) {
      // Ganti password sendiri — wajib verifikasi password lama dulu.
      if (!password_lama) {
        return Response.json({ error: 'Password lama wajib diisi' }, { status: 400 });
      }
      const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [user_id]);
      if (rows.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
      const valid = await bcrypt.compare(String(password_lama), rows[0].password);
      if (!valid) {
        return Response.json({ error: 'Password lama salah' }, { status: 400 });
      }
    }

    const hashed = await bcrypt.hash(String(password_baru).trim(), 10);
    // Admin reset punya orang lain -> NYALAIN wajib_ganti_password (dia
    // yang set, bukan pemiliknya, jadi anggap ini password sementara sampai
    // pemiliknya sendiri konfirmasi lewat /ganti-password-wajib).
    // Ganti password sendiri (password_lama sudah diverifikasi di atas) ->
    // MATIIN flag itu, karena ini udah password pilihan pemiliknya sendiri.
    const setWajibGanti = isAdminResetOrangLain ? ', wajib_ganti_password = 1' : ', wajib_ganti_password = 0';
    await pool.query(`UPDATE users SET password = ?${setWajibGanti} WHERE id = ?`, [hashed, user_id]);

    return Response.json({ message: 'Password berhasil diubah!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
