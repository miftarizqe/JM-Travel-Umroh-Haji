import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { tambahJamaahKeBooking } from '@/lib/booking';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';

// POST /api/bookings/[id]/tambah-jamaah — jamaah nambah pax ke booking
// aktifnya sendiri (dikonfirmasi user 2026-10-13). Pax baru wajib bayar DP
// sendiri (payment row baru type='dp'), gerbang & kalkulasi harga lengkap
// ada di src/lib/booking.js#tambahJamaahKeBooking.
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { namas, jks, alamats, was, pakets, kamars, bukti_path, bukti_nama } = await request.json();
    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);

    const hasil = await tambahJamaahKeBooking(pool, {
      bookingId: id, userId: auth.user.id, isAdmin,
      namas, jks, alamats, was, pakets, kamars, buktiPath: bukti_path, buktiNama: bukti_nama,
    });

    await kirimNotifikasiAdmin(pool, {
      tipe: 'pembayaran_baru',
      judul: 'Tambah Jamaah — DP Baru',
      pesan: `${auth.user.name || 'Jamaah'} menambah ${hasil.jumlahTambahan} jamaah ke booking ${id}, mengirim bukti DP tambahan.`,
      link: '/admin?tab=payments',
    });

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'tambah_jamaah_booking',
      target_type: 'booking',
      target_id: id,
      keterangan: `Menambah ${hasil.jumlahTambahan} jamaah, DP tambahan ${hasil.dpAmountTambahan}`,
    });

    const pesan = hasil.perjanjianDireset
      ? 'Jamaah berhasil ditambahkan! Bukti DP menunggu konfirmasi admin. Karena jumlah jamaah/total harga berubah, Perjanjian Jamaah yang sebelumnya sudah disetujui/ditandatangani perlu disetujui & ditandatangani ulang sebelum bisa lanjut pelunasan.'
      : 'Jamaah berhasil ditambahkan! Bukti DP menunggu konfirmasi admin.';
    return Response.json({ message: pesan, ...hasil }, { status: 201 });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
