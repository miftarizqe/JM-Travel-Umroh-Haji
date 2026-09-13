-- SK-CIF direstrukturisasi jadi 2-pihak sesuai template resmi BSI "Surat
-- Kuasa Kerjasama Multi CIF Pada Layanan BSI Cash Management" (dikonfirmasi
-- user 2026-09-10, PDF referensi: Surat Kuasa - CIF.pdf) — sebelumnya
-- dianggap satu-pihak+Petugas Bank kayak Surat Pemblokiran, ternyata salah,
-- template resminya Pemberi Kuasa (jamaah) vs Penerima Kuasa (JM Travel,
-- diwakili Head of Program).

-- Penerima Kuasa diwakili LANGSUNG oleh Head of Program (bukan penandatangan
-- Management umum) — perlu simpan NIK-nya di snapshot (beda dari dokumen
-- 2-pihak lain yang cuma simpan nama+jabatan).
ALTER TABLE dokumen_signer_snapshot ADD COLUMN nik VARCHAR(30) NULL AFTER jabatan;

-- Jabatan Head of Program buat keperluan dokumen SK-CIF SENGAJA field
-- terpisah dari data users (bukan bagian profil HOP, cuma label buat
-- dicetak di dokumen ini) — diisi admin di halaman Pengaturan Komisi
-- Sahabat Baitullah, berdampingan sama pemilihan Akun Head of Program.
ALTER TABLE pengaturan ADD COLUMN jabatan_head_of_program VARCHAR(150) NULL;

-- Isi pasal SK-CIF (tipe='isian', SAMA gaya Surat Pemblokiran — tanpa
-- "Pasal N", nomor poin ditulis manual sebagai bagian teks paragraf persis
-- pola surat_pemblokiran nomor 2, BUKAN sintaks list "- item").
INSERT INTO dokumen_pasal (dokumen, nomor, tipe, judul, isi) VALUES
('sk_cif', 1, 'isian', 'Identitas Pemberi Kuasa', 'Yang bertanda tangan di bawah ini:\n\n\nNama: **{{nama}}**\n\nNo. Identitas: **{{nik}}**\n\nAlamat: **{{alamat}}**\n\n\nuntuk selanjutnya disebut **Pemberi Kuasa** yang merupakan pemilik rekening (selanjutnya disebut **Rekening Pemberi Kuasa**) yang berada pada PT. Bank Syariah Indonesia, Tbk (selanjutnya disebut **Bank BSI**) dengan data sebagai berikut:\n\n\nBank BSI Cab: **KCP Jakarta Utan Kayu**\n\nNo. CIF: **{{no_cif}}**\n\nNo. Rekening: **{{no_rekening}}**\n\nAtas Nama: **{{nama}}**'),
('sk_cif', 2, 'isian', 'Pemberian Kuasa', 'dengan ini memberikan kuasa kepada:\n\n\nNama Perusahaan: **PT. Alkhalid Jaya Megah**\n\nAlamat: **{{alamat_kantor}}**\n\n\nYang dalam hal ini diwakili oleh:\n\n\nNama: **{{nama_wakil}}**\n\nNo. Identitas: **{{nik_wakil}}**\n\nPekerjaan/Jabatan: **{{jabatan_wakil}}**\n\n\ndalam hal ini bertindak dalam jabatannya tersebut, sebagai wakil yang sah dan berwenang untuk dan atas nama PT. Alkhalid Jaya Megah, untuk selanjutnya disebut **Penerima Kuasa**.\n\nMaka dengan ini Pemberi Kuasa memberikan persetujuan dan kuasa kepada Penerima Kuasa untuk melakukan tindakan-tindakan sebagai berikut:'),
('sk_cif', 3, 'isian', 'Kuasa Khusus', '1. Mengelola Rekening Pemberi Kuasa dalam layanan BSI Cash Management.\n\n2. Memperoleh informasi saldo (inquiry) dan mutasi yang terdapat dalam Rekening Pemberi Kuasa melalui fitur-fitur yang ada di BSI Cash Management.\n\n3. Melakukan pendebitan dari Rekening Pemberi Kuasa melalui fitur yang ada pada layanan BSI Cash Management.'),
('sk_cif', 4, 'isian', 'Persetujuan kepada Bank BSI', 'Sehubungan dengan pemberian kuasa tersebut di atas, dengan ini Pemberi Kuasa menyatakan memberikan persetujuan kepada Bank BSI, termasuk kepada pegawai-pegawainya yang melaksanakan isi Surat Kuasa Kerjasama Multi CIF Pada BSI Cash Management ini untuk:\n\n\n1. Memberikan akses kepada Penerima Kuasa atas Rekening Pemberi Kuasa dan karenanya memberikan persetujuan/kewenangan kepada Bank BSI untuk memberikan dan menyediakan semua data berkaitan dengan Rekening Pemberi Kuasa, yang dapat dibuka, diketahui dan diperoleh Penerima Kuasa pada saat mengakses Rekening, termasuk penyerahan data berupa nama, nomor Rekening Pemberi Kuasa maupun jumlah simpanan/dana pada Rekening, dan karenanya Pemberi Kuasa menyatakan bahwa hal tersebut bukanlah merupakan pelanggaran atas ketentuan rahasia bank sebagaimana diatur dalam Undang-Undang Nomor 10 tahun 1998, tentang Perbankan, berikut segenap peraturan pelaksanaannya.\n\n2. Melakukan pendebitan atas Rekening Pemberi Kuasa untuk keperluan pembayaran biaya yang timbul sehubungan pelaksanaan transaksi melalui layanan BSI Cash Management.\n\n3. Pemberi Kuasa memahami dan menerima serta bertanggung jawab atas segala kerugian dan risiko yang mungkin timbul dikemudian hari sehubungan dengan pelaksanaan tindakan-tindakan sebagaimana dimaksud dalam Surat Kuasa Kerjasama Multi CIF pada BSI Cash Management ini, termasuk atas segala tuntutan, gugatan, dan klaim apapun dan dari pihak manapun, oleh karena itu Pemberi Kuasa setuju untuk menanggung risiko tersebut.'),
('sk_cif', 5, 'isian', 'Ketentuan Berlaku', 'Surat Kuasa Kerjasama Multi CIF Pada BSI Cash Management ini tunduk pada Syarat dan Ketentuan Layanan BSI Cash Management serta ketentuan lain yang berlaku di Bank BSI.\n\nSurat Kuasa Kerjasama Multi CIF Pada BSI Cash Management ini akan berlaku sejak tanggal diterimanya Surat Kuasa Kerjasama Multi CIF Pada BSI Cash Management ini di Bank BSI.\n\nSurat Kuasa Kerjasama Multi CIF Pada BSI Cash Management ini berakhir sejak tanggal Bank BSI menerima surat pencabutan kuasa oleh Pemberi Kuasa (ahli warisnya) melalui Penerima Kuasa dan/atau penutupan layanan BSI Cash Management Penerima Kuasa. Surat pencabutan kuasa tersebut diterima oleh Bank BSI selambat-lambatnya 7 (tujuh) hari kerja sebelum tanggal efektif berakhirnya kuasa yang dikehendaki oleh Pemberi Kuasa.'),
('sk_cif', 6, 'isian', 'Penutup', 'Demikian surat permohonan ini dibuat untuk dapat digunakan sebagaimana mestinya.');
