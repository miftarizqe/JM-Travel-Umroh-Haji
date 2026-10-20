-- Saldo Deposit bisa motong SEBAGIAN pembayaran (DP/pelunasan), gak harus
-- nutup penuh (dikonfirmasi user 2026-10-20). Kolom ini nandain payment row
-- mana yang (sebagian/semua) didanai dari Saldo Deposit, bukan transfer bank
-- biasa -- dipakai admin UI buat skip "Lihat Bukti" (gak ada bukti transfer
-- buat dana yang sumbernya saldo).
ALTER TABLE payments
  ADD COLUMN sumber_dana ENUM('transfer', 'saldo_deposit') NOT NULL DEFAULT 'transfer' AFTER bukti_nama;
