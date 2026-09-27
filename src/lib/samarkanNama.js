// Samarkan nama buat ditampilkan ke publik/pihak lain (mis. "Sahabat
// Jungkook" -> "Sa***** Ju*****"): 2 huruf pertama tiap kata tetap, sisanya
// bintang. Cukup buat orang yang memang kenal perekrutnya mengenali, tapi
// gak bocorin nama lengkap anggota ke siapa pun yang iseng coba-coba kode.
export function samarkanNama(nama) {
  return String(nama || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(k => (k.length <= 2 ? k[0] + '*' : k.slice(0, 2) + '*'.repeat(k.length - 2)))
    .join(' ');
}
