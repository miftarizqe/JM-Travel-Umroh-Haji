-- Bikin DB user KHUSUS buat aplikasi, ganti dari 'root' yang dipakai sekarang.
-- Hak aksesnya cuma DML (SELECT/INSERT/UPDATE/DELETE) ke database jm_travel
-- aja — SENGAJA gak dikasih DROP/ALTER/CREATE/GRANT dll, biar kalau ada celah
-- (mis. SQL injection) di aplikasi, attacker gak bisa hapus/ubah struktur
-- tabel atau bikin user baru. Migrasi skema (migration-*.sql) tetap dijalanin
-- manual pakai root, bukan lewat user ini.
--
-- GANTI 'GANTI_PASSWORD_KUAT_DI_SINI' sebelum dijalankan — pakai password
-- baru yang kuat & beda dari password root.

CREATE USER 'jm_travel_app'@'localhost' IDENTIFIED BY 'GANTI_PASSWORD_KUAT_DI_SINI';
GRANT SELECT, INSERT, UPDATE, DELETE ON jm_travel.* TO 'jm_travel_app'@'localhost';
FLUSH PRIVILEGES;
