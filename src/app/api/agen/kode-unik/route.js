import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { pastikanKodeUnik } from '@/lib/kodeUnik';

// POST /api/agen/kode-unik — self-service, akun agen bekukan/isi kode_unik
// SENDIRI kalau belum ada (dikonfirmasi user 2026-10-19, bug nyata:
// dashboard/agen "Link Referral Kamu" nyangkut selamanya di "Memuat..."
// buat akun yang kode_unik-nya NULL -- ketemu dari akun yang dibuat lewat
// jalur lain selain POST /api/admin/agen, yang satu-satunya tempat
// pastikanKodeUnik('agen') sebelumnya dipanggil). Idempotent -- no-op
// kalau udah ada kode.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'agen' && auth.user.role_kedua !== 'agen') {
    return Response.json({ error: 'Hanya berlaku untuk akun agen' }, { status: 403 });
  }
  try {
    const kodeUnik = await pastikanKodeUnik(pool, auth.user.id, 'agen');
    return Response.json({ kode_unik: kodeUnik });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
