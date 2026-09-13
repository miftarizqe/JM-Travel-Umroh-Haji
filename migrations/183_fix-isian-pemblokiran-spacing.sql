-- Baris field Nama/Alamat/No.KTP dan No.Rekening/Cabang di pasal 1
-- surat_pemblokiran (tipe 'isian') sebelumnya cuma dipisah 1 baris baru,
-- padahal parser markup (parsePasalMarkup di pasalMarkup.jsx) NGE-GABUNG
-- baris yang gak dipisah baris KOSONG jadi 1 paragraf mengalir — hasilnya
-- "Nama: ... Alamat: ... No. KTP: ..." nyamping sebaris, bukan turun per
-- field. Dikonfirmasi user 2026-09-09 (screenshot), diperbaiki di sini +
-- migration-surat-pemblokiran-pasal-seed.sql (buat environment baru).
UPDATE dokumen_pasal
SET isi = 'Bismillahirahmannirrahiim\n\nSaya yang bertanda tangan di bawah ini:\n\nNama: **{{nama}}**\n\nAlamat: **{{alamat}}**\n\nNo. KTP: **{{nik}}**\n\nDalam hal ini selaku nasabah/pemilik rekening Tabungan di Bank Syariah Indonesia:\n\nNo. Rekening: **{{no_rekening}}**\n\nCabang: **KCP Jakarta Utan Kayu**\n\nDengan ini menyatakan:'
WHERE dokumen = 'surat_pemblokiran' AND nomor = 1;
