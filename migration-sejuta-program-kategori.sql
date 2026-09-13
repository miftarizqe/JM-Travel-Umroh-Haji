ALTER TABLE programs
  MODIFY COLUMN publish_type ENUM('public','perwakilan','private','koperasi') NOT NULL DEFAULT 'public';

ALTER TABLE perlengkapan_jamaah
  ADD COLUMN kategori_program ENUM('umum','sejuta_baitullah') NOT NULL DEFAULT 'umum';
