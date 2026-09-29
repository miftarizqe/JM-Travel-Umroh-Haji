-- Pengajuan setoran mandiri self-service (dikonfirmasi user 2026-09-29) —
-- sebelumnya admin WAJIB cek mutasi rekening BSI jamaah satu-satu tiap sore
-- (lihat /api/admin/sahabat/setoran-mandiri, POST manual). Sekarang jamaah
-- BISA (opsional, bukan wajib) unggah bukti transfer + nominal duluan lewat
-- sini, admin tinggal cocokkan sama mutasi & Setujui/Tolak — gak perlu lacak
-- semua akun secara blind lagi. Approve di sini yang beneran nulis baris
-- komisi_ledger jenis='setoran_mandiri_sahabat' (auto dikonfirmasi_at, sama
-- kayak entri manual admin) — endpoint manual lama TETAP hidup gak berubah,
-- buat kasus admin nemuin mutasi duluan tanpa jamaah pernah ngajuin di sini.
CREATE TABLE sahabat_setoran_mandiri_pengajuan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  nominal BIGINT NOT NULL,
  bukti_path VARCHAR(255) NOT NULL,
  bukti_nama VARCHAR(255) NULL,
  status ENUM('diajukan','disetujui','ditolak') NOT NULL DEFAULT 'diajukan',
  catatan_admin VARCHAR(255) NULL,
  diproses_oleh VARCHAR(36) NULL,
  diproses_at TIMESTAMP NULL,
  komisi_ledger_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
);
