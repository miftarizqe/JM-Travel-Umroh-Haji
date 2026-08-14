import { wajibRole } from '@/lib/auth';
import { prosesBookingSelesai } from '@/lib/closing';

// Closing normalnya dicairkan otomatis (lihat src/lib/closing-otomatis.js,
// dijalankan lewat instrumentation.js). Endpoint ini BUKAN jalur bypass —
// admin cuma memicu pengecekan syarat yang sama lebih awal, berguna kalau
// semua syarat sudah lengkap tapi sweep otomatis berikutnya belum jalan.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { booking_id } = await request.json();
    if (!booking_id) {
      return Response.json({ error: 'booking_id wajib diisi' }, { status: 400 });
    }

    const hasil = await prosesBookingSelesai(booking_id, auth.user);
    if (!hasil.ok) {
      return Response.json({ error: hasil.error }, { status: 400 });
    }

    return Response.json({
      message: 'Booking ditandai selesai!',
      skema_berlaku: hasil.skema_berlaku,
      rincian_komisi: hasil.rincian,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
