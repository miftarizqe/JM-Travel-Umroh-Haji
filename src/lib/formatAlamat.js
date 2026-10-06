// Rangkai alamat 1 baris dari komponen terpisah (jalan/no rumah/RT/RW/
// kelurahan/kecamatan/kota/provinsi/negara) jadi kalimat yang enak dibaca
// nyambung — "Jl. X No. Y, RT A/RW B, Kel. C, Kec. D, Kota, Provinsi,
// Negara" — bukan cuma comma-join polos kayak sebelumnya (dikonfirmasi
// user 2026-10-06, sebelumnya "Durian Raya, 05, 006, 004, Jagakarsa, ..."
// gak jelas mana nomor rumah mana RT/RW). Dipakai di manapun kolom alamat
// flat (alamat/alamat_ktp/alamat_domisili/alamat_kirim) disusun dari
// komponen AddressFields.jsx. BEDA dari formatAlamatDuaBaris
// (pdfDokumen/alamatDuaBaris.js) yang formatnya sendiri, udah dikonfirmasi
// terpisah khusus dokumen legal 2 baris — JANGAN disatuin.
export function formatAlamatSatuBaris({ jalan, norumah, rt, rw, kel, kec, kota, provinsi, kp, negara }) {
  const parts = [];
  if (jalan) parts.push(`Jl. ${jalan}${norumah ? ` No. ${norumah}` : ''}`);
  if (rt || rw) parts.push(`RT ${rt || '-'}/RW ${rw || '-'}`);
  if (kel) parts.push(`Kel. ${kel}`);
  if (kec) parts.push(`Kec. ${kec}`);
  if (kota) parts.push(kota);
  if (provinsi) parts.push(kp ? `${provinsi} ${kp}` : provinsi);
  if (negara) parts.push(negara);
  return parts.join(', ');
}
