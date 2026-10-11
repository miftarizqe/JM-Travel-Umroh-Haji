import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// PATCH /api/sahabat/kirim-pendaftaran  body: {} (tanpa payload)
// Tombol "Kirim Pendaftaran" final di /status-pendaftaran-sahabat
// (dikonfirmasi user 2026-10-11, lihat migrations/219) — sebelum ini isian
// di halaman itu masih draft (rekening tabungan umroh, bukti TF, dst boleh
// diubah jamaah sendiri). Setelah terkirim baru masuk antrian ACC admin.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[u]] = await pool.query(
      `SELECT name, role, setuju_pks, no_rekening_tabungan_umroh, bantuan_bsi_manual_disetujui_at,
              setuju_sk_cif_pemblokiran_at, metode_ttd_sahabat
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (!u) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (u.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });

    const [[p]] = await pool.query(
      'SELECT id, status, bukti_tf_verified_at, perbaikan_diminta_at, diajukan_at FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [auth.user.id]
    );
    if (!p) return Response.json({ error: 'Isi data diri pendaftaran sahabat terlebih dahulu' }, { status: 400 });
    if (p.status === 'active' || p.status === 'ditolak') return Response.json({ error: 'Pendaftaran ini sudah aktif/ditolak.' }, { status: 400 });
    if (p.diajukan_at) return Response.json({ message: 'Pendaftaran sudah dikirim sebelumnya.' });
    if (p.perbaikan_diminta_at) return Response.json({ error: 'Perbaiki data diri Anda dulu sesuai catatan admin.' }, { status: 400 });

    // Sinkron sama syarat ACC admin (action=advance di
    // /api/status-pendaftaran-sahabat) + metode TTD sudah dipilih.
    const kurang = [
      !u.setuju_pks && 'Surat Perjanjian Jamaah Sahabat Baitullah',
      !p.bukti_tf_verified_at && 'Bukti transfer',
      !u.no_rekening_tabungan_umroh && !u.bantuan_bsi_manual_disetujui_at && 'Rekening Tabungan Umroh',
      !u.setuju_sk_cif_pemblokiran_at && 'Baca & Setuju SK-CIF & Surat Kuasa Blokir Rekening',
      !u.metode_ttd_sahabat && 'Metode TTD',
    ].filter(Boolean);
    if (kurang.length) return Response.json({ error: `Lengkapi dulu: ${kurang.join(', ')}` }, { status: 400 });

    await pool.query('UPDATE sahabat_pendaftaran SET diajukan_at = NOW() WHERE id = ? AND diajukan_at IS NULL', [p.id]);
    await pool.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('sahabat_baitullah', ?, 'diajukan', 'Jamaah mengirim pendaftaran untuk ditinjau admin')",
      [auth.user.id]
    );
    await kirimNotifikasiAdmin(pool, {
      tipe: 'sahabat_diajukan',
      judul: 'Pendaftaran Sahabat Baitullah Siap Ditinjau',
      pesan: `${u.name} sudah mengirim pendaftaran Sahabat Baitullah dan menunggu ACC.`,
      link: '/admin/sahabat',
    });
    return Response.json({ message: 'Pendaftaran terkirim. Admin JM Travel akan segera meninjau.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
