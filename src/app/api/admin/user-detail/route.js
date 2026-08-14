import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/user-detail?user_id=xxx
// Detail lengkap 1 akun untuk admin: semua field profil + booking terkait
// (sebagai jamaah ATAU sebagai perwakilan yang mereferensikan) + ringkasan komisi.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT id, name, email, wa, nik, foto_path, role, kode_unik, status, wilayah,
              points, tabungan_bsi,
              perekrut_id, created_at, reg_status, reg_metode, reg_jadwal, reg_notes,
              tanggal_lahir, jenis_kelamin, nama_ibu, alamat, kode_pos, pekerjaan,
              bank, no_rekening, nama_pemilik_rekening, terverifikasi, setuju_pks, setuju_pks_at
       FROM users WHERE id = ?`,
      [userId]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }
    const u = rows[0];

    let perekrutNama = null;
    if (u.perekrut_id) {
      const [pr] = await pool.query('SELECT name FROM users WHERE id = ?', [u.perekrut_id]);
      perekrutNama = pr[0]?.name || null;
    }

    const [bookings] = await pool.query(
      `SELECT id, prog_name, paket, kamar, jumlah_jamaah, dp_status, pelunasan_status, status,
              total_harga, form_filled, form_total, referral_perw_id, created_at
       FROM bookings WHERE user_id = ? OR referral_perw_id = ?
       ORDER BY created_at DESC`,
      [userId, userId]
    );

    let komisi = [];
    let downlineCount = 0;
    if (u.role === 'perwakilan') {
      const [k] = await pool.query(
        `SELECT jenis, SUM(nominal) AS total, COUNT(*) AS jumlah
         FROM komisi_ledger WHERE penerima_id = ? GROUP BY jenis`,
        [userId]
      );
      komisi = k;
      const [dl] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE perekrut_id = ?', [userId]);
      downlineCount = dl[0]?.n || 0;
    }

    return Response.json({
      user: u,
      perekrut_nama: perekrutNama,
      bookings,
      komisi,
      downline_count: downlineCount,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
