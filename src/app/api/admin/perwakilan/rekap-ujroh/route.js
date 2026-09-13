import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

// GET /api/admin/perwakilan/rekap-ujroh?pengajuan_id=X — rekap ujroh
// perwakilan buat 1 pengajuan, dipakai halaman detail admin & cetak. Mirror
// /api/admin/sahabat/komisi-rekap, TAPI SELALU butuh pengajuan_id (gak ada
// mode "preview live" — pencairan ini per program, bukan per periode
// tanggal, jadi gak ada konsep "semua yang pending" tanpa milih program dulu).
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const pengajuanId = searchParams.get('pengajuan_id');
    if (!pengajuanId) return Response.json({ error: 'pengajuan_id wajib diisi' }, { status: 400 });

    const [[pengajuan]] = await pool.query(
      `SELECT pup.*, p.name AS prog_name, p.tanggal_berangkat
       FROM pengajuan_ujroh_perwakilan pup
       LEFT JOIN programs p ON p.id = pup.prog_id
       WHERE pup.id = ?`,
      [pengajuanId]
    );
    if (!pengajuan) return Response.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 });

    const [rows] = await pool.query(
      `SELECT kl.id, kl.jenis, kl.nominal, kl.keterangan, kl.created_at, kl.dikonfirmasi_at, kl.bukti_tf_admin_path,
              u.id AS penerima_id, u.name AS penerima_nama, u.kode_unik,
              u.bank, u.no_rekening, u.nama_pemilik_rekening
       FROM komisi_ledger kl
       JOIN users u ON u.id = kl.penerima_id
       WHERE kl.pengajuan_ujroh_perwakilan_id = ?
       ORDER BY u.name ASC, kl.created_at ASC`,
      [pengajuanId]
    );

    const kelompokMap = new Map();
    for (const r of rows) {
      if (!kelompokMap.has(r.penerima_id)) {
        kelompokMap.set(r.penerima_id, {
          penerima_id: r.penerima_id,
          penerima_nama: r.penerima_nama,
          kode_unik: r.kode_unik,
          bank: r.bank,
          no_rekening: r.no_rekening,
          nama_pemilik_rekening: r.nama_pemilik_rekening,
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
    const kelompok = [...kelompokMap.values()];
    const grandTotal = kelompok.reduce((s, k) => s + k.subtotal, 0);

    return Response.json({
      kelompok,
      jumlah_baris: rows.length,
      grand_total: grandTotal,
      generated_at: new Date(),
      pengajuan,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
