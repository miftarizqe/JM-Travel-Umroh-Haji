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
