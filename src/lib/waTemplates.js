const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

// Semua pesan di sini cuma nyiapin TEKS — admin masih harus klik kirim
// sendiri di jendela WhatsApp yang kebuka (wa.me), gak ada pengiriman
// otomatis di server (butuh WhatsApp Business API berbayar buat itu).
// Format singkat & jelas, bisa diedit admin dulu di WA sebelum kirim.

export function pesanDpDikonfirmasi({ namaJamaah, progName, totalHarga, dpAmount, namaKantor }) {
  return `Assalamu'alaikum ${namaJamaah || ''},

DP Anda untuk program *${progName}* sebesar ${rp(dpAmount)} sudah kami konfirmasi ✅

Total harga paket: ${rp(totalHarga)}

Selanjutnya tim kami akan bantu lengkapi data pendaftaran Anda. Terima kasih sudah mempercayakan perjalanan ibadah Anda kepada ${namaKantor || 'JM Travel'} 🕋`;
}

export function pesanReminderFormulir({ namaJamaah, progName }) {
  return `Assalamu'alaikum ${namaJamaah || ''},

Untuk melengkapi pendaftaran program *${progName}*, kami masih perlu data Anda (KTP, paspor, kontak darurat, dll).

Mohon info bisa dikirim balik lewat chat ini ya, nanti tim kami yang input ke sistem. Terima kasih 🙏`;
}

export function pesanReminderPelunasan({ namaJamaah, progName, sisaBayar, namaBank, noRekening, atasNama }) {
  return `Assalamu'alaikum ${namaJamaah || ''},

Mengingatkan untuk pelunasan program *${progName}* sebesar ${rp(sisaBayar)}.

Transfer ke:
${namaBank || '-'} ${noRekening || ''}
a.n. ${atasNama || '-'}

Mohon kirim bukti transfer setelah melakukan pembayaran. Terima kasih 🙏`;
}

export function pesanPelunasanDikonfirmasi({ namaJamaah, progName, totalHarga }) {
  return `Assalamu'alaikum ${namaJamaah || ''},

Alhamdulillah, pelunasan Anda untuk program *${progName}* sudah kami terima dan konfirmasi ✅

*Ringkasan:*
Program: ${progName}
Total: ${rp(totalHarga)}
Status: LUNAS

Sampai jumpa di tanah suci, insyaAllah 🕋`;
}

export function pesanVerifikasiManifest({ namaJamaah, progName }) {
  return `Assalamu'alaikum ${namaJamaah || ''},

Menjelang keberangkatan program *${progName}*, mohon konfirmasi data Anda (nama, no. paspor, kontak darurat) yang tercatat di sistem kami masih sesuai ya.

Kalau ada yang perlu diperbarui, mohon info balik lewat chat ini. Terima kasih 🙏`;
}

export function pesanReferralBaru({ namaPenerima, namaJamaah, progName, jumlahJamaah, kodeUnik }) {
  return `Halo ${namaPenerima || ''} 👋

Ada pendaftaran baru pakai kode referral Anda (${kodeUnik || '-'}):

Nama: ${namaJamaah || '-'}
Program: ${progName}
Jumlah jamaah: ${jumlahJamaah || 1}

Closing ini sudah otomatis tercatat ke akun Anda. Cek dashboard untuk detail ujroh-nya ya 🎉`;
}

const DOKUMEN_LABEL_WA = {
  spka_ins: 'Surat Perjanjian Kerja Sama Perwakilan',
  jamaah: 'Perjanjian Keberangkatan Jamaah',
  formulir: 'Formulir Pendaftaran Perwakilan',
  invoice: 'Invoice/Kwitansi',
};

export function pesanDokumenMenungguTtd({ namaSigner, dokumen, linkTtd }) {
  return `Assalamu'alaikum ${namaSigner || ''},

Ada dokumen *${DOKUMEN_LABEL_WA[dokumen] || dokumen}* yang menunggu tanda tangan digital Anda.

Silakan buka link berikut untuk membaca & menandatangani:
${linkTtd}

Terima kasih 🙏`;
}
