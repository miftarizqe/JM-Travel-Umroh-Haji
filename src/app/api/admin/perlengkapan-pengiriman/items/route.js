import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { daftarItemUntukJamaah, kategoriProgramUntukBooking } from '@/lib/perlengkapan';

// GET /api/admin/perlengkapan-pengiriman/items?jk=Laki-Laki|Perempuan&booking_id=...
// Daftar item yang berlaku ke gender + kategori program booking itu — dipakai
// modal checklist admin sebelum tandai "Dikirim" (bukan angka stok, cuma nama
// item buat dicontreng).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const jk = searchParams.get('jk') || null;
    const bookingId = searchParams.get('booking_id');
    const kategoriProgram = bookingId ? await kategoriProgramUntukBooking(pool, bookingId) : 'umum';
    const items = await daftarItemUntukJamaah(pool, jk, kategoriProgram);
    return Response.json({ items: items.map(it => ({ id: it.id, nama: it.nama, gender_spesifik: it.gender_spesifik })) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
