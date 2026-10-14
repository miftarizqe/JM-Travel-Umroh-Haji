-- Nandain Invoice "Paid" sekarang WAJIB nyertain bukti transfer/pembayaran
-- (dikonfirmasi user 2026-10-14: "jangan asal-asalan bikin lunas, admin
-- harus menyertakan bukti TF or something") -- sebelumnya cuma toggle
-- klik doang tanpa bukti apa pun, rawan dipencet asal. Begitu ditandai
-- Paid juga GAK BISA dibalikin lagi ke Unpaid (one-way lock, enforced di
-- server bukan di sini) -- status yang udah beres gak boleh diutak-atik.
ALTER TABLE invoice_kwitansi
  ADD COLUMN bukti_lunas_path VARCHAR(255) NULL AFTER scan_fisik_uploaded_at,
  ADD COLUMN bukti_lunas_nama VARCHAR(255) NULL AFTER bukti_lunas_path;
