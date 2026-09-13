import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// GET /api/bookings/[id]/dokumen — daftar Invoice/Kwitansi/Tanda Terima Uang
// milik booking ini yang SUDAH terkirim ke jamaah (belum terkirim = belum
// relevan buat ditampilkan, masih di tangan admin). Dipakai dashboard jamaah
// buat lihat riwayat dokumen booking mereka sendiri, termasuk booking yang
// sudah tidak aktif (status cuma flag, dokumennya tetap ada).
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[booking]] = await pool.query('SELECT id, user_id, ordered_by FROM bookings WHERE id = ?', [id]);
    if (!booking) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });

    const uid = auth.user.id;
    const isAdmin = auth.user.role === 'admin' || auth.user.role === 'super_admin';
    const boleh = isAdmin || booking.user_id === uid || booking.ordered_by === uid;
    if (!boleh) {
      return Response.json({ error: 'Anda tidak punya akses ke booking ini' }, { status: 403 });
    }

    const [dokumenRows] = await pool.query(
      `SELECT id, jenis, nomor, nominal, tanggal, status, terkirim_metode, terkirim_at, scan_fisik_path
       FROM invoice_kwitansi WHERE booking_id = ? AND terkirim = 1 ORDER BY tanggal DESC, id DESC`,
      [id]
    );

    let sigByRefId = {};
    if (dokumenRows.length > 0) {
      const ids = dokumenRows.map(d => d.id);
      const [sigs] = await pool.query(
        `SELECT id, ref_id, fase, pdf_final_path FROM dokumen_signature WHERE dokumen = 'invoice' AND ref_id IN (?)`,
        [ids]
      );
      sigByRefId = Object.fromEntries(sigs.map(s => [String(s.ref_id), s]));
    }

    // Resolusi link aksi di server: fisik -> scan yang diunggah admin,
    // digital selesai -> PDF final, digital belum selesai -> link halaman
    // TTD (jamaah bisa langsung tanda tangan dari sana).
    const dokumen = dokumenRows.map(d => {
      const sig = sigByRefId[String(d.id)];
      let fileUrl = null;
      let linkTtd = null;
      if (d.terkirim_metode === 'fisik') {
        fileUrl = d.scan_fisik_path;
      } else if (d.terkirim_metode === 'digital' && sig) {
        if (sig.fase === 'selesai' && sig.pdf_final_path) fileUrl = sig.pdf_final_path;
        else linkTtd = `/tanda-tangan/${sig.id}`;
      }
      return {
        id: d.id, jenis: d.jenis, nomor: d.nomor, nominal: d.nominal, tanggal: d.tanggal,
        terkirim_metode: d.terkirim_metode, terkirim_at: d.terkirim_at,
        file_url: fileUrl, link_ttd: linkTtd,
      };
    });

    return Response.json({ dokumen });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
