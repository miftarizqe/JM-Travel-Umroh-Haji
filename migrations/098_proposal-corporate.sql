-- Proposal Corporate — pengganti template Canva yang manual buat pitch ke
-- calon corporate client. Beda dari Perjanjian Kerja Sama (dokumen legal
-- ber-tanda-tangan mitra), ini murni materi tawaran — jadi nomornya per
-- dokumen/instance (BUKAN dibekukan permanen ke 1 user kayak
-- no_perjanjian_kerjasama di migration-nomor-perjanjian.sql).
-- Dibatasi super_admin (lihat wajibSuperAdmin di src/lib/auth.js).
CREATE TABLE IF NOT EXISTS proposal_corporate (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomor_proposal VARCHAR(50) UNIQUE NOT NULL,
  nama_perusahaan VARCHAR(255) NOT NULL,
  alamat_perusahaan TEXT,
  nama_pic_perusahaan VARCHAR(150),
  kontak_pic_perusahaan VARCHAR(50),
  pic_kantor_nama VARCHAR(150),
  pic_kantor_kontak VARCHAR(50),
  kata_pengantar TEXT,
  struktur_organisasi JSON,
  program_ids JSON,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at)
);
