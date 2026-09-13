import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/dokumen-signature/[id] — dipakai halaman signer-facing
// /tanda-tangan/[id]. Otorisasi sama seperti POST .../selesaikan: admin
// boleh lihat semua, non-admin cuma boleh lihat sesi miliknya sendiri.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const [[sig]] = await pool.query('SELECT * FROM dokumen_signature WHERE id = ?', [id]);
    if (!sig) return Response.json({ error: 'Sesi tanda tangan tidak ditemukan' }, { status: 404 });

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin) {
      let cocok = false;
      if (sig.dokumen === 'jamaah') {
        const [[b]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [sig.ref_id]);
        cocok = !!b && (b.user_id === auth.user.id || b.ordered_by === auth.user.id);
      } else if (['spka_ins', 'formulir', 'spk_ak', 'sk_cif'].includes(sig.dokumen)) {
        cocok = sig.ref_id === auth.user.id;
      }
      if (!cocok) return Response.json({ error: 'Anda tidak berwenang melihat sesi ini' }, { status: 403 });
    }

    return Response.json({ signature: sig });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
