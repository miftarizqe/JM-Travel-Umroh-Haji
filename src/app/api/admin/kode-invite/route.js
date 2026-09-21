import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { pastikanKodeInvitePerwakilan, pastikanKodeInviteSahabat } from '@/lib/kodeInvitePerwakilan';

// GET /api/admin/kode-invite?tipe=sahabat_baitullah|perwakilan
// Kode invite MILIK AKUN ADMIN/SUPER_ADMIN YANG LOGIN SENDIRI — dipakai buat
// bikin link referral langsung dari panel admin (Pendaftaran Sahabat
// Baitullah / Pendaftaran Perwakilan), biar kantor bisa ngerekrut jamaah
// baru pakai link tanpa lewat anggota aktif (dikonfirmasi user 2026-09-19).
// Generate on-demand kalau belum ada (pastikanKodeInvite* generik, gak peduli
// role pemiliknya) — verifikasi kode ini pas /register ada di
// /api/referral-list/verify-invite (sudah di-widen nerima role admin/super_admin juga).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const tipe = searchParams.get('tipe') === 'perwakilan' ? 'perwakilan' : 'sahabat_baitullah';
    const kode = tipe === 'perwakilan'
      ? await pastikanKodeInvitePerwakilan(pool, auth.user.id)
      : await pastikanKodeInviteSahabat(pool, auth.user.id);
    return Response.json({ kode });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
