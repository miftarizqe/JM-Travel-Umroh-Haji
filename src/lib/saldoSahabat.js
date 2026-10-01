import { catatAudit } from '@/lib/audit';

// Jenis komisi_ledger yang membentuk saldo tabungan umroh Sahabat (yang sudah
// dikonfirmasi). SAMA dengan jenisSaldo di jm-travel-api (internal/sahabat) —
// ubah bersamaan.
export const JENIS_SALDO_SAHABAT = [
  'komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat',
  'tabungan_awal_sahabat', 'head_of_program_registrasi', 'pemakaian_saldo_sahabat',
  'setoran_mandiri_sahabat', 'koreksi_saldo_sahabat',
];

export async function saldoSahabat(conn, userId) {
  const [[r]] = await conn.query(
    `SELECT COALESCE(SUM(nominal), 0) AS saldo FROM komisi_ledger
     WHERE penerima_id = ? AND dikonfirmasi_at IS NOT NULL
       AND jenis IN (${JENIS_SALDO_SAHABAT.map(() => '?').join(',')})`,
    [userId, ...JENIS_SALDO_SAHABAT]
  );
  return Number(r?.saldo || 0);
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
