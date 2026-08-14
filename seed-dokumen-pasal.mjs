// seed-dokumen-pasal.mjs
// Transkrip awal isi pasal SPKA-Ins/Jamaah dari src/lib/pksIsi.jsx
// & src/lib/pksContent.js ke tabel dokumen_pasal, supaya admin bisa edit
// lewat /admin/pasal tanpa minta developer ubah kode.
// Jalankan SEKALI dari folder project:  node seed-dokumen-pasal.mjs
// Aman dijalankan ulang — pakai INSERT ... ON DUPLICATE KEY UPDATE.

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const env = {};
readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const pool = await mysql.createPool({
  host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});

const REK_KANTOR = [
  '  - Nama Bank: Bank Syariah Indonesia',
  '  - No. Rekening: 7133-0541-24',
  '  - Atas Nama: Alkhalid Jaya Megah',
].join('\n');

const REK_AGEN = [
  '  - Nama Bank: {{bank_agen}}',
  '  - No. Rekening: {{rekening_agen}}',
  '  - Atas Nama: {{nama_rekening_agen}}',
].join('\n');

const spkaIns = [
  [1, 'MAKSUD DAN TUJUAN', `
- PIHAK PERTAMA adalah perusahaan penyelenggara perjalanan ibadah Umroh dan/atau Haji yang memiliki izin resmi sesuai peraturan perundang-undangan yang berlaku.
- PIHAK KEDUA adalah Perwakilan yang bermaksud menjadi Mitra Pemasaran program Umroh dan/atau Haji kepada anggota dan/atau masyarakat yang menjadi jaringan PIHAK KEDUA.
- Kerja sama ini bertujuan untuk memberikan kemudahan akses layanan perjalanan ibadah secara profesional, transparan, dan sesuai ketentuan hukum yang berlaku.
`.trim()],
  [2, 'RUANG LINGKUP DAN STATUS KERJA SAMA', `
- PIHAK KEDUA bertindak sebagai Mitra Pemasaran, **bukan** agen, cabang, atau perwakilan hukum PIHAK PERTAMA.
- PIHAK KEDUA tidak memiliki kewenangan membuat perikatan hukum atas nama PIHAK PERTAMA.
- Seluruh tanggung jawab penyelenggaraan teknis perjalanan ibadah berada pada PIHAK PERTAMA sebagai Penyelenggara resmi.
`.trim()],
  [3, 'HAK DAN KEWAJIBAN PARA PIHAK', `
**Hak PIHAK PERTAMA**
- Menetapkan harga paket berdasarkan harga B2B, fasilitas, jadwal keberangkatan dan ketentuan program.
- Menerima seluruh pembayaran jamaah melalui rekening resmi PIHAK PERTAMA.
- Menolak mendaftarkan jamaah yang tidak memenuhi ketentuan administrasi, kesehatan, atau keimigrasian.
- Melakukan audit, evaluasi, dan pengawasan terhadap aktivitas pemasaran yang dilakukan oleh PIHAK KEDUA.
- Menahan, menunda, atau memotong komisi apabila PIHAK KEDUA terbukti melakukan pelanggaran terhadap perjanjian ini.
- Mengakhiri kerja sama secara sepihak apabila PIHAK KEDUA melakukan pelanggaran material.

**Kewajiban PIHAK PERTAMA**
- Menyediakan seluruh informasi terkait program Umroh dan/atau Haji.
- Menyelenggarakan perjalanan sesuai standar pelayanan dan regulasi yang berlaku.
- Bertanggung jawab atas pelaksanaan ibadah sejak keberangkatan hingga kepulangan jamaah.
- Membayarkan komisi kepada PIHAK KEDUA sesuai kesepakatan.
- Memberikan pelatihan pengetahuan produk di kantor pusat atau melalui online kepada PIHAK KEDUA.
`.trim()],
  [4, 'HAK DAN KEWAJIBAN PIHAK KEDUA', `
**Hak PIHAK KEDUA**
- Memasarkan dan menjual program Umroh dan/atau Haji yang diselenggarakan PIHAK PERTAMA kepada anggota dan/atau jaringan.
- Mendapatkan komisi sesuai ketentuan dari PIHAK PERTAMA atas jamaah yang sah dan telah melakukan pelunasan sesuai skema yang disepakati.
- Mendapatkan informasi dan pelatihan berkelanjutan di kantor pusat atau melalui online mengenai produk dari PIHAK PERTAMA secara berkala.

**Kewajiban PIHAK KEDUA**
- Melakukan promosi dan perekrutan jamaah sesuai etika pemasaran yang berlaku.
- Menjelaskan program Umroh dan Haji secara baik dan benar. PIHAK KEDUA wajib untuk tidak melakukan promosi menyesatkan, tidak menjanjikan fasilitas di luar ketentuan resmi, serta tidak mencemarkan nama baik PIHAK PERTAMA.
- Menyerahkan data jamaah secara lengkap dan tepat waktu.
- PIHAK KEDUA wajib memberikan penjelasan dan memastikan kepada setiap Jamaah bahwa semua pembayaran biaya Umroh dan Haji wajib dilakukan secara langsung ke rekening Perusahaan, yaitu:
${REK_KANTOR}
- Dalam hal terdapat pembayaran yang dilakukan ke rekening **selain** rekening resmi Perusahaan sebagaimana dimaksud pada angka 3 (tiga) di atas, maka PIHAK PERTAMA dibebaskan dan tidak bertanggung jawab atas segala bentuk kerugian, tuntutan, klaim, maupun konsekuensi hukum apa pun yang timbul. Seluruh tanggung jawab atas pengembalian dana dan akibat hukum lainnya sepenuhnya menjadi tanggung jawab PIHAK KEDUA.
- PIHAK KEDUA wajib untuk tidak melakukan praktik ilegal, termasuk namun tidak terbatas pada:
  - penggelapan dana jamaah;
  - pemalsuan dokumen;
  - pemotongan harga tanpa persetujuan PIHAK PERTAMA;
  - pemalsuan bukti pembayaran;
  - penyalahgunaan logo, nama, atau atribut perusahaan.
- PIHAK KEDUA wajib melaporkan kepada PIHAK PERTAMA apabila terdapat dugaan pelanggaran yang dilakukan oleh jamaah.
- Bertanggung jawab penuh atas seluruh tindakan pengurus, pengelola, karyawan, anggota, atau pihak yang berada di bawah kendali PIHAK KEDUA.
- Menjaga nama baik PIHAK PERTAMA.
`.trim()],
  [5, 'KOMISI DAN PEMBAYARAN', `
- Komisi diberikan atas jamaah yang:
  - Terdaftar resmi;
  - Telah melakukan pelunasan;
  - Berangkat sesuai jadwal.
- Besaran komisi mengikuti skema yang disepakati dalam lampiran yang menjadi bagian tidak terpisahkan dari perjanjian ini.
- Pembayaran komisi program Umroh dilakukan paling lambat 3 (tiga) hari kerja setelah keberangkatan jamaah.
- Pembayaran komisi program Haji dibayarkan dalam dua tahap:
  - Tahap I: Sebesar 50% dibayarkan H+7 (tujuh) hari kerja setelah jamaah membayar uang muka (DP).
  - Tahap II: Sebesar 50% dibayarkan H+3 (tiga) hari kerja setelah jamaah berangkat haji.
- Komisi akan ditransfer langsung ke rekening bank Pihak Kedua, sebagai berikut:
${REK_AGEN}
- PIHAK PERTAMA berhak menahan, menunda, atau memotong komisi PIHAK KEDUA apabila terdapat pelanggaran etika pemasaran, ketidaksesuaian data jamaah, atau adanya komplain yang terbukti.
- Pembayaran komisi dapat ditangguhkan sampai permasalahan dinyatakan selesai.
`.trim()],
  [6, 'TRANSPARANSI DAN MEKANISME PENGELOLAAN DANA', `
- Seluruh pembayaran jamaah wajib dilakukan langsung ke rekening resmi atas nama PIHAK PERTAMA.
- PIHAK KEDUA tidak diperkenankan menerima, menampung, atau mengelola dana jamaah dalam bentuk apa pun.
- Apabila PIHAK KEDUA terbukti menerima atau mengelola dana jamaah, maka hal tersebut dikategorikan sebagai pelanggaran berat dan PIHAK PERTAMA berhak:
  - Mengakhiri kerja sama secara sepihak;
  - Menahan atau membatalkan pembayaran komisi;
  - Menempuh upaya hukum sesuai ketentuan yang berlaku.
- PIHAK PERTAMA wajib:
  - Memberikan bukti pembayaran resmi kepada jamaah;
  - Memberikan konfirmasi tertulis atas status pendaftaran jamaah;
  - Menyediakan laporan keberangkatan jamaah yang direkrut PIHAK KEDUA.
- PARA PIHAK sepakat bahwa prinsip pengelolaan dana harus menjunjung asas kehati-hatian, akuntabilitas, dan kepatuhan terhadap peraturan perundang-undangan.
`.trim()],
  [7, 'PERLINDUNGAN REPUTASI DAN NAMA BAIK', `
- PIHAK PERTAMA menjamin bahwa seluruh operasional usaha telah memiliki izin resmi dan masih berlaku.
- Apabila terjadi wanprestasi, kelalaian, atau pelanggaran hukum yang dilakukan oleh PIHAK PERTAMA, maka:
  - Tanggung jawab sepenuhnya berada pada PIHAK PERTAMA;
  - PIHAK KEDUA tidak dapat dimintai tanggung jawab hukum sepanjang tidak terbukti turut serta atau lalai secara langsung.
- Apabila terjadi wanprestasi, kelalaian, atau pelanggaran hukum yang dilakukan oleh PIHAK KEDUA, maka:
  - Tanggung jawab sepenuhnya berada pada PIHAK KEDUA;
  - PIHAK PERTAMA tidak dapat dimintai tanggung jawab hukum sepanjang tidak terbukti turut serta atau lalai secara langsung.
- PIHAK PERTAMA wajib menjaga agar nama baik dan reputasi PIHAK KEDUA tidak tercemar akibat permasalahan operasional PIHAK PERTAMA.
- Apabila terjadi pemberitaan negatif akibat kesalahan PIHAK PERTAMA, maka klarifikasi publik menjadi tanggung jawab PIHAK PERTAMA.
- PIHAK KEDUA berhak mengakhiri kerja sama secara sepihak apabila PIHAK PERTAMA:
  - Kehilangan izin operasional;
  - Terbukti melakukan pelanggaran hukum;
  - Gagal memberangkatkan jamaah tanpa alasan yang sah.
- PIHAK KEDUA wajib menjaga nama baik PIHAK PERTAMA dalam setiap aktivitas pemasaran, komunikasi, dan interaksi dengan jamaah.
- PIHAK KEDUA bertanggung jawab atas seluruh materi promosi, informasi, atau pernyataan yang disampaikan kepada jamaah.
- PIHAK PERTAMA tidak bertanggung jawab atas janji, informasi, atau pernyataan yang disampaikan oleh PIHAK KEDUA di luar ketentuan resmi.
`.trim()],
  [8, 'TANGGUNG JAWAB TERHADAP JAMAAH', `
- PIHAK PERTAMA bertanggung jawab penuh atas penyelenggaraan perjalanan ibadah.
- PIHAK KEDUA bertanggung jawab atas kebenaran dan kelengkapan data awal jamaah yang direkomendasikan.
`.trim()],
  [9, 'TANGGUNG JAWAB AGEN ATAS PELANGGARAN KEIMIGRASIAN JAMAAH', `
- PIHAK KEDUA bertanggung jawab penuh terhadap jamaah yang direkruit, direkomendasikan, dan/atau didaftarkan oleh PIHAK KEDUA kepada PIHAK PERTAMA. Apabila jamaah yang berasal dari PIHAK KEDUA:
  - Melarikan diri (kabur di wilayah Kerajaan Arab Saudi);
  - Tidak kembali ke Indonesia sesuai jadwal kepulangan, dan/atau;
  - Menjadi imigran gelap (overstay atau pelanggaran izin tinggal), sehingga mengakibatkan sanksi, denda, blacklist, atau kerugian lainnya yang dikenakan kepada PIHAK PERTAMA oleh pihak berwenang Kerajaan Arab Saudi maupun instansi terkait, maka PIHAK KEDUA bertanggung jawab sepenuhnya atas seluruh konsekuensi tersebut.
- Tanggung jawab PIHAK KEDUA sebagaimana dimaksud pada pasal ini meliputi, namun tidak terbatas pada:
  - Pembayaran denda (gharamah) yang dikenakan kepada PIHAK PERTAMA;
  - Penggantian seluruh biaya yang timbul akibat kejadian tersebut;
  - Ganti rugi atas kerugian materiil maupun immaterial dialami PIHAK PERTAMA.
- PIHAK KEDUA wajib melakukan pembayaran denda sepenuhnya dan/atau ganti rugi selambat-lambatnya 7 (tujuh) hari kalender sejak adanya pemberitahuan tertulis dari PIHAK PERTAMA.
- Apabila PIHAK KEDUA tidak melaksanakan kewajiban sebagaimana dimaksud dalam pasal ini, maka PIHAK PERTAMA berhak:
  - Memotong komisi, bonus, atau hak PIHAK KEDUA lainnya;
  - Menangguhkan atau mengakhiri kerja sama secara sepihak;
  - Menempuh jalur hukum sesuai dengan ketentuan peraturan perundang-undangan yang berlaku di Republik Indonesia.
`.trim()],
  [10, 'FORCE MAJEURE DAN PENYESUAIAN LAYANAN', `
- **Force Majeure** adalah kejadian di luar kendali PIHAK PERTAMA, termasuk tidak terbatas pada bencana alam, wabah penyakit, kebijakan pemerintah, pembatalan penerbangan, kondisi keamanan, dan kebijakan hotel dan lain-lain.
- Jika ada perubahan regulasi dari Kerajaan Arab Saudi dan/atau Pemerintah Indonesia yang menimbulkan resiko kenaikan biaya seperti kenaikan pajak, biaya tambahan seperti BRN, dan lain-lain maka akan dibebankan 100% ke JAMAAH.
- Jika ada kondisi force majeure seperti wabah penyakit, bencana alam, darurat perang, perubahan kebijakan dan regulasi dari Kerajaan Arab Saudi dan/atau Pemerintah Indonesia, dan lain-lain, yang menyebabkan potensi penundaan keberangkatan, JAMAAH akan tetap diberangkatkan di waktu yang akan ditentukan oleh PIHAK PERTAMA dan jika ada kenaikan biaya maka akan ditanggung 100% oleh JAMAAH.
- JAMAAH yang memilih paket kamar untuk umroh memahami bahwa penempatan kamar bergantung pada ketersediaan hotel. Apabila pada saat pelaksanaan perjalanan kamar yang dipilih **tidak tersedia**, maka JAMAAH **setuju untuk dilakukan penyesuaian tipe kamar ke kategori di atasnya** dan seluruh biaya tambahan akibat penyesuaian tipe kamar menjadi tanggungan JAMAAH.
`.trim()],
  [11, 'KERAHASIAAN', `
- PIHAK KEDUA wajib menjaga kerahasiaan seluruh data jamaah, dokumen perjalanan dan informasi PIHAK PERTAMA yang berkaitan dengan urusan bisnis atau rahasia dagang PIHAK PERTAMA. Termasuk data teknis, materi yang masih dalam proses pembuatan yang terjadi saat pemutusan hubungan kerja atau hal-hal di masa lalu, dan semua rincian yang berkaitan dengan informasi mengenai database PIHAK PERTAMA.
- Kewajiban ini tetap berlaku meskipun perjanjian berakhir.
`.trim()],
  [12, 'TATA KELOLA DAN KEPATUHAN (GOOD CORPORATE GOVERNANCE)', `
- Kerja sama ini dilaksanakan berdasarkan prinsip:
  - Transparansi;
  - Akuntabilitas;
  - Tanggung jawab;
  - Independensi;
  - Kewajaran.
- PIHAK PERTAMA menjamin kepatuhan terhadap regulasi Umroh/Haji yang berlaku di Indonesia.
- PIHAK KEDUA melaksanakan kerja sama sesuai prinsip tata kelola badan hukum/instansi/yayasan yang sehat.
- Tidak terdapat hubungan eksklusifitas, kecuali disepakati tertulis.
- PARA PIHAK sepakat menghindari praktik yang berpotensi konflik kepentingan.
`.trim()],
  [13, 'JANGKA WAKTU DAN PENGAKHIRAN PERJANJIAN', `
- Perjanjian ini berlaku selama 1 (satu) tahun sejak tanggal ditandatangani.
- Dapat diperpanjang berdasarkan kesepakatan tertulis PARA PIHAK.
- Perjanjian dapat diakhiri oleh salah satu pihak apabila pihak lainnya melanggar ketentuan dalam perjanjian ini.
- PIHAK PERTAMA berhak mengakhiri perjanjian secara sepihak apabila PIHAK KEDUA melakukan pelanggaran berat.
`.trim()],
  [14, 'PENYELESAIAN PERSELISIHAN', `
- Perjanjian ini diatur dan ditafsirkan berdasarkan hukum Negara Republik Indonesia.
- Apabila terjadi perselisihan atau sengketa yang timbul dari pelaksanaan perjanjian ini, PARA PIHAK sepakat untuk menyelesaikan terlebih dahulu secara musyawarah.
- Apabila musyawarah tidak mencapai mufakat, PARA PIHAK sepakat memilih domisili hukum yang tetap dan tidak berubah di Pengadilan Negeri Jakarta Selatan.
`.trim()],
  [15, 'PENUTUP', `
- Perjanjian ini dibuat dan ditandatangani dengan sadar, itikad baik, tanpa paksaan dari pihak mana pun.
- Dibuat dalam dua rangkap bermaterai cukup dan masing-masing memiliki kekuatan hukum yang sama.
- Perjanjian ini mengikat sejak ditandatangani oleh PARA PIHAK.
- Hal-hal yang belum diatur akan disepakati kemudian dalam addendum tertulis mengikuti ketentuan peraturan perundang-undangan dan kebijakan PIHAK PERTAMA.
`.trim()],
];

