import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// PATCH /api/sahabat/konfirmasi-kirim  body: { resi?: string }
// Self-service -- jamaah yang pilih metode TTD 'kirim' nandain sendiri
// "sudah kirim" paket dokumen fisik ke kantor (dikonfirmasi user
// 2026-10-08). Sebelumnya cuma ada status "diterima" (dicentang admin),
// gak ada status antara "udah dikirim, masih di jalan" -- admin gak tau
// harus nunggu paket apa belum. Boleh dipanggil berkali-kali buat update
// resi (mis. salah ketik), gak ada gate/lock di sini.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { resi } = await request.json();

    const [[user]] = await pool.query('SELECT name, role, metode_ttd_sahabat FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.metode_ttd_sahabat !== 'kirim') {
      return Response.json({ error: 'Cuma relevan buat metode "Cetak & Kirim Sendiri"' }, { status: 400 });
    }

    await pool.query(
      'UPDATE users SET dokumen_fisik_dikirim_at = NOW(), dokumen_fisik_resi = ? WHERE id = ?',
      [resi?.trim() || null, auth.user.id]
    );

    await kirimNotifikasiAdmin(pool, {
      tipe: 'sahabat_dokumen_dikirim',
      judul: 'Jamaah Sahabat Baitullah Konfirmasi Kirim Dokumen',
      pesan: `${user.name} konfirmasi sudah mengirim dokumen fisik (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran) ke kantor.${resi?.trim() ? ` Resi: ${resi.trim()}.` : ''}`,
      link: '/admin/sahabat',
    }).catch(() => {});

    return Response.json({ message: 'Konfirmasi pengiriman dokumen tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
