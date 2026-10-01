import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';

// GET /api/sahabat/riwayat-saldo?sahabat_id=xxx — riwayat lengkap saldo
// tabungan umroh bergaya rekening koran (dipakai /dashboard/sahabat/riwayat).
// Beda dari /api/sahabat/dashboard yang cuma kirim ringkasan angka — di sini
// tiap baris dapet saldo berjalan (running balance), dihitung server-side.
// Riwayat ujroh wajib tampil: tanggal, ID transaksi, level (Gen1-5), nama
// lengkap pendaftar, nominal, status (catatan sistem ujroh #11).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sahabatId = searchParams.get('sahabat_id');
    if (!sahabatId) return Response.json({ error: 'sahabat_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, sahabatId);
    if (auth.error) return auth.error;

    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.ref_id, kl.nominal, kl.keterangan, kl.dikonfirmasi_at, kl.bukti_tf_admin_path, kl.created_at,
              kl.level, pendaftar.name AS nama_pendaftar
       FROM komisi_ledger kl
       LEFT JOIN users pendaftar
         ON pendaftar.id = kl.ref_id AND kl.jenis IN ('komisi_sahabat','head_of_program_registrasi')
       WHERE kl.penerima_id = ? AND kl.jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat','koreksi_saldo_sahabat')
       ORDER BY kl.created_at ASC, kl.id ASC`,
      [sahabatId]
    );

    // Saldo berjalan cuma naik dari baris yang UDAH dikonfirmasi admin —
    // baris pending nampilin saldo terakhir yang confirmed (belum berubah),
    // biar keliatan jelas "ini belum resmi masuk saldo".
    let saldoBerjalan = 0;
    const withSaldo = rows.map(r => {
      if (r.dikonfirmasi_at) saldoBerjalan += Number(r.nominal || 0);
      return { ...r, saldo_setelah: r.dikonfirmasi_at ? saldoBerjalan : null };
    });

    return Response.json({
      riwayat: withSaldo.reverse(),
      saldo_awal: 0,
      saldo_akhir: saldoBerjalan,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
