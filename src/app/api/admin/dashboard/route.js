import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { ambilJamaah } from '@/app/api/admin/database/route';

// GET /api/admin/dashboard
// Menyediakan angka stat + semua daftar pending berdasar cluster.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    // Semua user
    const [users] = await pool.query(
      `SELECT id, name, email, wa, role, status, kode_unik, wilayah, reg_status, created_at
       FROM users ORDER BY created_at DESC`
    );

    // Jamaah TIDAK dihitung dari users.role='jamaah' — banyak jamaah didaftarkan
    // perwakilan tanpa pernah punya akun. Pakai sumber yang sama dengan
    // Database Jamaah: dedup by NIK/paspor dari jamaah_data tiap booking.
    // Stat tile ini cuma yang BENERAN SUDAH BERANGKAT (sama seperti tabel
    // "Sudah Pernah Berangkat" di Database Jamaah) — bukan total semua jamaah
    // yang pernah terdaftar termasuk yang masih menunggu/batal.
    const jamaahRows = await ambilJamaah();
    const jamaahUnik = jamaahRows.filter(j => j.status_jamaah === 'Sudah Berangkat').length;
    // "Sudah di-ACC" = pernah diapprove admin (active ATAU dinonaktifkan lagi
    // belakangan) — beda dengan 'pending' (belum direview) & 'rejected'.
    const perwAcc = users.filter(u => u.role === 'perwakilan' && (u.status === 'active' || u.status === 'nonaktif'));

    // Program aktif
    const [programs] = await pool.query('SELECT * FROM programs ORDER BY created_at DESC');
    const programAktif = programs.filter(p => p.active !== 0);

    // ===== CLUSTER PENDING =====
    // 1. Pending pendaftaran program umroh (booking baru yang belum isi form / belum lengkap)
    const [pendingProgram] = await pool.query(
      `SELECT b.id, b.prog_name, b.jumlah_jamaah, b.form_filled, b.form_total,
              b.dp_status, b.created_at, u.name AS pemesan
       FROM bookings b LEFT JOIN users u ON u.id = b.user_id
       WHERE b.status = 'active' AND (b.form_filled < b.form_total OR b.dp_status = 'pending')
       ORDER BY b.created_at DESC`
    );

    // 2. Pending pengajuan custom harga
    let pendingCustomHarga = [];
    try {
      const [ch] = await pool.query(
        `SELECT * FROM custom_harga_request WHERE status = 'pending' ORDER BY created_at DESC`
      );
      pendingCustomHarga = ch;
    } catch { pendingCustomHarga = []; } // tabel mungkin belum ada

    // 3. Pending konfirmasi pembayaran
    const [pendingPayment] = await pool.query(
      `SELECT p.*, COALESCE(u.name, p.nama) AS nama
       FROM payments p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.status = 'pending' ORDER BY p.created_at DESC`
    );

    // 4/5. Pending pendaftaran akun (jamaah / perwakilan)
    const pendingAkunJamaah = users.filter(u => u.role === 'jamaah' && u.status === 'pending');
    const pendingAkunPerw = users.filter(u => u.role === 'perwakilan' && u.status === 'pending');

    return Response.json({
      stat: {
        jamaah: jamaahUnik,
        perwakilan: perwAcc.length,
        program: programAktif.length,
      },
      pending: {
        program_umroh: pendingProgram,
        custom_harga: pendingCustomHarga,
        pembayaran: pendingPayment,
        akun_jamaah: pendingAkunJamaah,
        akun_perwakilan: pendingAkunPerw,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
