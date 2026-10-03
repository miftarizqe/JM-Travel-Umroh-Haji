import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { hariIniWib, SQL_JADWAL_BELUM_LEWAT } from '@/lib/jadwalTarget';

// POST /api/sahabat/ganti-target  body: { program_id }
// Self-service — anggota Sahabat Baitullah ajukan ganti Target Impian
// (program eksklusif yang dipilih di wizard daftar-sahabat), dipicu dari
// Profil (dikonfirmasi user 2026-09-29). Target lama BUKAN langsung
// diganti di sini — cuma dicatat sebagai pengajuan (target_ganti_status
// 'diajukan'), wajib di-ACC admin/super_admin dulu (lihat PATCH
// /api/admin/sahabat/ganti-target) sebelum program_id beneran berubah.
// SENGAJA TIDAK menyentuh dokumen legal yang udah ditandatangani
// (SK-CIF/Surat Pemblokiran/SPK-AK) ataupun nominal_blokir_tabungan/
// jangka_waktu_blokir_hari/tanggal_mulai_blokir di users — dikonfirmasi
// user eksplisit "gausah ada perjanjian lagi ya untuk perubahan ini".
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { program_id } = await request.json();
    if (!program_id) return Response.json({ error: 'Program tujuan wajib dipilih' }, { status: 400 });

    const [[user]] = await pool.query('SELECT role FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun Sahabat Baitullah' }, { status: 400 });

    const [[pendaftaran]] = await pool.query(
      'SELECT id, program_id, target_ganti_status FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [auth.user.id]
    );
    if (!pendaftaran) return Response.json({ error: 'Data pendaftaran tidak ditemukan' }, { status: 404 });
    if (['diajukan', 'pembatalan_diajukan'].includes(pendaftaran.target_ganti_status)) {
      return Response.json({ error: 'Anda masih punya pengajuan ganti target yang belum diproses admin.' }, { status: 400 });
    }
    if (String(pendaftaran.program_id) === String(program_id)) {
      return Response.json({ error: 'Program ini sudah jadi Target Impian Anda saat ini.' }, { status: 400 });
    }

    const [[program]] = await pool.query(
      `SELECT id, name FROM programs WHERE id = ? AND publish_type = 'sahabat_baitullah' AND active = 1 AND ${SQL_JADWAL_BELUM_LEWAT}`,
      [program_id, hariIniWib()]
    );
    if (!program) return Response.json({ error: 'Program tujuan tidak valid, sudah tidak aktif, atau jadwal keberangkatannya sudah lewat' }, { status: 400 });

    await pool.query(
      `UPDATE sahabat_pendaftaran
       SET target_ganti_program_id = ?, target_ganti_status = 'diajukan', target_ganti_diajukan_at = NOW(),
           target_ganti_diproses_at = NULL, target_ganti_catatan_admin = NULL
       WHERE id = ?`,
      [program_id, pendaftaran.id]
    );

    return Response.json({ message: `Pengajuan ganti target ke "${program.name}" terkirim, menunggu ACC admin.` });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/sahabat/ganti-target — ajukan PEMBATALAN pengajuan ganti
// target yang lagi 'diajukan' (dikonfirmasi user 2026-09-30). SENGAJA
// TETAP wajib ACC admin (bukan langsung batal sepihak) — konsisten sama
// filosofi seluruh fitur ini, admin yang pegang keputusan akhir. Kalau
// disetujui admin, target_ganti_status balik NULL & program_id (target
// lama) otomatis aktif lagi TANPA disentuh sama sekali sepanjang proses
// ini — gak butuh logic "revert" khusus.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[pendaftaran]] = await pool.query(
      'SELECT id, target_ganti_status FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [auth.user.id]
    );
    if (!pendaftaran) return Response.json({ error: 'Data pendaftaran tidak ditemukan' }, { status: 404 });
    if (pendaftaran.target_ganti_status !== 'diajukan') {
      return Response.json({ error: 'Tidak ada pengajuan ganti target yang bisa dibatalkan.' }, { status: 400 });
    }

    await pool.query(
      `UPDATE sahabat_pendaftaran
       SET target_ganti_status = 'pembatalan_diajukan', target_ganti_diproses_at = NULL, target_ganti_catatan_admin = NULL
       WHERE id = ?`,
      [pendaftaran.id]
    );

    return Response.json({ message: 'Pengajuan pembatalan terkirim, menunggu ACC admin.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
