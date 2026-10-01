-- Saldo awal yang bisa diisi admin PAS BIKIN/INPUT akun atau rekening
-- (dikonfirmasi user 2026-10-01) — sebelumnya cuma bisa diisi di momen
-- sempit (cashflow: cuma bulan pertama sistem; rekening 3-bank: gak ada
-- sama sekali).
--
-- cashflow_akun.saldo_awal: nilai starting point akun ini SAAT PERTAMA KALI
-- dibuat (bukan per-bulan) — dipakai sebagai fallback di pastikanPeriode()/
-- POST .../periode kalau akun ini belum pernah punya periode sebelumnya
-- (akun baru ditambah belakangan, bukan cuma skenario "bulan pertama sistem"
-- lagi). Begitu akun ini sudah punya 1 periode, rantai saldo_akhir periode
-- sebelumnya yang menang, kolom ini gak dipakai lagi buat akun itu.
ALTER TABLE cashflow_akun ADD COLUMN saldo_awal BIGINT NOT NULL DEFAULT 0;

-- rekening_ledger belum punya kolom, saldo awal untuk alkhalid/sahabat_baitullah
-- disimpan sebagai baris ledger biasa (sumber_tipe='saldo_awal_manual',
-- jenis='masuk') lewat endpoint baru POST /api/admin/finance/rekening/saldo-awal
-- — gak butuh migrasi skema tambahan, cuma dicatat di sini sebagai
-- penjelasan konvensi baru.
