// Booking yang form-nya sudah lengkap + DP confirmed tapi materai+TTD fisik
// Perjanjian Jamaah-nya BELUM diproses admin — dipakai cluster "Perlu
// Perhatian" di admin dashboard sebagai daftar follow-up (siapa yang perlu
// diingetin TTD pas ke kantor/manasik). INI BUKAN GERBANG — jamaah TETAP
// boleh lanjut pelunasan begitu setuju_pks dicentang online, materai/TTD
// fisik beneran menyusul belakangan (dikonfirmasi user 2026-10-13, lihat
// perjanjianSelesai() di src/lib/bookingStage.js). Query di sini SENGAJA
// gak ikut filter setuju_pks — daftar ini berguna buat SEMUA booking yang
// belum ada scan-nya, baik yang udah setuju online maupun yang TTD fisik
// duluan di kantor tanpa pernah klik apa pun online. Checkout mandiri
// Program Sahabat Baitullah gak punya tahap ini sama sekali — dulu ikut
// kehitung, jadi notifnya nyala terus (2026-10-11).
export async function daftarPerjanjianBelumSelesai(pool) {
  const [rows] = await pool.query(
    `SELECT b.id, b.prog_name, b.setuju_pks, b.perjanjian_scan_path, b.jamaah_data,
            COALESCE(u.name, '-') AS nama, u.wa,
            ds.fase AS sig_fase, ds.metode AS sig_metode
     FROM bookings b
     LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
     LEFT JOIN programs p ON p.id = b.prog_id
     LEFT JOIN dokumen_signature ds ON ds.dokumen = 'jamaah' AND ds.ref_id = b.id
     WHERE b.status = 'active' AND b.dp_status = 'confirmed'
       AND b.form_filled >= b.form_total
       AND (p.publish_type IS NULL OR p.publish_type <> 'sahabat_baitullah')
     ORDER BY b.created_at ASC`
  );
  // Lembar materai+TTD fisik sekarang PER JAMAAH (jamaah_data[i].perjanjian_scan_path,
  // dikonfirmasi user 2026-10-13) — booking.perjanjian_scan_path cuma warisan
  // dokumen gabungan dari SEBELUM perubahan ini. Filter JS di sini (bukan
  // SQL) karena perlu cek "ada jamaah aktif yang belum discan" per baris,
  // JSON array gak gampang dibandingkan langsung di WHERE SQL.
  return rows.filter(b => {
    if (b.sig_fase === 'selesai') return false;
    // Dokumen lama gabungan ADA (warisan sebelum lembar per-jamaah) —
    // anggap booking ini udah ke-cover, gak perlu follow-up lagi.
    if (b.perjanjian_scan_path) return false;
    let jd = b.jamaah_data;
    if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
    const aktif = (Array.isArray(jd) ? jd : []).filter(j => j?.status_jamaah !== 'dibatalkan');
    return aktif.some(j => !j.perjanjian_scan_path);
  }).map(b => ({ id: b.id, prog_name: b.prog_name, setuju_pks: b.setuju_pks, nama: b.nama, wa: b.wa, sig_fase: b.sig_fase, sig_metode: b.sig_metode }));
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
