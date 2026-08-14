// Template adapter provider TTD tersertifikasi (Privy/Digisign/VIDA/
// TekenAja — belum ditentukan yang mana). BUKAN diimpor otomatis di manapun
// — begitu vendor sudah dipilih & API key tersedia, salin file ini jadi
// providers/<nama-vendor>.js, isi 2 fungsi di bawah sesuai dokumentasi
// vendor tsb, daftarkan di src/lib/eSignature/index.js (PROVIDERS map), lalu
// set env TTD_PROVIDER=<nama-vendor>.
//
// `kirim` dipanggil sekali per dokumen: kirim PDF + data penandatangan ke
// API vendor, dapat balik providerRef (ID dokumen/envelope di sisi vendor).
// `selesaikan` TIDAK dipanggil manual di produksi seperti mock — provider
// asli biasanya push status via WEBHOOK begitu penandatangan selesai TTD;
// buat endpoint webhook baru yang memanggil fungsi ini, bukan tombol UI.
export async function kirim({ dokumen, refId, signer, pdfBuffer }) {
  throw new Error('Provider TTD ini belum diimplementasi.');
}

export async function selesaikan({ providerRef, signer }) {
  throw new Error('Provider TTD ini belum diimplementasi.');
}
