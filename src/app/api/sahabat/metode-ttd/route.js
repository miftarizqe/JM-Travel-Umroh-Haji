import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// PATCH /api/sahabat/metode-ttd  body: { metode: 'kantor'|'kirim', tanggal_kunjungan?: 'YYYY-MM-DD' }
// Self-service — jamaah pilih cara TTD fisik ketiga dokumen (SPK-AK, SK-CIF,
// Surat Pemblokiran) SELAMA vendor esign/e-materai belum connect
// (dikonfirmasi user 2026-09-30, lihat src/lib/spkAkFlag.js). 'kantor' wajib
// sertakan tanggal rencana kunjungan (dipakai admin buat nunggu kedatangan);
// 'kirim' gak butuh tanggal, jamaah lanjut ke print-scan-unggah-kirim seperti
// biasa. Boleh ganti pilihan kapan saja SEBELUM dokumen beneran diproses
// (gak ada gate/lock di sini, murni preferensi buat ditampilin ke admin).
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { metode, tanggal_kunjungan } = await request.json();
    if (!['kantor', 'kirim'].includes(metode)) {
      return Response.json({ error: 'Metode harus "kantor" atau "kirim"' }, { status: 400 });
    }
    if (metode === 'kantor' && !tanggal_kunjungan) {
      return Response.json({ error: 'Tanggal rencana kunjungan wajib diisi' }, { status: 400 });
    }

    const [[user]] = await pool.query('SELECT name, role FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });

    await pool.query(
      'UPDATE users SET metode_ttd_sahabat = ?, rencana_kunjungan_kantor_at = ? WHERE id = ?',
      [metode, metode === 'kantor' ? tanggal_kunjungan : null, auth.user.id]
    );

    // Notifikasi admin — SEBELUMNYA gak ada sama sekali (ditemukan &
    // diperbaiki 2026-10-03, laporan user: jamaah udah pilih "Datang
    // Kantor" tapi gak ada yang ngasih tau admin, dokumennya gak sempat
    // disiapin). 'kantor' paling actionable (ada tanggal kunjungan yang
    // perlu disiapin dokumennya) — tetep dikirim juga buat 'kirim' biar
    // admin tau ada yang nunggu kiriman scan.
    await kirimNotifikasiAdmin(pool, {
      tipe: 'sahabat_metode_ttd',
      judul: metode === 'kantor' ? 'Jamaah Sahabat Baitullah Mau Datang ke Kantor' : 'Jamaah Sahabat Baitullah Pilih Cetak & Kirim Sendiri',
      pesan: metode === 'kantor'
        ? `${user.name} rencana datang ke kantor pada ${new Date(tanggal_kunjungan).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} untuk TTD Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran — siapkan dokumennya (bisa dicetak dari Database Jamaah).`
        : `${user.name} akan cetak & kirim sendiri Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran yang sudah ditandatangani.`,
      link: '/admin/sahabat/database',
    }).catch(() => {});

    return Response.json({ message: 'Pilihan metode TTD tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
