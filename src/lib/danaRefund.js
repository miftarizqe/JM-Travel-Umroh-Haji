// Dana yang masih bisa direfund dari 1 booking — dipakai bareng sama
// eksekusi pembatalan (batas atas refund, /api/pembatalan) dan modal detail
// booking admin (info buat admin sebelum isi nominal), biar angka yang
// dilihat admin = angka yang divalidasi server.
//
// totalDibayar  = uang yang BENERAN masuk, dihitung live.
// sudahDirefund = refund pembatalan yang udah disetujui sebelumnya di booking
//                 yang sama (batal per-jamaah bisa berkali-kali).
// kecualiPembatalanId: baris pembatalan yang lagi dieksekusi, jangan ikut
//                 dihitung sebagai "sudah direfund".
//
// Program Sahabat Baitullah eksklusif (checkout mandiri) dibayar dari saldo
// tabungan + transfer pribadi buat sisanya, dan kalau batal semuanya
// DIKEMBALIKAN KE SALDO tabungan (dikonfirmasi user 2026-10-16), bukan
// transfer tunai. totalDibayar-nya beda rumus:
//   - saldo terpakai yang udah di-ACC (pemakaian_saldo_sahabat confirmed).
//     Hold yang BELUM di-ACC gak dihitung — itu cukup dihapus
//     (lepasHoldSaldoSahabat), saldo otomatis balik sendiri; dilaporin
//     terpisah sebagai holdBelumAcc buat info.
//   - transfer pribadi yang udah di-ACC = payments confirmed yang PUNYA
//     bukti. Baris payments 'lunas' sintetis (saldo nutup penuh, dibuat
//     cekDanFinalisasiLunasSahabat tanpa bukti) itu cerminan saldo yang
//     sama, JANGAN dihitung lagi.
export async function infoDanaRefund(db, bookingId, kecualiPembatalanId = null, { sahabatEksklusif = false } = {}) {
  let totalDibayar;
  let holdBelumAcc = 0;
  if (sahabatEksklusif) {
    const [[saldo]] = await db.query(
      `SELECT COALESCE(-SUM(CASE WHEN dikonfirmasi_at IS NOT NULL THEN nominal END), 0) AS acc,
              COALESCE(-SUM(CASE WHEN dikonfirmasi_at IS NULL THEN nominal END), 0) AS hold
       FROM komisi_ledger WHERE booking_id = ? AND jenis = 'pemakaian_saldo_sahabat'`,
      [bookingId]
    );
    const [[tf]] = await db.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE booking_id = ? AND status = 'confirmed' AND bukti_path IS NOT NULL",
      [bookingId]
    );
    totalDibayar = Number(saldo.acc || 0) + Number(tf.total || 0);
    holdBelumAcc = Number(saldo.hold || 0);
  } else {
    const [[bayar]] = await db.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE booking_id = ? AND status = 'confirmed'",
      [bookingId]
    );
    totalDibayar = Number(bayar.total || 0);
  }
  const [[sudah]] = await db.query(
    "SELECT COALESCE(SUM(refund_nominal),0) AS total FROM pembatalan WHERE booking_id = ? AND status = 'disetujui' AND id <> ?",
    [bookingId, kecualiPembatalanId ?? 0]
  );
  const sudahDirefund = Number(sudah.total || 0);
  return {
    totalDibayar, sudahDirefund, holdBelumAcc,
    sisaBisaDirefund: Math.max(0, totalDibayar - sudahDirefund),
  };
}

// Porsi refund otomatis (dipakai "Kesalahan JM Travel" & pengembalian ke
// saldo Sahabat): seluruh sisa kalau batal booking utuh / jamaah aktif
// terakhir, porsi 1 orang kalau batal per-jamaah — bobot harga_jual kalau
// booking pernah diedit per-orang, rata kalau seragam. Dipakai server DAN
// form admin (estimasi) biar angkanya sama persis.
export function porsiRefund(entries, jamaahIdx, sisaBisaDirefund) {
  const aktif = (entries || []).map((e, i) => ({ e, i })).filter(({ e }) => e?.status_jamaah !== 'dibatalkan');
  if (jamaahIdx == null || aktif.length <= 1) return sisaBisaDirefund;
  const pakaiHarga = aktif.every(({ e }) => e.harga_jual != null && Number(e.harga_jual) > 0);
  const bobot = ({ e }) => (pakaiHarga ? Number(e.harga_jual) : 1);
  const totalBobot = aktif.reduce((s, x) => s + bobot(x), 0);
  const target = aktif.find(x => x.i === Number(jamaahIdx));
  return totalBobot > 0 && target ? Math.round(sisaBisaDirefund * bobot(target) / totalBobot) : 0;
}
