// Tahap progres booking (dipisah dari dashboard/jamaah biar bisa dipakai
// ulang di tempat lain yang juga perlu nunjukin status booking jamaah —
// mis. Riwayat Closing sahabat/perwakilan, dikonfirmasi user 2026-09-28:
// jamaah yang di-closing-in gak selalu punya akun sendiri buat isi form,
// jadi yang closing-in (ordered_by) perlu liat & lanjutin dari sini juga.
export const STAGE_LABELS = ['DP', 'Konfirmasi', 'Formulir', 'Perjanjian', 'Lunas'];

export function formLengkap(b) {
  return b.form_filled >= b.form_total;
}

// SPJ (Surat Perjanjian Jamaah) berlaku buat SETIAP booking program umroh —
// reguler, eksklusif, maupun Program Sahabat Baitullah (dikonfirmasi user
// 2026-10-16, gantiin aturan 2026-10-08 yang ngebebasin booking Program
// Sahabat Baitullah). SPK-AK Sahabat Baitullah itu BEDA dokumen: cuma
// ditandatangani SEKALI pas pendaftaran jadi Sahabat, bukan per checkout.
//
// Selesai = SETUJU ONLINE (setuju_pks) SUDAH CUKUP buat lanjut ke pelunasan
// (dikonfirmasi user 2026-10-13) — materai + TTD fisik beneran dilakukan
// BELAKANGAN (jamaah ke kantor, atau paling lambat pas sesi manasik),
// disiapkan & diproses manajemen sendiri, BUKAN syarat buat jamaah bisa
// bayar pelunasan. Scan fisik ATAU TTD digital 'selesai' TETAP dihitung
// selesai juga (OR, bukan AND) — buat jamaah yang TTD fisik duluan di
// kantor tanpa pernah centang online sama sekali (kasus awal 2026-10-11,
// sebelumnya nyangkut selamanya kalau cuma syarat setuju_pks doang).
// SAMA PERSIS gerbang server di /api/payments (type 'lunas') & client di
// /pelunasan — jangan hitung ulang beda logic di tempat lain.
export function perjanjianSelesai(b) {
  return !!b.setuju_pks || !!b.perjanjian_scan_path || b.perjanjian_sig?.fase === 'selesai';
}

export function getStage(b) {
  if (b.pelunasan_status === 'paid') return 5;
  if (formLengkap(b) && b.dp_status === 'confirmed' && perjanjianSelesai(b)) return 4;
  if (formLengkap(b) && b.dp_status === 'confirmed') return 3;
  if (b.dp_status === 'confirmed') return 2;
  return 1;
}

// Langkah bar progres booking — BERURUTAN MURNI (dikonfirmasi user
// 2026-10-16): posisi = langkah PERTAMA yang belum selesai; semua langkah
// sebelumnya ✓, semua sesudahnya abu-abu polos MESKIPUN syaratnya udah
// kepenuhi duluan (mis. formulir diisi sambil nunggu konfirmasi DP, atau
// lunas lewat Invoice padahal form/SPJ belum). Dulu tiap titik dicek
// independen, bar-nya jadi bolong/loncat. Yang beres duluan disampaikan
// lewat `catatan` (teks di bawah bar), bukan lewat titik.
//
// Program Sahabat Baitullah beda alur: dibayar penuh dari saldo pas
// checkout (dp_status otomatis 'confirmed', bukan DP beneran), jadi
// langkah DP diganti "Bayar dari Saldo" & ujungnya Konfirmasi Admin.
//
// tiap langkah: { label, selesai, nunggu } — nunggu = giliran admin
// (bukan pemilik booking) kalau langkah itu yang jadi posisi sekarang.
export function langkahBooking(b) {
  const lunas = b.pelunasan_status === 'paid';
  const form = formLengkap(b);
  const spj = perjanjianSelesai(b);
  const dpTerakhir = Array.isArray(b.dp_payments) && b.dp_payments.length > 0 ? b.dp_payments[b.dp_payments.length - 1] : null;
  const dpDitolak = dpTerakhir ? dpTerakhir.status === 'rejected' : b.dp_status === 'rejected';
  // Lunas = urusan bayar udah beres semua, termasuk DP-nya (lunas lewat
  // jalur Invoice bisa terjadi tanpa DP pernah di-ACC terpisah).
  const langkah = b.prog_publish_type === 'sahabat_baitullah'
    ? [
        { label: 'Bayar dari Saldo', selesai: true },
        { label: 'Formulir', selesai: form },
        { label: 'Perjanjian', selesai: spj },
        { label: 'Konfirmasi Admin', selesai: lunas, nunggu: true },
      ]
    : [
        { label: 'Bayar DP', selesai: lunas || !dpDitolak },
        { label: 'Konfirmasi DP', selesai: lunas || b.dp_status === 'confirmed', nunggu: true },
        { label: 'Formulir', selesai: form },
        { label: 'Perjanjian', selesai: spj },
        { label: 'Lunas', selesai: lunas, nunggu: b.pelunasan_status === 'pending_confirm' },
      ];
  const idx = langkah.findIndex(l => !l.selesai);
  const posisi = idx === -1 ? langkah.length : idx;
  return { langkah, posisi, catatan: catatanLangkah(b, langkah, posisi, { form, lunas }) };
}

