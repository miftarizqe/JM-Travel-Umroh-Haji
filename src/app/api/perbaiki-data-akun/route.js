import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { emailValid, nikValid, normalisasiWA, varianWA } from '@/lib/validasiAkun';

// Perbaikan form registrasi setelah admin "Minta Perbaikan" di antrian
// Verifikasi Akun (dikonfirmasi user 2026-10-11, lihat action
// 'minta_perbaikan_akun' di /api/admin/users). Field & validasinya sama
// dengan /api/auth/register. Cuma bisa dipakai selama flag
// perbaikan_akun_diminta_at terisi — di luar itu NIK/WA/Email tetap
// dikunci & koreksinya lewat admin.

// GET — data registrasi saat ini + catatan admin
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const [[u]] = await pool.query(
      `SELECT name, email, wa, nik, agama, terverifikasi, perbaikan_akun_diminta_at, perbaikan_akun_catatan
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (!u) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    return Response.json({
      perlu_perbaikan: !!u.perbaikan_akun_diminta_at && !u.terverifikasi,
      catatan: u.perbaikan_akun_catatan,
      data: { name: u.name, email: u.email, wa: u.wa, nik: u.nik, agama: u.agama },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — kirim perbaikan, akun balik ke antrian verifikasi admin
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  try {
    const [[u]] = await pool.query(
      'SELECT name, terverifikasi, perbaikan_akun_diminta_at FROM users WHERE id = ?', [userId]
    );
    if (!u) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    if (u.terverifikasi || !u.perbaikan_akun_diminta_at) {
      return Response.json({ error: 'Akun Anda tidak sedang diminta memperbaiki data.' }, { status: 400 });
    }

    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const nik = String(body.nik || '').trim();
    const agama = ['islam', 'non_islam'].includes(body.agama) ? body.agama : null;
    if (!name || !email || !body.wa || !nik || !agama) {
      return Response.json({ error: 'Semua field wajib diisi' }, { status: 400 });
    }
    if (name.length > 100) {
      return Response.json({ error: 'Nama maksimal 100 karakter' }, { status: 400 });
    }
    if (!nikValid(nik)) {
      return Response.json({ error: 'NIK harus 16 digit angka' }, { status: 400 });
    }
    if (!emailValid(email)) {
      return Response.json({ error: 'Format email tidak valid' }, { status: 400 });
    }
    const wa = normalisasiWA(body.wa);
    if (!wa) {
      return Response.json({ error: 'Nomor WhatsApp tidak valid (contoh: 081234567890)' }, { status: 400 });
    }

    const [dobel] = await pool.query(
      'SELECT id FROM users WHERE id != ? AND (email = ? OR wa IN (?) OR nik = ?)',
      [userId, email, varianWA(wa), nik]
    );
    if (dobel.length > 0) {
      return Response.json({ error: 'Email, WA, atau NIK sudah dipakai akun lain' }, { status: 400 });
    }

    await pool.query(
      `UPDATE users SET name = ?, email = ?, wa = ?, nik = ?, agama = ?,
              perbaikan_akun_diminta_at = NULL, perbaikan_akun_catatan = NULL
       WHERE id = ?`,
      [name, email, wa, nik, agama, userId]
    );

    await kirimNotifikasiAdmin(pool, {
      tipe: 'akun_perbaikan_dikirim',
      judul: 'Perbaikan Data Akun Dikirim',
      pesan: `${name} sudah memperbaiki data akunnya dan menunggu verifikasi ulang.`,
      link: '/admin?tab=users',
    }).catch(() => {});

    return Response.json({
      message: 'Perbaikan data terkirim. Akun Anda akan diverifikasi ulang oleh admin.',
      user: { name, email, wa, nik, agama },
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Email, WA, atau NIK sudah dipakai akun lain' }, { status: 400 });
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
