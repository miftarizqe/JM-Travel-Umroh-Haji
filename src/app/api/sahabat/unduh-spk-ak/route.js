import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { buatPdfSpkAkUntukUser, responsPdfSpkAk } from '@/lib/pdfDokumen/spkAkUntukUser';

// GET /api/sahabat/unduh-spk-ak — PDF SPK-AK / SPK-AK Non-Muslim resmi milik
// anggota yang login (template final, identitas terisi). Dipakai buat baca +
// centang setuju di /pks dan buat cetak fisik. Logikanya satu sumber dengan
// /api/admin/cetak-spk-ak/[user_id] (lihat src/lib/pdfDokumen/spkAkUntukUser.js).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    return responsPdfSpkAk(await buatPdfSpkAkUntukUser(pool, auth.user.id));
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
