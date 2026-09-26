import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { ambilJamaah } from '@/app/api/admin/database/route';
import { daftarJamaahPerluKit } from '@/lib/perlengkapan';
import { daftarTtuBelumDikirim } from '@/lib/invoiceKwitansi';
import { daftarPerjanjianBelumSelesai, daftarPenyesuaianHargaPending, daftarRefundBelumDitransfer, daftarAjuanKalkulatorPerwakilan } from '@/lib/perjanjianJamaah';

// GET /api/admin/dashboard
// Menyediakan angka stat + semua daftar pending berdasar cluster.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    // Semua user
    const [users] = await pool.query(
      `SELECT id, name, email, wa, role, status, kode_unik, wilayah, reg_status, terverifikasi, created_at
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
    // Jamaah Sahabat Baitullah (role sahabat) — cuma yang udah aktif, mirror
    // kartu "Aktif" di /admin/sahabat/database (dikonfirmasi user 2026-09-03,
    // sebelumnya dashboard utama ini gak nyinggung Sahabat Baitullah sama sekali).
    const sahabatAktif = users.filter(u => u.role === 'sahabat_baitullah' && u.status === 'active');

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
    // Akun baru (semua role non-staff) yang belum diverifikasi admin —
    // pengganti OTP registrasi. Yang sudah ditolak gak ikut.
    const pendingVerifikasi = users.filter(u =>
      !u.terverifikasi && !['admin', 'super_admin'].includes(u.role) && u.status !== 'rejected'
    );

    // 6. Perlengkapan yang belum dikirim (DP confirmed, status belum
    // dikirim/diterima) — lihat src/lib/perlengkapan.js.
    const semuaJamaahKit = await daftarJamaahPerluKit(pool);
    const pendingPerlengkapan = semuaJamaahKit.filter(j => j.status !== 'dikirim' && j.status !== 'diterima');

    // 7. Ajuan Budget dari Kalkulator Estimasi Publik yang belum ditindaklanjuti.
    let pendingKalkulatorLead = [];
    try {
      // LEFT JOIN template — lead tipe='custom' (ajukan sendiri, gak pilih
      // template) punya template_id NULL, JOIN biasa bakal nge-exclude
      // baris itu dari widget dashboard ini sama sekali.
      const [kl] = await pool.query(
        `SELECT l.id, l.tipe, l.paket, l.kamar, l.harga_jual, l.catatan_custom, l.created_at, u.name AS user_nama, t.nama AS template_nama
         FROM kalkulator_lead l
         JOIN users u ON u.id = l.user_id
         LEFT JOIN kalkulator_template_publik t ON t.id = l.template_id
         WHERE l.status = 'diajukan' AND l.status_tindak_lanjut = 'baru'
         ORDER BY l.diajukan_at DESC`
      );
      pendingKalkulatorLead = kl;
    } catch { pendingKalkulatorLead = []; } // tabel mungkin belum ada

    // 8. Tanda Terima Uang yang belum dikirim ke jamaah (belum pilih jalur
    // fisik/digital) — lihat daftarTtuBelumDikirim di src/lib/invoiceKwitansi.js.
    const pendingTtu = await daftarTtuBelumDikirim(pool);

    // 9. Perjanjian Jamaah belum selesai (materai + TTD, digital/fisik) —
    // lihat src/lib/perjanjianJamaah.js.
    const pendingPerjanjian = await daftarPerjanjianBelumSelesai(pool);

    // 10. Penyesuaian harga (kenaikan tiket/force majeure) menunggu
    // persetujuan jamaah.
    const pendingPenyesuaian = await daftarPenyesuaianHargaPending(pool);

    // 11. Refund pembatalan sudah disetujui tapi bukti TF belum diunggah.
    const pendingRefund = await daftarRefundBelumDitransfer(pool);

    // 12. Ajuan Kalkulator Perwakilan (quote HPP+margin sendiri) menunggu review.
    const pendingKalkulatorPerwakilan = await daftarAjuanKalkulatorPerwakilan(pool);

    return Response.json({
      stat: {
        jamaah: jamaahUnik,
        perwakilan: perwAcc.length,
        program: programAktif.length,
        sahabat: sahabatAktif.length,
      },
      pending: {
        program_umroh: pendingProgram,
        custom_harga: pendingCustomHarga,
        pembayaran: pendingPayment,
        akun_verifikasi: pendingVerifikasi,
        akun_jamaah: pendingAkunJamaah,
        akun_perwakilan: pendingAkunPerw,
        perlengkapan: pendingPerlengkapan,
        kalkulator_lead: pendingKalkulatorLead,
        ttu_belum_dikirim: pendingTtu,
        perjanjian_belum_selesai: pendingPerjanjian,
        penyesuaian_harga_pending: pendingPenyesuaian,
        refund_belum_ditransfer: pendingRefund,
        kalkulator_perwakilan_pending: pendingKalkulatorPerwakilan,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