const jamaah = [
  [1, 'Pembayaran', 'Pembayaran DP dan pelunasan hanya melalui rekening Bank Syariah Indonesia a.n. Alkhalid Jaya Megah, No. Rek 7133-0541-24. Jamaah dilarang menitipkan pembayaran kepada perorangan (Agen/Perwakilan).'],
  [2, 'Tanggung Jawab', 'Kerugian akibat pembayaran di luar rekening resmi bukan menjadi tanggung jawab perusahaan.'],
  [3, 'Dokumen', 'Jamaah wajib menyertakan: paspor berlaku minimal 6 bulan sebelum keberangkatan, Kartu Keluarga, KTP, bukti vaksin meningitis & polio, serta pas foto.'],
  [4, 'Data', 'Jamaah menjamin kebenaran seluruh data yang diisi pada formulir pendaftaran.'],
  [5, 'Perubahan Jadwal', 'Perubahan jadwal keberangkatan mengikuti ketentuan maskapai dan otoritas Arab Saudi.'],
];

const all = [
  ...spkaIns.map(([nomor, judul, isi]) => ['spka_ins', nomor, judul, isi]),
  ...jamaah.map(([nomor, judul, isi]) => ['jamaah', nomor, judul, isi]),
];

for (const [dokumen, nomor, judul, isi] of all) {
  await pool.query(
    'INSERT INTO dokumen_pasal (dokumen, nomor, judul, isi) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE judul = VALUES(judul), isi = VALUES(isi)',
    [dokumen, nomor, judul, isi]
  );
}

console.log(`✅ ${all.length} pasal ter-seed ke tabel dokumen_pasal (spka_ins: ${spkaIns.length}, jamaah: ${jamaah.length}).`);
await pool.end();
