-- Bank konten "Materi Presentasi" khusus Sejuta Baitullah — admin upload
-- bahan presentasi (kumpulan gambar slide, mis. hasil export PPT/PDF ke
-- JPG/PNG), tiap anggota koperasi aktif bisa LIHAT tapi TIDAK BISA UNDUH
-- (dikonfirmasi user 2026-09-03 — khawatir "program"/materi bisnis dicuri
-- kalau disebarluaskan bebas). Beda dari SEMUA upload lain di aplikasi ini:
-- filenya SENGAJA disimpan di luar public/ (folder private-uploads/ di root
-- project, lihat src/app/api/koperasi/materi/[id]/slide/[slideId]/route.js)
-- supaya gak ada URL statis yang bisa diakses langsung tanpa lewat cek role
-- di server — public/uploads/ selama ini cuma dilindungi "URL-nya gak
-- ketebak", bukan gerbang login beneran.
--
-- Jalankan: mysql -u root -p jm_travel < migration-materi-koperasi.sql

CREATE TABLE materi_koperasi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  judul VARCHAR(150) NOT NULL,
  deskripsi VARCHAR(500) NULL,
  urutan INT NOT NULL DEFAULT 0,
  aktif TINYINT NOT NULL DEFAULT 1,
  diupload_oleh VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (diupload_oleh) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE materi_koperasi_slide (
  id INT AUTO_INCREMENT PRIMARY KEY,
  materi_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (materi_id) REFERENCES materi_koperasi(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
