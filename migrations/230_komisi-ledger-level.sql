-- Kolom level (generasi ujroh 1-5) di komisi_ledger — SUDAH dipakai kode
-- sejak 7bfd115 (INSERT ujroh Gen1-5 di /api/status-pendaftaran-sahabat
-- action=advance & SELECT di /api/sahabat/riwayat-saldo) tapi migration-nya
-- gak pernah dibuat. Akibatnya ACC & Aktifkan sahabat yang punya upline
-- sahabat aktif selalu 500 "Unknown column 'level'" (ditemukan user
-- 2026-10-15). NULL = baris non-ujroh-generasi (tabungan awal, HoP, dst).
ALTER TABLE komisi_ledger ADD COLUMN IF NOT EXISTS level TINYINT NULL AFTER keterangan;
