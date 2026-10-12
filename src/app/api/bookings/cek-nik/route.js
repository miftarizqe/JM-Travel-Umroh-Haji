import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cariNikDipakaiProgramLain } from '@/lib/booking';

// POST /api/bookings/cek-nik  body: { prog_id, niks: [] }
// Cek dobel daftar SEBELUM booking dibuat (dikonfirmasi user 2026-10-12) —
// 1 NIK gak boleh aktif 2x di program yang sama. Aturan & fungsinya sama
// dengan cek pas simpan formulir (cariNikDipakaiProgramLain), server
// checkout tetap ngecek ulang. ID booking cuma dibalikin kalau booking itu
// milik/dipesan akun ini sendiri — booking orang lain cukup "sudah terdaftar".
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { prog_id, niks } = await request.json();
    const daftar = (Array.isArray(niks) ? niks : []).map(n => String(n || '').trim()).filter(n => /^\d{16}$/.test(n));
    if (!prog_id || daftar.length === 0) return Response.json({ terpakai: null });

    const dup = await cariNikDipakaiProgramLain(pool, { progId: prog_id, excludeBookingId: '', niks: daftar });
    if (!dup) return Response.json({ terpakai: null });

    const [[bk]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [dup.booking_id]);
    const milikSendiri = bk && (bk.user_id === auth.user.id || bk.ordered_by === auth.user.id);
    return Response.json({ terpakai: dup.nik, booking_id: milikSendiri ? dup.booking_id : null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
