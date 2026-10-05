import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// PATCH /api/admin/janji-temu-kantor  body: { user_id, selesai: boolean }
// Tandai janji temu "Datang ke Kantor" udah kelar (orangnya udah dateng &
// dokumennya udah di-TTD di tempat) — dikonfirmasi user 2026-10-05,
// sebelumnya gak ada trigger apapun jadi yang udah lewat tanggal numpuk
// terus di "Terlewat". 1 kolom generik users.janji_temu_kantor_selesai_at,
// dipakai bareng Sahabat Baitullah & Perwakilan (lihat migrations/211).
// `selesai: false` buat buka lagi kalau salah klik.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { user_id, selesai } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const [[u]] = await pool.query('SELECT name, metode_ttd_sahabat, reg_metode FROM users WHERE id = ?', [user_id]);
    if (!u) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    if (u.metode_ttd_sahabat !== 'kantor' && u.reg_metode !== 'kantor') {
      return Response.json({ error: 'User ini gak punya janji temu kantor aktif' }, { status: 400 });
    }

    await pool.query(
      'UPDATE users SET janji_temu_kantor_selesai_at = ? WHERE id = ?',
      [selesai ? new Date() : null, user_id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: selesai ? 'janji_temu_kantor_selesai' : 'janji_temu_kantor_buka_lagi',
      target_type: 'users',
      target_id: user_id,
      keterangan: `Janji temu kantor ${u.name} ditandai ${selesai ? 'selesai' : 'belum selesai'}.`,
    });

    return Response.json({ message: selesai ? 'Ditandai selesai.' : 'Dibuka lagi.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
