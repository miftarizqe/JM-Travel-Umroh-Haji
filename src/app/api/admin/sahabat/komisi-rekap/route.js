import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat } from '@/lib/hopAuth';

// GET /api/admin/sahabat/komisi-rekap?pengajuan_id=X — rekap ujroh Sahabat
// Baitullah lintas semua penerima, dipakai buat /admin/cetak-rekap-ujroh
// (dokumen pengajuan mingguan ke direktur sebelum TF beneran dieksekusi).
// TANPA `pengajuan_id`: perilaku LAMA — semua yang masih pending & belum
// masuk batch manapun (preview live, dipertahankan buat kompatibilitas).
// DENGAN `pengajuan_id` (2026-08-30, dipakai print dari batch tersimpan
// /api/admin/sahabat/pengajuan-ujroh): rekap dari SNAPSHOT batch itu
// spesifik — nomor rekening tabungan umroh diikutkan, itu tujuan TF
// beneran (dikonfirmasi user, bukan rekening BSI biasa/umum).
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const pengajuanId = searchParams.get('pengajuan_id');

    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.nominal, kl.keterangan, kl.created_at, kl.dikonfirmasi_at, kl.bukti_tf_admin_path,
              u.id AS penerima_id, u.name AS penerima_nama, u.kode_unik, u.role AS penerima_role,
              u.bank, u.no_rekening, u.nama_pemilik_rekening, u.no_rekening_tabungan_umroh
       FROM komisi_ledger kl
       JOIN users u ON u.id = kl.penerima_id
       WHERE ${pengajuanId ? 'kl.pengajuan_ujroh_id = ?' : "kl.dikonfirmasi_at IS NULL AND kl.pengajuan_ujroh_id IS NULL"}
         AND kl.jenis IN ('komisi_sahabat','closing_langsung_sahabat','referral_closing_reguler_sahabat','tabungan_awal_sahabat','head_of_program_registrasi')
       -- 'tabungan_awal_sahabat' TETAP di list ini (beda dari JENIS_UJROH di
       -- pengajuan-ujroh/route.js) — dengan pengajuan_id, ini nampilin
       -- SNAPSHOT batch LAMA yang mungkin masih punya baris tabungan_awal
       -- dari sebelum 2026-09-30; tanpa pengajuan_id (preview live), baris
       -- ini gak akan pernah lagi muncul karena lahir dikonfirmasi_at NOW().
       ORDER BY u.name ASC, kl.created_at ASC`,
      pengajuanId ? [pengajuanId] : []
    );

    const kelompokMap = new Map();
    for (const r of rows) {
      if (!kelompokMap.has(r.penerima_id)) {
        kelompokMap.set(r.penerima_id, {
          penerima_id: r.penerima_id,
          penerima_nama: r.penerima_nama,
          kode_unik: r.kode_unik,
          penerima_role: r.penerima_role,
          bank: r.bank,
          no_rekening: r.no_rekening,
          nama_pemilik_rekening: r.nama_pemilik_rekening,
          no_rekening_tabungan_umroh: r.no_rekening_tabungan_umroh,
          items: [],
          subtotal: 0,
        });
      }
      const grp = kelompokMap.get(r.penerima_id);
      grp.items.push({
        id: r.id, jenis: r.jenis, nominal: r.nominal, keterangan: r.keterangan, created_at: r.created_at,
        dikonfirmasi_at: r.dikonfirmasi_at, bukti_tf_admin_path: r.bukti_tf_admin_path,
      });
      grp.subtotal += Number(r.nominal || 0);
    }
    // Head of Program selalu ditaruh paling atas, sisanya dari subtotal
    // terbesar ke terkecil (dikonfirmasi user 2026-10-06) — bukan urut nama.
    const kelompok = [...kelompokMap.values()].sort((a, b) => {
      const aHop = a.penerima_role === 'hop';
      const bHop = b.penerima_role === 'hop';
      if (aHop !== bHop) return aHop ? -1 : 1;
      if (b.subtotal !== a.subtotal) return b.subtotal - a.subtotal;
      return a.penerima_nama.localeCompare(b.penerima_nama);
    });
    // Rekening & bukti TF cuma buat ADMIN ASLI (dikonfirmasi user 2026-10-05
    // & 2026-10-06, SENGAJA digeneralisasi gak cuma cek role 'hop' doang —
    // siapapun yang bukan admin/super_admin asli, gak boleh tau nomor
    // rekening atau lihat bukti transfernya, cuma kode_unik & nominal,
    // termasuk role non-admin manapun yang nanti bisa jadi punya akses GET
    // ke endpoint ini lewat wajibAdminAtauHopSahabat). kode_unik TETAP ada,
    // cukup buat identifikasi tanpa bocorin data sensitif.
    if (!['admin', 'super_admin'].includes(auth.user.role)) {
      for (const k of kelompok) {
        k.bank = null; k.no_rekening = null; k.nama_pemilik_rekening = null; k.no_rekening_tabungan_umroh = null;
        for (const it of k.items) it.bukti_tf_admin_path = null;
      }
    }
    for (const k of kelompok) delete k.penerima_role;
    const grandTotal = kelompok.reduce((s, k) => s + k.subtotal, 0);

    let pengajuan = null;
    if (pengajuanId) {
      const [[p]] = await pool.query('SELECT * FROM pengajuan_ujroh WHERE id = ?', [pengajuanId]);
      pengajuan = p || null;
    }

    // Periode selalu ada di dokumen, baik dari batch tersimpan (pengajuan)
    // MAUPUN preview live (dihitung langsung dari rentang created_at baris
    // yang lagi ditampilkan) — dikonfirmasi user 2026-09-02, dokumen
    // pengajuan HARUS jelas periodenya, gak cuma "dicetak tanggal X".
    const periode = pengajuan
      ? { mulai: pengajuan.periode_mulai, selesai: pengajuan.periode_selesai }
      : rows.length > 0
        ? {
            mulai: rows.reduce((min, r) => (!min || r.created_at < min) ? r.created_at : min, null),
            selesai: rows.reduce((max, r) => (!max || r.created_at > max) ? r.created_at : max, null),
          }
        : null;

    return Response.json({
      kelompok,
      jumlah_baris: rows.length,
      grand_total: grandTotal,
      generated_at: new Date(),
      pengajuan,
      periode,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
