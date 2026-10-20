-- Saldo Deposit umum (dikonfirmasi user 2026-10-20): jamaah yang batalin
-- booking program REGULER atas kemauan sendiri (bukan kesalahan JM Travel)
-- gak bisa direfund tunai sesuai S&K, tapi sebelumnya dipaksa langsung
-- milih program pengganti saat itu juga. Sekarang ada opsi ketiga: DP yang
-- hangus dikonversi jadi SALDO DEPOSIT -- disimpan di akun jamaah, GAK ADA
-- KEDALUARSA, BISA DIPAKAI ATAS NAMA SIAPA SAJA (booking buat orang lain)
-- kapan pun dia siap checkout program lain.
--
-- Ledger terpisah dari komisi_ledger (bukan jenis komisi/ujroh, ini duit
-- jamaah sendiri) -- mirror pola saldoSahabat.js tapi TIDAK terikat ke
-- rekening BSI mana pun, murni internal.
CREATE TABLE deposit_saldo_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL COMMENT 'Pemilik saldo',
  booking_id_asal VARCHAR(20) NULL COMMENT 'Booking yang DP-nya dikonversi jadi saldo ini (nominal positif)',
  booking_id_pakai VARCHAR(20) NULL COMMENT 'Booking baru yang makai saldo ini buat bayar DP (nominal negatif)',
  nominal BIGINT NOT NULL COMMENT 'Positif = kredit (dari pembatalan/koreksi admin), negatif = pemakaian',
  jenis ENUM('konversi_dp_batal', 'pemakaian', 'koreksi_admin') NOT NULL,
  keterangan VARCHAR(255) NULL,
  dibuat_oleh VARCHAR(36) NULL COMMENT 'Admin yang approve konversi/koreksi — NULL kalau jamaah sendiri yang pakai saldo checkout',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_deposit_saldo_user ON deposit_saldo_ledger (user_id);
CREATE INDEX idx_deposit_saldo_booking_asal ON deposit_saldo_ledger (booking_id_asal);
CREATE INDEX idx_deposit_saldo_booking_pakai ON deposit_saldo_ledger (booking_id_pakai);

-- Metode pengembalian dana pembatalan: transfer tunai (perilaku lama) ATAU
-- konversi ke saldo deposit (baru). Sahabat Baitullah eksklusif TETAP pakai
-- jalur saldoSahabat yang sudah ada (gak kesentuh kolom ini, lihat
-- src/app/api/pembatalan/route.js eksekusiPembatalan).
ALTER TABLE pembatalan
  ADD COLUMN refund_metode ENUM('transfer', 'saldo_deposit') NOT NULL DEFAULT 'transfer' AFTER penyebab;
