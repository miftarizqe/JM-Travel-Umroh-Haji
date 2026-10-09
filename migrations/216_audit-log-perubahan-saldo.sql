-- Kolom log perubahan saldo Sahabat di audit_log (dikonfirmasi user
-- 2026-10-02: setiap perubahan saldo wajib dicatat siapa, kapan, aktivitas,
-- saldo sebelum/sesudah, bukti). Kodenya (src/lib/audit.js, catatPerubahanSaldo
-- di src/lib/saldoSahabat.js) udah masuk di commit 7bfd115 tapi migrasinya
-- KETINGGALAN -- akibatnya SEMUA catatAudit error "Unknown column
-- 'subjek_user_id'" (ketemu user 2026-10-09 pas aktivasi akun Sahabat).
-- Kolom NULL semua: baris audit non-saldo tetap kosong di sini.
-- IF NOT EXISTS: di dev & prod kolomnya sempat di-ALTER manual (tanpa index & tanpa
-- dicatat di schema_migrations), jadi file ini harus aman dijalankan ulang (2026-10-09).
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS subjek_user_id VARCHAR(36) NULL AFTER keterangan,
  ADD COLUMN IF NOT EXISTS saldo_sebelum BIGINT NULL AFTER subjek_user_id,
  ADD COLUMN IF NOT EXISTS saldo_sesudah BIGINT NULL AFTER saldo_sebelum,
  ADD COLUMN IF NOT EXISTS bukti_path VARCHAR(255) NULL AFTER saldo_sesudah,
  ADD INDEX IF NOT EXISTS idx_subjek_user (subjek_user_id);
