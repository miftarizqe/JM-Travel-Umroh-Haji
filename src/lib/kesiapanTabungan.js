// Helper "kesiapan tabungan umroh" Jamaah Sahabat Baitullah — dipakai
// bareng di /admin/sahabat (cluster reminder) & /admin/sahabat/database
// (progress bar per orang), biar logicnya 1 sumber (2026-08-30).

export function persenKesiapan(saldo, target) {
  if (!target || target <= 0) return null;
  return Math.min(100, Math.round((Number(saldo || 0) / target) * 100));
}

export function warnaProgress(p) {
  if (p === null) return 'bg-gray-200';
  if (p >= 100) return 'bg-green-500';
  if (p >= 80) return 'bg-amber-500';
  return 'bg-[#1A4FA0]';
}

// Berapa bulan udah berjalan sejak target di-set (float, bukan dibulatkan —
// biar progresSeharusnya() halus, bukan naik tangga tiap tanggal 1).
function bulanBerjalan(targetSetAt) {
  if (!targetSetAt) return 0;
  const ms = Date.now() - new Date(targetSetAt).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30));
}

// % yang PROPORSIONAL HARUSNYA udah tercapai sejauh ini (mis. target 5
// bulan, udah jalan 2 bulan -> harusnya 40%) — null kalau target_bulan
// belum diisi (gak bisa dihitung, bukan berarti 0%).
export function progresSeharusnya(targetBulan, targetSetAt) {
  if (!targetBulan || targetBulan <= 0 || !targetSetAt) return null;
  return Math.min(100, Math.round((bulanBerjalan(targetSetAt) / targetBulan) * 100));
}

// Buffer 10 poin biar gak berisik utk yang cuma dikit ketinggalan —
// dianggap "di bawah progress" kalau beneran ketinggalan jauh.
const BUFFER_POIN = 10;

export function diBawahProgress(saldo, target, targetBulan, targetSetAt) {
  const aktual = persenKesiapan(saldo, target);
  const seharusnya = progresSeharusnya(targetBulan, targetSetAt);
  if (aktual === null || seharusnya === null) return false;
  return aktual < seharusnya - BUFFER_POIN;
}
