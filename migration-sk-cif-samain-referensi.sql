-- Selaraskan SK-CIF & Surat Pemblokiran persis sama file final user
-- (Surat Kuasa CIF.docx, Surat Pernyataan Pemblokiran Rekening.pdf,
-- dikirim 2026-09-10). Temuan penting dari file itu: Penerima Kuasa SK-CIF
-- BUKAN Head of Program (asumsi sebelumnya SALAH) — di reference-nya
-- "Muhammad Zaki / Direktur Utama", penandatangan KHUSUS SK-CIF sendiri,
-- beda dari Penandatangan Umum/SPJ/SPK-AK yang udah ada.

-- Penandatangan SK-CIF (Penerima Kuasa) — field baru, terpisah dari
-- Head of Program (dihapus keterkaitannya) dan dari Penandatangan Umum.
ALTER TABLE pengaturan ADD COLUMN nama_penandatangan_sk_cif VARCHAR(150) NULL;
ALTER TABLE pengaturan ADD COLUMN nik_penandatangan_sk_cif VARCHAR(30) NULL;
ALTER TABLE pengaturan ADD COLUMN jabatan_penandatangan_sk_cif VARCHAR(150) NULL;

-- SK-CIF pasal 1: label "No. Identitas" (bukan "No. KTP"), "dibawah"
-- (1 kata, bukan "di bawah"), field bank direname+diurutkan ulang persis
-- reference ("Cabang Bank BSI" -> "No. Rekening Umroh" -> "Nama Rekening",
-- No. CIF DIHAPUS TOTAL — gak ada di reference sama sekali).
UPDATE dokumen_pasal SET isi = 'Yang bertanda tangan dibawah ini:\n\n\nNama: **{{nama}}**\n\nNo. Identitas: **{{nik}}**\n\nAlamat: **{{alamat}}**\n\n\nuntuk selanjutnya disebut **Pemberi Kuasa** yang merupakan pemilik rekening (selanjutnya disebut **Rekening Pemberi Kuasa**) yang berada pada PT. Bank Syariah Indonesia, Tbk (selanjutnya disebut **Bank BSI**) dengan data sebagai berikut :\n\n\nCabang Bank BSI: **Cab Jakarta Utan Kayu**\n\nNo. Rekening Umroh: **{{no_rekening}}**\n\nNama Rekening: **{{nama}}**'
WHERE dokumen = 'sk_cif' AND nomor = 1;

-- SK-CIF pasal 2: tambah "Alamat Perusahaan" (field baru, gak ada di versi
-- sebelumnya), Penerima Kuasa sekarang dari {{nama_wakil}}/{{nik_wakil}}/
-- {{jabatan_wakil}} yang diisi dari Penandatangan SK-CIF (bukan lagi Head
-- of Program).
UPDATE dokumen_pasal SET isi = 'dengan ini memberikan kuasa kepada :\n\n\nNama Perusahaan: **PT. Alkhalid Jaya Megah**\n\nAlamat Perusahaan: **{{alamat_kantor}}**\n\n\nYang dalam hal ini diwakili oleh :\n\nNama: **{{nama_wakil}}**\n\nNo. Identitas: **{{nik_wakil}}**\n\nPekerjaan/Jabatan: **{{jabatan_wakil}}**\n\n\ndalam hal ini bertindak dalam jabatannya tersebut, sebagai wakil yang sah dan berwenang untuk dan atas nama **PT. Alkhalid Jaya Megah**\n\nuntuk selanjutnya disebut **Penerima Kuasa.**\n\nMaka dengan ini Pemberi Kuasa memberikan persetujuan dan kuasa kepada Penerima Kuasa untuk melakukan tindakan-tindakan sebagai berikut:'
WHERE dokumen = 'sk_cif' AND nomor = 2;

-- Surat Pemblokiran pasal 1: ejaan "Bismillahirahmanirrahim" (persis
-- reference, bukan "Bismillahirahmannirrahiim"), "Yang bertanda tangan
-- dibawah ini" (bukan "Saya yang bertanda tangan di bawah ini"), label
-- "No. Identitas" (bukan "No. KTP"), field bank direname+diurutkan ulang
-- persis reference.
UPDATE dokumen_pasal SET isi = 'Bismillahirahmanirrahim\n\nYang bertanda tangan dibawah ini:\n\n\nNama: **{{nama}}**\n\nNo. Identitas: **{{nik}}**\n\nAlamat: **{{alamat}}**\n\n\nDalam hal ini selaku nasabah/pemilik rekening Tabungan di Bank Syariah Indonesia,\n\n\nCabang Bank BSI: **Cab Jakarta Utan Kayu**\n\nNo. Rekening Umroh: **{{no_rekening}}**\n\nNama Rekening: **{{nama}}**\n\n\nDengan ini menyatakan'
WHERE dokumen = 'surat_pemblokiran' AND nomor = 1;

-- Pasal 2 (Daftar Pernyataan): no. rekening tujuan disamain persis
-- reference (7133 0541 24, BUKAN 7080660361 yang lama — beda nomor
-- rekening beneran, bukan cuma format), bold cuma nama PT (bukan sekalian
-- nomor rekeningnya), dan tetep sintaks "- item" (list asli, bukan angka
-- manual) biar hanging indent-nya bener kalau kepanjangan kebawah.
UPDATE dokumen_pasal SET isi = '- Memberikan kuasa kepada Bank Syariah Indonesia Kantor Cabang Pembantu Jakarta Utan Kayu, untuk melakukan BLOKIR SALDO rekening saya sejumlah **Rp{{nominal_blokir}}** selama jangka waktu **{{jangka_waktu_hari}} hari**, terhitung dari tanggal **{{tanggal_mulai_blokir}}** dengan tujuan untuk kepentingan menabung Tabungan Umroh.\n- Memberikan instruksi kepada Bank Syariah Indonesia Kantor Cabang Pembantu Jakarta Utan Kayu, untuk melakukan PENDEBETAN dan sekaligus PEMINDAHBUKUAN sejumlah dana/uang sebesar **Rp{{nominal_blokir}}** yang ada di rekening tersebut di atas kepada **PT Alkhalid Jaya Megah**, No. Rekening : 7133 0541 24 untuk keperluan pembelian Paket Ibadah Umroh yang dibuktikan dengan manifest keberangkatan atau visa keberangkatan.\n- Menyatakan tidak akan melakukan penarikan saldo secara pribadi sesuai kesepakatan selama proses menabung Tabungan Umroh.\n- Memberikan Kuasa kepada Bank Syariah Indonesia untuk memberikan informasi saldo kepada pihak yang membutuhkan.\n- Surat Pernyataan Kuasa Blokir dan Instruksi Pendebetan ini tidak dapat saya cabut dan batalkan sesuai kesepakatan dengan Bank Syariah Indonesia.\n- Menyatakan membebaskan Bank Syariah Indonesia dari segala tuntutan hukum yang berlaku berkaitan dengan surat pernyataan ini.'
WHERE dokumen = 'surat_pemblokiran' AND nomor = 2;