// Kalimat "langkah berikutnya" di bawah bar — netral (gak pakai "Anda")
// karena bar yang sama dipakai jamaah, sahabat yang closing-in, & admin.
function catatanLangkah(b, langkah, posisi, { form, lunas }) {
  if (posisi >= langkah.length) return { nada: 'selesai', teks: 'Semua tahap selesai.' };
  const sudahLunas = lunas ? ' Pembayaran sudah tercatat lunas.' : '';
  switch (langkah[posisi].label) {
    case 'Bayar DP':
      return { nada: 'aksi', teks: 'Bukti DP ditolak admin — unggah bukti DP baru.' };
    case 'Konfirmasi DP':
      return { nada: 'nunggu', teks: form
        ? 'Menunggu admin mengonfirmasi DP. Formulir sudah lengkap, setelah dikonfirmasi langsung lanjut ke Perjanjian.'
        : 'Menunggu admin mengonfirmasi DP. Sambil menunggu, formulir jamaah sudah bisa diisi.' };
    case 'Formulir':
      return { nada: 'aksi', teks: `Lengkapi formulir jamaah (${b.form_filled || 0}/${b.form_total || 0}).${sudahLunas}` };
    case 'Perjanjian':
      return { nada: 'aksi', teks: `Baca & setujui Surat Perjanjian Jamaah (SPJ).${sudahLunas}` };
    case 'Lunas':
      return b.pelunasan_status === 'pending_confirm'
        ? { nada: 'nunggu', teks: 'Menunggu admin mengonfirmasi pelunasan.' }
        : { nada: 'aksi', teks: 'Lanjutkan pelunasan.' };
    case 'Konfirmasi Admin':
      return { nada: 'nunggu', teks: 'Menunggu admin mengonfirmasi pemakaian saldo tabungan umroh.' };
    default:
      return null;
  }
}

// Status booking program yang SUDAH di-checkout akun ini (dikonfirmasi user
// 2026-10-12) — kartu /programs & /program/[id] nampilin status booking saat
// ini (bukan "Daftar Sekarang" lagi), lihat StatusBookingProgram.
// nada: 'proses' (nunggu admin), 'aksi' (giliran user), 'selesai' (lunas).
export function statusBookingProgram(b) {
  if (b.status === 'menunggu_batal') return { ikon: '⏳', teks: 'Proses Pembatalan', nada: 'proses' };
  const stage = getStage(b);
  if (stage === 5) return { ikon: '✅', teks: 'Lunas — Siap Berangkat', nada: 'selesai' };
  if (b.pelunasan_status === 'pending_confirm') {
    return { ikon: '⏳', teks: b.prog_publish_type === 'sahabat_baitullah' ? 'Menunggu Konfirmasi Admin' : 'Menunggu Konfirmasi Pelunasan', nada: 'proses' };
  }
  if (stage === 1) return { ikon: '⏳', teks: 'Menunggu Konfirmasi DP', nada: 'proses' };
  if (stage === 2) return { ikon: '📝', teks: 'Lengkapi Formulir Jamaah', nada: 'aksi' };
  if (stage === 3) return { ikon: '📜', teks: 'Setujui Perjanjian', nada: 'aksi' };
  return { ikon: '💰', teks: 'Lanjut Pelunasan', nada: 'aksi' };
}

// Booking aktif terbaru per program (milik / dipesan akun ini) — dipakai
// bareng statusBookingProgram di atas.
export function petaBookingAktifPerProgram(bookings) {
  const peta = {};
  for (const b of bookings || []) {
    if (!['active', 'menunggu_batal'].includes(b.status)) continue;
    const lama = peta[b.prog_id];
    if (!lama || new Date(b.created_at) > new Date(lama.created_at)) peta[b.prog_id] = b;
  }
  return peta;
}

// Booking yang pembayarannya SUDAH di-ACC admin gak bisa dibatalkan sendiri
// lagi oleh jamaah/sahabat (dikonfirmasi user 2026-10-12) — pembatalan
// setelah titik ini cuma lewat admin (POST /api/pembatalan admin_langsung).
// Reguler: DP confirmed. Checkout mandiri Sahabat Baitullah: dp_status udah
// di-set 'confirmed' otomatis pas checkout (belum di-ACC), jadi patokannya
// pelunasan 'paid' (debit saldo di-ACC admin).
export function pembayaranSudahDiAcc(b) {
  if (b.pelunasan_status === 'paid') return true;
  if (b.prog_publish_type === 'sahabat_baitullah') return false;
  return b.dp_status === 'confirmed';
}
