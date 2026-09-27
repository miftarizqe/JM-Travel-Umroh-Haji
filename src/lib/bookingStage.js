// Tahap progres booking (dipisah dari dashboard/jamaah biar bisa dipakai
// ulang di tempat lain yang juga perlu nunjukin status booking jamaah —
// mis. Riwayat Closing sahabat/perwakilan, dikonfirmasi user 2026-09-28:
// jamaah yang di-closing-in gak selalu punya akun sendiri buat isi form,
// jadi yang closing-in (ordered_by) perlu liat & lanjutin dari sini juga.
export const STAGE_LABELS = ['DP', 'Konfirmasi', 'Formulir', 'Perjanjian', 'Lunas'];

export function formLengkap(b) {
  return b.form_filled >= b.form_total;
}

export function perjanjianSelesai(b) {
  return !!b.setuju_pks && (!!b.perjanjian_scan_path || b.perjanjian_sig?.fase === 'selesai');
}

export function getStage(b) {
  if (b.pelunasan_status === 'paid') return 5;
  if (formLengkap(b) && b.dp_status === 'confirmed' && perjanjianSelesai(b)) return 4;
  if (formLengkap(b) && b.dp_status === 'confirmed') return 3;
  if (b.dp_status === 'confirmed') return 2;
  return 1;
}
