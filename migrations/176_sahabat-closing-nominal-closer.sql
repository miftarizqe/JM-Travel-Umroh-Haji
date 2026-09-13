-- Ujroh untuk jamaah Sahabat Baitullah yang closing (dikonfirmasi user
-- 2026-09-06) — dulu hardcode CLOSER_FIXED_NOMINAL=1jt di src/lib/closing.js,
-- sekarang per-program (mirror sahabat_closing_langsung_hop_nominal),
-- direkomendasikan default Rp1.000.000 pas bikin program baru (bisa diedit),
-- fallback ke 1jt kalau program lama belum diisi. Berlaku pas Sahabat
-- Baitullah closing-in jamaah LAIN ke program publish_type='public' —
-- section ini SENGAJA cuma muncul di program publik (dikonfirmasi user),
-- karena publish_type='sahabat_baitullah' emang cuma bisa dicheckout jamaah
-- Sahabat Baitullah sendiri, gak ada skenario "closing jamaah lain" di situ.
ALTER TABLE programs ADD COLUMN sahabat_closing_nominal_closer BIGINT NULL AFTER sahabat_closing_langsung_hop_nominal;
