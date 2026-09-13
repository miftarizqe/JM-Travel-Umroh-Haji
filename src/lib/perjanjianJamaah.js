// Booking yang form-nya sudah lengkap + DP confirmed tapi Perjanjian Jamaah
// belum selesai (materai + TTD, digital atau fisik) — dipakai cluster
// "Perlu Perhatian" di admin dashboard biar jamaah gak nyangkut di tahap ini
// tanpa admin sadar (mis. pilih fisik tapi scan-nya lupa diupload).
export async function daftarPerjanjianBelumSelesai(pool) {
  const [rows] = await pool.query(
    `SELECT b.id, b.prog_name, b.setuju_pks, b.perjanjian_scan_path,
            COALESCE(u.name, '-') AS nama, u.wa,
            ds.fase AS sig_fase, ds.metode AS sig_metode
     FROM bookings b
     LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
     LEFT JOIN dokumen_signature ds ON ds.dokumen = 'jamaah' AND ds.ref_id = b.id
     WHERE b.status = 'active' AND b.dp_status = 'confirmed'
       AND b.form_filled >= b.form_total
       AND NOT (b.setuju_pks = 1 AND (b.perjanjian_scan_path IS NOT NULL OR ds.fase = 'selesai'))
     ORDER BY b.created_at ASC`
  );
  return rows;
}

// Pembatalan yang sudah disetujui + ada nominal refund, tapi bukti TF-nya
// belum diunggah admin — lihat POST /api/admin/pembatalan/[id]/bukti-refund.
export async function daftarRefundBelumDitransfer(pool) {
  const [rows] = await pool.query(
    `SELECT p.id, p.booking_id, p.refund_nominal, b.prog_name,
            COALESCE(u.name, '-') AS nama
     FROM pembatalan p
     LEFT JOIN bookings b ON b.id = p.booking_id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.status = 'disetujui' AND p.refund_nominal > 0 AND p.bukti_refund_path IS NULL
     ORDER BY p.diproses_at ASC`
  );
  return rows;
}

// Ajuan Kalkulator Perwakilan (quote HPP+margin sendiri) yang menunggu
// review admin — dipakai cluster admin dashboard.
export async function daftarAjuanKalkulatorPerwakilan(pool) {
  const [rows] = await pool.query(
    `SELECT l.id, l.paket, l.kamar, l.harga_jual_perwakilan, l.nama_quote,
            u.name AS perwakilan_nama, t.nama AS template_nama
     FROM kalkulator_perwakilan_lead l
     JOIN users u ON u.id = l.perwakilan_id
     JOIN kalkulator_template_publik t ON t.id = l.template_id
     WHERE l.status = 'diajukan'
     ORDER BY l.diajukan_at ASC`
  );
  return rows;
}

// Pengajuan penyesuaian harga (kenaikan tiket/force majeure) yang masih
// menunggu persetujuan jamaah — dipakai cluster admin dashboard.
export async function daftarPenyesuaianHargaPending(pool) {
  const [rows] = await pool.query(
    `SELECT ph.id, ph.booking_id, ph.harga_lama, ph.harga_baru, ph.alasan, ph.diajukan_at,
            b.prog_name, COALESCE(u.name, '-') AS nama, u.wa
     FROM booking_penyesuaian_harga ph
     JOIN bookings b ON b.id = ph.booking_id
     LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
     WHERE ph.status = 'pending'
     ORDER BY ph.diajukan_at ASC`
  );
  return rows;
}
