// Baris 1: jalan + no rumah + RT/RW. Baris 2: kelurahan, kecamatan, kota,
// provinsi. Dikonfirmasi user 2026-10-03 -- "No Rumah" diprefix "No.", RT/RW
// diprefix hurufnya ("RT x/RW y"), baris 2 diakhiri titik. Dipakai bareng
// SPK-AK (spkAkUntukUser.js) dan SK-CIF/Surat Pemblokiran
// (dokumenSahabatGabungan.js) -- semua dokumen legal sahabat baitullah yang
// nampilin alamat KTP.
export function formatAlamatDuaBaris(user) {
  if (!user.alamat_ktp_jalan) {
    return { alamatBaris1: user.alamat_ktp || user.alamat || '-', alamatBaris2: '' };
  }
  const baris1 = [
    user.alamat_ktp_jalan,
    user.alamat_ktp_no_rumah ? `No. ${user.alamat_ktp_no_rumah}` : null,
    (user.alamat_ktp_rt || user.alamat_ktp_rw) ? `RT ${user.alamat_ktp_rt || '-'}/RW ${user.alamat_ktp_rw || '-'}` : null,
  ].filter(Boolean).join(', ');
  const baris2Isi = [user.alamat_ktp_kelurahan, user.alamat_ktp_kecamatan, user.alamat_ktp_kota, user.alamat_ktp_provinsi]
    .filter(Boolean).join(', ');
  return { alamatBaris1: baris1, alamatBaris2: baris2Isi ? `${baris2Isi}.` : '' };
}

// Alamat GENERIK (Formulir Pendaftaran Perwakilan, dkk) — beda dari
// formatAlamatDuaBaris di atas, di sini gak ada kolom terpisah per komponen
// buat direkonstruksi (cuma 1 string udah digabung dari alamatLengkap(),
// src/app/components/AddressFields.jsx: jalan, no rumah, RT, RW, kelurahan,
// kecamatan, kota, provinsi, negara -- 9 komponen urutan tetap). Dipecah
// berdasarkan JUMLAH komponen (4 pertama / 5 sisanya), bukan reflow lebar
// (dikonfirmasi user 2026-10-05 -- sebelumnya numpuk 1 baris panjang di PDF
// Formulir Perwakilan). Alamat lama/bebas yang gak sampe 9 bagian dibalikin
// apa adanya di baris pertama, gak dipaksa pecah.
export function splitAlamatGenerik(alamat) {
  if (!alamat) return { baris1: '-', baris2: '' };
  const bagian = alamat.split(', ');
  if (bagian.length < 6) return { baris1: alamat, baris2: '' };
  return { baris1: bagian.slice(0, 4).join(', '), baris2: bagian.slice(4).join(', ') };
}
