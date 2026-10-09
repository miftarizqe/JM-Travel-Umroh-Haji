-- Kolom log perubahan saldo Sahabat di audit_log (dikonfirmasi user
-- 2026-10-02: setiap perubahan saldo wajib dicatat siapa, kapan, aktivitas,
-- saldo sebelum/sesudah, bukti). Kodenya (src/lib/audit.js, catatPerubahanSaldo
-- di src/lib/saldoSahabat.js) udah masuk di commit 7bfd115 tapi migrasinya
-- KETINGGALAN -- akibatnya SEMUA catatAudit error "Unknown column
-- 'subjek_user_id'" (ketemu user 2026-10-09 pas aktivasi akun Sahabat).
-- Kolom NULL semua: baris audit non-saldo tetap kosong di sini.
ALTER TABLE audit_log
  ADD COLUMN subjek_user_id VARCHAR(36) NULL AFTER keterangan,
  ADD COLUMN saldo_sebelum BIGINT NULL AFTER subjek_user_id,
  ADD COLUMN saldo_sesudah BIGINT NULL AFTER saldo_sebelum,
  ADD COLUMN bukti_path VARCHAR(255) NULL AFTER saldo_sesudah,
  ADD INDEX idx_subjek_user (subjek_user_id);
