import { catatAudit } from '@/lib/audit';

// Jenis komisi_ledger yang membentuk saldo tabungan umroh Sahabat (yang sudah
// dikonfirmasi). SAMA dengan jenisSaldo di jm-travel-api (internal/sahabat) —
// ubah bersamaan.
export const JENIS_SALDO_SAHABAT = [
  'komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat',
  'tabungan_awal_sahabat', 'head_of_program_registrasi', 'pemakaian_saldo_sahabat',
  'setoran_mandiri_sahabat', 'koreksi_saldo_sahabat',
];

// 'pemakaian_saldo_sahabat' (nominal negatif, dicatat SAAT checkout mandiri
// program eksklusif) langsung ikut kepotong TANPA nunggu dikonfirmasi_at
// (dikonfirmasi user 2026-10-08) -- mirip hold otorisasi bank: begitu
// jamaah checkout, saldo yang kepake gak boleh kelihatan "tersedia" lagi
// buat checkout LAIN sebelum admin sempat confirm, soalnya admin baru
// beneran transfer uangnya belakangan (butuh waktu). Semua jenis PEMASUKAN
// lain tetap nunggu dikonfirmasi_at kayak biasa -- cuma PENGELUARAN yang
// efeknya instan. Kalau booking terkait dibatalkan sebelum sempat
// dikonfirmasi, baris ini WAJIB dihapus (lihat lepasHoldSaldoSahabat di
// bawah) biar saldo gak nyangkut ketahan selamanya.
export async function saldoSahabat(conn, userId) {
  const [[r]] = await conn.query(
    `SELECT COALESCE(SUM(nominal), 0) AS saldo FROM komisi_ledger
     WHERE penerima_id = ?
       AND jenis IN (${JENIS_SALDO_SAHABAT.map(() => '?').join(',')})
       AND (dikonfirmasi_at IS NOT NULL OR jenis = 'pemakaian_saldo_sahabat')`,
    [userId, ...JENIS_SALDO_SAHABAT]
  );
  return Number(r?.saldo || 0);
}

// Lepas hold saldo checkout mandiri yang BELUM dikonfirmasi admin, dipanggil
// pas booking-nya dibatalkan (dikonfirmasi user 2026-10-08) -- kalau sudah
// dikonfirmasi (admin udah beneran transfer/acc), JANGAN dihapus di sini,
// itu kasus beda (butuh alur refund, bukan sekadar lepas hold reservasi).
export async function lepasHoldSaldoSahabat(conn, bookingId) {
  await conn.query(
    "DELETE FROM komisi_ledger WHERE booking_id = ? AND jenis = 'pemakaian_saldo_sahabat' AND dikonfirmasi_at IS NULL",
    [bookingId]
  );
}

// Log aktivitas WAJIB untuk setiap perubahan saldo Sahabat (dikonfirmasi user
// 2026-10-02): siapa, kapan, aktivitas, saldo sebelum/sesudah, bukti.
// Pakai: const sebelum = await saldoSahabat(conn, id); ...ubah saldo...;
//        await catatPerubahanSaldo(conn, { actor, userId: id, saldoSebelum: sebelum, ... });
// Saldo sesudah dihitung ulang dari DB (bukan dari selisih) biar pasti akurat.
export async function catatPerubahanSaldo(conn, {
  actor, userId, saldoSebelum, aksi, target_type, target_id, keterangan, bukti_path = null,
}) {
  if (!userId) {
    // Bukan perubahan saldo Sahabat (mis. jenis di luar saldo) — tetap dicatat tanpa angka saldo.
    await catatAudit(conn, { actor, aksi, target_type, target_id, keterangan, bukti_path });
    return null;
  }
  const saldoSesudah = await saldoSahabat(conn, userId);
  await catatAudit(conn, {
    actor, aksi, target_type, target_id, keterangan,
    subjek_user_id: userId, saldo_sebelum: saldoSebelum, saldo_sesudah: saldoSesudah, bukti_path,
  });
  return saldoSesudah;
}
