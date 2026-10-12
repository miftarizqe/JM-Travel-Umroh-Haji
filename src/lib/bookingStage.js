// Tahap progres booking (dipisah dari dashboard/jamaah biar bisa dipakai
// ulang di tempat lain yang juga perlu nunjukin status booking jamaah —
// mis. Riwayat Closing sahabat/perwakilan, dikonfirmasi user 2026-09-28:
// jamaah yang di-closing-in gak selalu punya akun sendiri buat isi form,
// jadi yang closing-in (ordered_by) perlu liat & lanjutin dari sini juga.
export const STAGE_LABELS = ['DP', 'Konfirmasi', 'Formulir', 'Perjanjian', 'Lunas'];

export function formLengkap(b) {
  return b.form_filled >= b.form_total;
}

// Booking checkout mandiri Program Sahabat Baitullah (program eksklusif,
// dibayar dari saldo tabungan umroh) TIDAK PERNAH punya tahap Perjanjian
// Jamaah per-booking sendiri -- perjanjiannya (SPK-AK) udah ditandatangani
// SEKALI pas pendaftaran jadi Sahabat Baitullah, bukan diulang tiap booking
// (dikonfirmasi user 2026-10-08, sebelumnya booking jenis ini kekunci
// selamanya di "Baca & Setujui Perjanjian" yang gak akan pernah kepenuhi).
//
// Selesai = scan fisik (materai + TTD) sudah diunggah admin ATAU TTD digital
// selesai — SAMA dengan gerbang server di /api/payments (type 'lunas').
// setuju_pks (centang online) SENGAJA bukan syarat (2026-10-11): jamaah yang
// TTD fisik di kantor sering gak pernah centang online, jadi dulu nyangkut
// selamanya di tahap Perjanjian walau scan-nya udah diunggah & diverifikasi.
export function perjanjianSelesai(b) {
  if (b.prog_publish_type === 'sahabat_baitullah') return true;
  return !!b.perjanjian_scan_path || b.perjanjian_sig?.fase === 'selesai';
}

export function getStage(b) {
  if (b.pelunasan_status === 'paid') return 5;
  if (formLengkap(b) && b.dp_status === 'confirmed' && perjanjianSelesai(b)) return 4;
  if (formLengkap(b) && b.dp_status === 'confirmed') return 3;
  if (b.dp_status === 'confirmed') return 2;
  return 1;
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
