import { wajibLogin } from '@/lib/auth';
import pool from '@/lib/db';
import { hitungHargaCustomHotelDenganDb } from '@/lib/hotelCustomPricing';

const KAMAR_VALID = ['quad', 'triple', 'double'];

// POST /api/programs/[id]/hitung-hotel-custom — hitung harga LIVE buat 1
// kombinasi Bintang Mekkah × Bintang Madinah (Custom Hotel per Kota,
// checkout program reguler). Login wajib (jamaah publik boleh, bukan
// admin-only) — body cuma KEY paket ('deluxe'/'eksekutif'/'signature'),
// BUKAN nominal rate — server yang resolve rate dari DB (biaya_breakdown),
// rate mentah TIDAK PERNAH dipercaya dari client. Logic hitungnya di
// hitungHargaCustomHotelDenganDb (src/lib/hotelCustomPricing.js) — DIPAKAI
// ULANG PERSIS SAMA di src/lib/booking.js pas booking beneran dibuat,
// jangan pernah percaya harga jadi dari client buat jalur ini.
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { mekkah_paket, madinah_paket, kamar } = body;

    if (!KAMAR_VALID.includes(kamar)) {
      return Response.json({ error: 'Tipe kamar tidak valid' }, { status: 400 });
    }

    const hasil = await hitungHargaCustomHotelDenganDb(pool, id, {
      mekkahPaket: mekkah_paket, madinahPaket: madinah_paket,
    });

    // HPP/margin/rate mentah TIDAK PERNAH keluar dari sini — cuma harga jual final.
    return Response.json({
      harga_per_orang: hasil.perKamar[kamar],
      bintang_mekkah: hasil.bintangMekkah,
      bintang_madinah: hasil.bintangMadinah,
    });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
