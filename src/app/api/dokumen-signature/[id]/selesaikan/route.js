import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { selesaikanSesiTtdById } from '@/lib/eSignature/selesaikanSesi';

// POST /api/dokumen-signature/[id]/selesaikan
// Trigger MOCK buat simulasi provider TTD selesai — di produksi nanti (begitu
// provider tersertifikasi sudah terhubung) ini digantikan endpoint webhook
// yang dipanggil provider, bukan tombol manual. Boleh dipicu admin ATAU
// signer sendiri (dari halaman /tanda-tangan/[id]), makanya cuma wajibLogin,
// bukan wajibRole(['admin']) — otorisasi lebih detail dicek di bawah.
export async function POST(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const [[sig]] = await pool.query('SELECT * FROM dokumen_signature WHERE id = ?', [id]);
    if (!sig) return Response.json({ error: 'Sesi tanda tangan tidak ditemukan' }, { status: 404 });
    if (sig.fase !== 'ttd_menunggu') {
      return Response.json({ error: `Sesi ini berstatus "${sig.fase}", belum siap diselesaikan.` }, { status: 400 });
    }

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin) {
      // Signer non-admin cuma boleh selesaikan sesi TTD miliknya sendiri —
      // dicocokkan ke email/wa yang tercatat waktu request dibuat, ATAU
      // (fallback) ke user_id booking untuk dokumen jamaah.
      let cocok = false;
      if (sig.dokumen === 'jamaah') {
        const [[b]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [sig.ref_id]);
        cocok = !!b && (b.user_id === auth.user.id || b.ordered_by === auth.user.id);
      } else if (['spka_ins', 'formulir', 'spk_ak', 'spk_ak_nonis', 'sk_cif'].includes(sig.dokumen)) {
        cocok = sig.ref_id === auth.user.id;
      }
      if (!cocok) return Response.json({ error: 'Anda tidak berwenang menyelesaikan sesi ini' }, { status: 403 });
    }

    const { pdfFinalPath } = await selesaikanSesiTtdById(sig.id, { actor: auth.user });

    return Response.json({ message: 'Tanda tangan digital selesai!', pdf_final_path: pdfFinalPath });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
