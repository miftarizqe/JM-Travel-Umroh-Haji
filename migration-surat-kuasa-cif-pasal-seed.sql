-- Seed isi pasal awal 'surat_kuasa_cif', diterjemahkan dari template resmi
-- BSI ("5_Surat_Kuasa_Multi_CIF (Perorangan)v1 Rev Legal.doc", versi
-- Perorangan yang benar — lihat memori proyek soal versi salah sebelumnya).
-- Token {{...}} disubstitusi runtime lewat renderPasalMarkup(isi, mergeData)
-- — lihat src/app/api/koperasi/surat-kuasa-cif/route.js utk isi mergeData.
-- Admin BOLEH edit isi pasal ini nanti lewat /admin/pengaturan/dokumen,
-- ini cuma titik awal biar gak kosong.
INSERT INTO dokumen_pasal (dokumen, nomor, judul, isi) VALUES
('surat_kuasa_cif', 1, 'Identitas Pemberi Kuasa',
'Yang bertanda tangan di bawah ini:\n\nNama: **{{nama}}**\nNo. Identitas: **{{nik}}**\nAlamat: **{{alamat}}**\n\nUntuk selanjutnya disebut **Pemberi Kuasa**, yang merupakan pemilik rekening (selanjutnya disebut Rekening Pemberi Kuasa) pada PT. Bank Syariah Indonesia, Tbk (selanjutnya disebut Bank BSI).'),

('surat_kuasa_cif', 2, 'Data Rekening Pemberi Kuasa',
'No. CIF: **{{no_cif}}**\nNo. Rekening: **{{no_rekening}}**\nAtas Nama: **{{atas_nama}}**'),

('surat_kuasa_cif', 3, 'Penerima Kuasa',
'Dengan ini Pemberi Kuasa memberikan kuasa kepada **PT. Alkhalid Jaya Megah Tours & Travel (JM Travel)**, yang dalam hal ini diwakili oleh:\n\nNama: **{{nama_wakil}}**\nNo. Identitas: **{{identitas_wakil}}**\nJabatan: **{{jabatan_wakil}}**\n\nBertindak dalam jabatannya tersebut sebagai wakil yang sah dan berwenang untuk dan atas nama JM Travel, untuk selanjutnya disebut **Penerima Kuasa**.'),

('surat_kuasa_cif', 4, 'Ruang Lingkup Kuasa',
'Pemberi Kuasa memberikan persetujuan dan kuasa kepada Penerima Kuasa untuk melakukan tindakan-tindakan sebagai berikut:\n- Mengelola Rekening Pemberi Kuasa dalam layanan BSI Cash Management.\n- Memperoleh informasi saldo (inquiry) dan mutasi yang terdapat dalam Rekening Pemberi Kuasa melalui fitur-fitur yang ada di BSI Cash Management.\n- Melakukan pendebitan dari Rekening Pemberi Kuasa melalui fitur yang ada pada layanan BSI Cash Management.'),

('surat_kuasa_cif', 5, 'Persetujuan kepada Bank BSI',
'Sehubungan dengan pemberian kuasa tersebut di atas, Pemberi Kuasa menyatakan memberikan persetujuan kepada Bank BSI, termasuk kepada pegawai-pegawainya yang melaksanakan isi Surat Kuasa ini, untuk:\n- Memberikan akses kepada Penerima Kuasa atas Rekening Pemberi Kuasa, termasuk penyerahan data nama, nomor rekening, dan jumlah simpanan/dana pada Rekening — dan Pemberi Kuasa menyatakan hal tersebut bukan pelanggaran ketentuan rahasia bank sebagaimana diatur dalam Undang-Undang Nomor 10 Tahun 1998 tentang Perbankan beserta peraturan pelaksanaannya.\n- Melakukan pendebitan atas Rekening Pemberi Kuasa untuk keperluan pembayaran biaya yang timbul sehubungan pelaksanaan transaksi melalui layanan BSI Cash Management.\n- Pemberi Kuasa memahami dan menerima serta bertanggung jawab atas segala kerugian dan risiko yang mungkin timbul di kemudian hari sehubungan dengan pelaksanaan tindakan-tindakan tersebut, termasuk atas segala tuntutan, gugatan, dan klaim apa pun dari pihak mana pun.'),

('surat_kuasa_cif', 6, 'Berlaku dan Berakhirnya Kuasa',
'Surat Kuasa Kerjasama Multi CIF Pada BSI Cash Management ini tunduk pada Syarat dan Ketentuan Layanan BSI Cash Management serta ketentuan lain yang berlaku di Bank BSI.\n\nSurat Kuasa ini berlaku sejak tanggal diterimanya Surat Kuasa ini di Bank BSI, dan berakhir sejak tanggal Bank BSI menerima surat pencabutan kuasa oleh Pemberi Kuasa (atau ahli warisnya) melalui Penerima Kuasa dan/atau penutupan layanan BSI Cash Management Penerima Kuasa. Surat pencabutan kuasa tersebut harus diterima oleh Bank BSI selambat-lambatnya 7 (tujuh) hari kerja sebelum tanggal efektif berakhirnya kuasa yang dikehendaki oleh Pemberi Kuasa.');
