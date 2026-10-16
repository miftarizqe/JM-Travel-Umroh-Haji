// Satu sumber kebenaran status booking terkait keberangkatan — dipakai basis
// akrual (laporanKeuangan.js, lewat booking.status = 'selesai' langsung) &
// widget Cek Dana Jamaah (danaJamaah.js), biar definisi "program belum
// berangkat" gak didefinisikan ulang beda-beda di tempat lain (dikonfirmasi
// user 2026-10-16).
export const STATUS_SUDAH_BERANGKAT = ['selesai'];

// Booking yang duitnya udah masuk tapi BELUM boleh dianggap "aman dipakai" —
// 'menunggu_batal' ikut disini (bukan cuma 'active') karena pengajuan
// pembatalan belum final: kalau ditolak balik 'active', kalau disetujui
// butuh refund/kembali ke saldo — dua-duanya duitnya masih harus tetap
// "dipegang", bukan dipakai buat hal lain.
export const STATUS_BELUM_BERANGKAT_DANA_TERTAHAN = ['active', 'menunggu_batal'];
