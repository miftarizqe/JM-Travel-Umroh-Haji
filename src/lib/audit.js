// Jejak audit approval admin — siapa, kapan, ngapain, ke target apa.
// `conn` boleh pool atau connection transaksi, sama seperti src/lib/notifikasi.js.
//
// Perubahan saldo Sahabat (dikonfirmasi user 2026-10-02: log aktivitas admin
// WAJIB untuk setiap perubahan saldo — siapa, kapan, aktivitas, saldo
// sebelum/sesudah, bukti): isi subjek_user_id + saldo_sebelum + saldo_sesudah
// (+ bukti_path kalau ada). Lihat catatPerubahanSaldo di src/lib/saldoSahabat.js.
export async function catatAudit(conn, {
  actor, aksi, target_type, target_id, keterangan,
  subjek_user_id = null, saldo_sebelum = null, saldo_sesudah = null, bukti_path = null,
}) {
  if (!actor?.id) return;
  await conn.query(
    `INSERT INTO audit_log (actor_id, actor_nama, aksi, target_type, target_id, keterangan,
                            subjek_user_id, saldo_sebelum, saldo_sesudah, bukti_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [actor.id, actor.name || null, aksi, target_type, String(target_id), keterangan || null,
      subjek_user_id, saldo_sebelum, saldo_sesudah, bukti_path]
  );
}
