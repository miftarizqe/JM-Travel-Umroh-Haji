import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// PATCH /api/sahabat/cif-bsi  body: { cif_bsi }
// Self-service — anggota sahabat isi nomor CIF BSI mereka sendiri sebelum
// SK-CIF bisa digenerate. Cuma boleh diisi SEKALI (WHERE cif_bsi IS NULL) —
// kalau perlu diubah setelah itu (mis. typo), lewat admin, bukan endpoint
// ini, karena SK-CIF yang sudah dibekukan/ditandatangani jangan sampai gak
// nyambung sama nomor yang tercatat.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { cif_bsi } = await request.json();
    const nilai = String(cif_bsi || '').trim();
    if (!nilai) return Response.json({ error: 'Nomor CIF BSI wajib diisi' }, { status: 400 });

    const [[user]] = await pool.query('SELECT role, cif_bsi FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.cif_bsi) return Response.json({ error: 'Nomor CIF BSI sudah diisi sebelumnya. Hubungi admin kalau perlu diubah.' }, { status: 400 });

    await pool.query('UPDATE users SET cif_bsi = ? WHERE id = ? AND cif_bsi IS NULL', [nilai, auth.user.id]);
    return Response.json({ message: 'Nomor CIF BSI tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
