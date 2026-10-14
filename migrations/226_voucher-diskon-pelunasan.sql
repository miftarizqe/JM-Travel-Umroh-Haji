-- Voucher yang dipakai pas pelunasan (bukan checkout) cuma mengecilkan
-- `amount` yang disetor jamaah, gak pernah mengurangi bookings.total_harga
-- -- begitu cicilan pelunasan (migration 223-225) mulai nge-cek SUM(payments
-- type='lunas' confirmed) harus nutup penuh total_harga-dp_amount, booking
-- yang pelunasannya pakai voucher jadi gak akan PERNAH ke-tandain 'paid'
-- (sisanya nyangkut di angka diskon selamanya). Simpan nominal diskon di
-- payment-nya sendiri biar PATCH /api/payments bisa ngurangin total_harga
-- booking pas approve (SAMA PERSIS pola penyesuaian harga yang udah ada).
ALTER TABLE payments
  ADD COLUMN voucher_kode VARCHAR(30) NULL AFTER kode_unik,
  ADD COLUMN diskon_voucher DECIMAL(12,2) NULL DEFAULT NULL AFTER voucher_kode;
