-- Nama jamaah utama/kontak per booking, diisi wajib sejak awal checkout/order
-- (bukan menunggu formulir jamaah lengkap) — supaya booking bisa dibedakan
-- langsung dari kartunya, terutama di dashboard agen/perwakilan di mana
-- "ordered_by"/pemesan bisa jadi akun agen sendiri, bukan jamaah yang berangkat.
ALTER TABLE bookings
  ADD COLUMN nama_jamaah VARCHAR(150) NULL AFTER jumlah_jamaah;
