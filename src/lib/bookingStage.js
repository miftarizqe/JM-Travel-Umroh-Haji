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
export function perjanjianSelesai(b) {
  if (b.prog_publish_type === 'sahabat_baitullah') return true;
  return !!b.setuju_pks && (!!b.perjanjian_scan_path || b.perjanjian_sig?.fase === 'selesai');
}

export function getStage(b) {
  if (b.pelunasan_status === 'paid') return 5;
  if (formLengkap(b) && b.dp_status === 'confirmed' && perjanjianSelesai(b)) return 4;
  if (formLengkap(b) && b.dp_status === 'confirmed') return 3;
  if (b.dp_status === 'confirmed') return 2;
  return 1;
}
