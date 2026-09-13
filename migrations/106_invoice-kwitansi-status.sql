-- Status settle buat Invoice (DP/Pelunasan). Dokumen yang AUTO-generate
-- (dari payment yang udah confirmed) langsung 'lunas' pas dibuat — itu emang
-- fungsinya sbg tanda terima. Dokumen MANUAL default 'belum_dibayar' krn
-- bisa jadi beneran tagihan yang dikirim SEBELUM dibayar, admin tandai
-- 'lunas' manual pas uangnya masuk. Kwitansi gak pakai kolom ini — status
-- lunas/partial-nya udah kebaca dari nominal_pelunasan (null = belum lunas).
ALTER TABLE invoice_kwitansi
  ADD COLUMN status ENUM('belum_dibayar','lunas') NOT NULL DEFAULT 'belum_dibayar';
