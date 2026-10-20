-- ============================================================
-- MIGRATION: Referral permanen jamaah (agen) — mirror migration 166
-- (perekrut_perwakilan_jamaah_id). Diisi SEKALI saat registrasi
-- (role='jamaah' + link /a/[kode] valid dari localStorage ref_agen),
-- TIDAK PERNAH diubah lagi lewat UI/API manapun (termasuk admin) —
-- kalau salah input, satu-satunya jalur perbaikan adalah runbook
-- manual super_admin yang WAJIB dicatat ke audit_log, bukan lewat
-- endpoint/tombol.
--
-- Dikonfirmasi user 2026-10-20: sebelum migration ini, referral agen
-- CUMA tag sementara di localStorage (ref_agen) -- ilang kalau beda
-- device/browser/cache kehapus, atau jamaah checkout lewat jalur lain.
-- Jamaah yang daftar AKUN lewat link agen sekarang dikunci permanen ke
-- agen itu, server maksa pakai kolom ini di buatSatuBooking (lihat
-- src/lib/booking.js) apapun yang dikirim/dipilih manual di checkout.
-- ============================================================

ALTER TABLE users
  ADD COLUMN perekrut_agen_jamaah_id VARCHAR(36) NULL
    COMMENT 'Agen yg mereferensikan jamaah ini SAAT REGISTRASI (lewat link /a/[kode]) — permanen, immutable. Dipakai maksa referral_agen_id di buatSatuBooking, bukan cuma default localStorage.';

CREATE INDEX idx_users_perekrut_agen_jamaah ON users (perekrut_agen_jamaah_id);

-- ============================================================
-- RUNBOOK KOREKSI DARURAT (super_admin only, BUKAN lewat UI/endpoint)
-- Dipakai HANYA kalau ada kesalahan data-entry pada kolom permanen di
-- atas (link referral salah, dsb). WAJIB dicatat manual ke tabel
-- audit_log (siapa, kapan, alasan, nilai lama & baru) SEBELUM query
-- ini dijalankan.
--
--   UPDATE users SET perekrut_agen_jamaah_id = '<id_agen_baru>'
--   WHERE id = '<id_jamaah>';
-- ============================================================
