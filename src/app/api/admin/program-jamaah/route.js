import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/program-jamaah?prog_id=xxx
// Daftar booking + jamaah pada satu program, untuk admin.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const progId = searchParams.get('prog_id');
    if (!progId) return Response.json({ error: 'prog_id wajib diisi' }, { status: 400 });

    const [bookings] = await pool.query(
      `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah,
              b.dp_status, b.pelunasan_status, b.status, b.form_filled, b.form_total,
              b.total_harga, b.dp_amount, b.opsi_tambahan_total,
              b.sumber_info, b.referral_kode, b.jamaah_data, b.created_at,
              p.tanggal_berangkat,
              EXISTS (
                SELECT 1 FROM pembatalan pb
                WHERE pb.booking_id = b.id AND pb.status IN ('menunggu','disetujui')
              ) AS ada_pembatalan_aktif,
              u.name AS pemesan_nama, u.email AS pemesan_email
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.prog_id = ?
       ORDER BY b.created_at DESC`,
      [progId]
    );

    // Parse jamaah_data JSON
    const result = bookings.map(b => {
      let jamaah = [];
      if (b.jamaah_data) {
        try { jamaah = typeof b.jamaah_data === 'string' ? JSON.parse(b.jamaah_data) : b.jamaah_data; }
        catch { jamaah = []; }
      }
      // Label sumber akun yang lebih ramah
      const sumberLabel = {
        instagram: 'Instagram', tiktok: 'TikTok', agen: 'Agen',
        perwakilan: 'Perwakilan', teman: 'Rekomendasi Teman', website: 'Website',
        langsung_kantor: 'Langsung ke Kantor', lainnya: 'Lainnya',
      }[b.sumber_info] || b.sumber_info || '-';

      return {
        id: b.id, prog_name: b.prog_name, paket: b.paket, kamar: b.kamar,
        jumlah_jamaah: b.jumlah_jamaah, dp_status: b.dp_status,
        pelunasan_status: b.pelunasan_status, status: b.status,
        form_filled: b.form_filled, form_total: b.form_total,
        total_harga: b.total_harga, dp_amount: b.dp_amount, opsi_tambahan_total: b.opsi_tambahan_total,
        sumber: sumberLabel, referral_kode: b.referral_kode,
        pemesan_nama: b.pemesan_nama, pemesan_email: b.pemesan_email,
        created_at: b.created_at,
        tanggal_berangkat: b.tanggal_berangkat,
        ada_pembatalan_aktif: !!b.ada_pembatalan_aktif,
        jamaah, // array detail tiap jamaah
        form_lengkap: b.form_filled >= b.form_total,
      };
    });

    return Response.json({ bookings: result });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
