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
  if (b.prog_publish_type === 'sahabat_baitullah') return true;
  return !!b.setuju_pks || !!b.perjanjian_scan_path || b.perjanjian_sig?.fase === 'selesai';
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
