-- Perluasan dokumen_cif_fisik_diterima_at (migration 157) ke 2 dokumen
-- lainnya (Surat Pemblokiran & SPK-AK) — dikonfirmasi user 2026-10-03:
-- sejak scan-upload gak lagi jadi syarat/sinyal utama (SENGAJA opsional,
-- boleh nyusul, lihat status-pendaftaran-sahabat/route.js), tracking yang
-- beneran berguna buat admin itu "dokumen fisik aslinya udah nyampe di
-- kantor apa belum" per-dokumen, bukan "udah di-scan jamaah apa belum" —
-- jamaah yang pilih metode TTD "Datang Kantor" juga gak butuh baris ini
-- sama sekali (dokumennya ditandatangani & diserahkan langsung di tempat).
ALTER TABLE users
  ADD COLUMN dokumen_pemblokiran_fisik_diterima_at TIMESTAMP NULL AFTER dokumen_cif_fisik_diterima_at,
  ADD COLUMN dokumen_spk_ak_fisik_diterima_at TIMESTAMP NULL AFTER dokumen_pemblokiran_fisik_diterima_at;
