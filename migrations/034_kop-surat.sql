USE jm_travel;

-- Kop surat (letterhead) di dokumen cetak (cetak-formulir-mitra,
-- cetak-pks-mitra) SEBELUMNYA hardcode nama perusahaan/telepon/email
-- terpisah dari alamat_kantor yang sudah ada di Pengaturan Umum — sekarang
-- digabung jadi 1 sumber kebenaran.
ALTER TABLE pengaturan
  ADD COLUMN nama_perusahaan VARCHAR(150) AFTER id,
  ADD COLUMN telepon_kantor VARCHAR(50) AFTER alamat_kantor,
  ADD COLUMN email_kantor VARCHAR(100) AFTER telepon_kantor;

UPDATE pengaturan SET
  nama_perusahaan = 'PT. Alkhalid Jaya Megah Tours & Travel',
  telepon_kantor = '(021) 7234343, 7222303',
  email_kantor = 'headoffice@jmtourtravel.com'
WHERE id = 1;
