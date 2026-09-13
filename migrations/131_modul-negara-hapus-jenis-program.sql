-- modul_negara.jenis_program itu VESTIGIAL — kelihatan kayak ngebatesin modul
-- ini cuma bisa dipakai 1 jenis program tertentu, padahal kenyataannya TIDAK
-- PERNAH dibaca buat filter di mana pun (KalkulatorTerpadu.jsx nampilin
-- SELURUH katalog modul negara begitu program yang di-costing punya
-- `boleh_modul_negara=1`, gak peduli modul_negara.jenis_program-nya apa).
-- API-nya sempet nyiapin filter ?jenis_program=X tapi gak pernah dipanggil
-- dari client manapun. Field ini cuma bikin bingung (keliatan restriktif,
-- padahal enggak) — dikonfirmasi user, dihapus total (bukan disamarkan jadi
-- catatan doang).
--
-- Jalankan sekali di MySQL, database: jm_travel

ALTER TABLE modul_negara DROP COLUMN jenis_program;
