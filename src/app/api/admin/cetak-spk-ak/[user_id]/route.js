import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { buatPdfSpkAkUntukUser, responsPdfSpkAk } from '@/lib/pdfDokumen/spkAkUntukUser';

// GET /api/admin/cetak-spk-ak/[user_id] — PDF SPK-AK / SPK-AK Non-Muslim resmi
// anggota Sahabat (template final). Admin/super_admin, atau anggota itu sendiri.
// DULU mengirim pasal dari DB buat dirender HTML (dan cuma varian Muslim) —
// diganti template PDF resmi biar yang dicetak admin = yang ditandatangani
// anggota (dikonfirmasi user 2026-10-01).
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { user_id } = await params;
    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin && String(auth.user.id) !== String(user_id)) {
      return Response.json({ error: 'Anda tidak berwenang atas dokumen ini' }, { status: 403 });
    }
    return responsPdfSpkAk(await buatPdfSpkAkUntukUser(pool, user_id));
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
