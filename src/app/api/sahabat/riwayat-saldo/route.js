import pool from '@/lib/db';
import { wajibPemilikAtauAdminHopSahabat } from '@/lib/hopAuth';

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

    const auth = await wajibPemilikAtauAdminHopSahabat(request, sahabatId);
    if (auth.error) return auth.error;

    // Cuma baris yang UDAH dikonfirmasi admin (dikonfirmasi user
    // 2026-10-08, "kalo belom di acc admin maka jangan masuk dulu ke
    // cashflow tabungan") -- sebelumnya baris pending ikut nongol di sini
    // campur sama yang confirmed, bikin bingung "ini udah masuk apa
    // belum". Baris pending sekarang cuma muncul di tab Forecast
    // ("Menunggu Konfirmasi Admin", lihat /api/sahabat/dashboard) --
    // Cashflow jadi murni rekening koran yang BENERAN udah kejadian.
    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.ref_id, kl.nominal, kl.keterangan, kl.dikonfirmasi_at, kl.bukti_tf_admin_path, kl.created_at,
              kl.level, pendaftar.name AS nama_pendaftar
       FROM komisi_ledger kl
       LEFT JOIN users pendaftar
         ON pendaftar.id = kl.ref_id AND kl.jenis IN ('komisi_sahabat','head_of_program_registrasi')
       WHERE kl.penerima_id = ? AND kl.jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat','koreksi_saldo_sahabat')
             AND kl.dikonfirmasi_at IS NOT NULL
       ORDER BY kl.created_at ASC, kl.id ASC`,
      [sahabatId]
    );

    let saldoBerjalan = 0;
    const withSaldo = rows.map(r => {
      saldoBerjalan += Number(r.nominal || 0);
      return { ...r, saldo_setelah: saldoBerjalan };
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
