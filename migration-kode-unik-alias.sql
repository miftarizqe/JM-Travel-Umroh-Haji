-- Kolom alias: menyimpan kode_unik LAMA (salah, sudah dicetak di ID card fisik)
-- untuk perwakilan yang kode_unik-nya dibetulkan dari AJM (harusnya prefix agen)
-- menjadi PJM (prefix perwakilan). Dipakai di halaman verifikasi publik supaya
-- kode di ID card fisik tetap bisa dicek meski kode_unik sistem sudah berubah.
ALTER TABLE users ADD COLUMN kode_unik_alias VARCHAR(20) NULL AFTER kode_unik;

UPDATE users SET kode_unik_alias = 'AJM0023',  kode_unik = 'PJM0003' WHERE id = 'a24f742c-808b-11f1-9cac-31625893d988'; -- WIWIN MINTARSIH
UPDATE users SET kode_unik_alias = 'AJM0049',  kode_unik = 'PJM0004' WHERE id = 'a25a7fac-808b-11f1-9cac-31625893d988'; -- SUZANNA FITHRIANY BASO
UPDATE users SET kode_unik_alias = 'AJM0050',  kode_unik = 'PJM0005' WHERE id = 'a26579f2-808b-11f1-9cac-31625893d988'; -- HJ. AGUSTINA PAWEROI
UPDATE users SET kode_unik_alias = 'AJM0070',  kode_unik = 'PJM0006' WHERE id = 'a2705020-808b-11f1-9cac-31625893d988'; -- MUS EKAWANI
UPDATE users SET kode_unik_alias = 'AJM0100',  kode_unik = 'PJM0007' WHERE id = 'a27b1eb0-808b-11f1-9cac-31625893d988'; -- RIO SATRIO WIBOWO
UPDATE users SET kode_unik_alias = 'AJM00101', kode_unik = 'PJM0008' WHERE id = 'a1df48dc-808b-11f1-9cac-31625893d988'; -- SAHARUDDIN DIDU
UPDATE users SET kode_unik_alias = 'AJM00102', kode_unik = 'PJM0009' WHERE id = 'a1edd974-808b-11f1-9cac-31625893d988'; -- HERIYANTO HADIKUSUMA
UPDATE users SET kode_unik_alias = 'AJM00103', kode_unik = 'PJM0010' WHERE id = 'a1f8a44e-808b-11f1-9cac-31625893d988'; -- AZIS MUSLIM
UPDATE users SET kode_unik_alias = 'AJM00104', kode_unik = 'PJM0011' WHERE id = 'a203a5ce-808b-11f1-9cac-31625893d988'; -- A. TITIN SUMARNA
UPDATE users SET kode_unik_alias = 'AJM00105', kode_unik = 'PJM0012' WHERE id = 'a20e7210-808b-11f1-9cac-31625893d988'; -- MUHAMMAD ALISYAHRAN DIDU
