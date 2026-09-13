-- Seed isi pasal awal 'surat_pemblokiran', diterjemahkan dari template resmi
-- BSI ("Surat Pernyataan Kuasa Blokir Rekening & Instruksi Pemindahbukuan",
-- KCP Jakarta Utan Kayu). Token {{...}} disubstitusi runtime lewat
-- renderPasalMarkup(isi, mergeData) — lihat src/app/api/sahabat/surat-pemblokiran/route.js
-- utk isi mergeData (nominal & tanggal sudah diformat Rupiah/Indonesia di situ,
-- bukan raw number/ISO date). Admin BOLEH edit isi pasal ini nanti lewat
-- /admin/pengaturan/dokumen, ini cuma titik awal biar gak kosong.
INSERT INTO dokumen_pasal (dokumen, nomor, judul, isi) VALUES
('surat_pemblokiran', 1, 'Identitas Pemberi Pernyataan',
'Bismillahirahmannirrahiim\n\nSaya yang bertanda tangan di bawah ini:\n\nNama: **{{nama}}**\n\nAlamat: **{{alamat}}**\n\nNo. KTP: **{{nik}}**\n\nDalam hal ini selaku nasabah/pemilik rekening Tabungan di Bank Syariah Indonesia:\n\nNo. Rekening: **{{no_rekening}}**\n\nCabang: **KCP Jakarta Utan Kayu**\n\nDengan ini menyatakan:'),

('surat_pemblokiran', 2, 'Kuasa Blokir Saldo Rekening',
'Memberikan kuasa kepada Bank Syariah Indonesia Kantor Cabang Pembantu Jakarta Utan Kayu, untuk melakukan BLOKIR SALDO rekening saya sejumlah **Rp{{nominal_blokir}}**, selama jangka waktu **{{jangka_waktu_hari}} hari**, terhitung dari tanggal **{{tanggal_mulai_blokir}}**, dengan tujuan untuk kepentingan menabung Tabungan Umroh.'),

('surat_pemblokiran', 3, 'Instruksi Pendebetan dan Pemindahbukuan',
'Memberikan instruksi kepada Bank Syariah Indonesia Kantor Cabang Pembantu Jakarta Utan Kayu, untuk melakukan PENDEBETAN dan sekaligus PEMINDAHBUKUAN sejumlah dana/uang sebesar **Rp{{nominal_blokir}}** yang ada di rekening tersebut di atas kepada **PT Alkhalid Jaya Megah, No. Rekening: 7080660361**, untuk keperluan pembelian Paket Ibadah Umroh yang dibuktikan dengan manifest keberangkatan atau visa keberangkatan.'),

('surat_pemblokiran', 4, 'Pernyataan Tambahan',
'- Menyatakan tidak akan melakukan penarikan saldo secara pribadi sesuai kesepakatan selama proses menabung Tabungan Umroh.\n- Memberikan Kuasa kepada Bank Syariah Indonesia untuk memberikan informasi saldo kepada pihak yang membutuhkan.\n- Surat Pernyataan Kuasa Blokir dan Instruksi Pendebetan ini tidak dapat saya cabut dan batalkan sesuai kesepakatan dengan Bank Syariah Indonesia.\n- Menyatakan membebaskan Bank Syariah Indonesia dari segala tuntutan hukum yang berlaku berkaitan dengan surat pernyataan ini.\n\nDemikian surat pernyataan ini dibuat dengan sebenarnya dan agar dapat digunakan sebagaimana mestinya.');
