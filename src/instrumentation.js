// Dipanggil sekali oleh Next.js saat server instance nyala.
// Dipakai untuk menjalankan sweep closing otomatis (lihat src/lib/closing-otomatis.js)
// secara berkala, tanpa perlu cron di luar aplikasi.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Tanpa JWT_SECRET login selalu 500 — teriak sejak server nyala, jangan
  // nunggu ada user yang nyoba login dulu.
  if (!process.env.JWT_SECRET?.trim()) {
    console.error('[config] JWT_SECRET kosong: login & semua API yang butuh sesi akan gagal. Set JWT_SECRET di environment.');
  }

  const { jalankanClosingOtomatis } = await import('@/lib/closing-otomatis');
  const jalan = () => jalankanClosingOtomatis().catch(e => console.error('[closing-otomatis]', e));

  setTimeout(jalan, 10_000); // sekali saat server baru nyala (delay biar pool DB siap)
  setInterval(jalan, 6 * 60 * 60 * 1000); // lalu diulang tiap 6 jam

  // Reminder stok perlengkapan WMS — cukup harian (beda sifat dari closing,
  // gak butuh presisi jam), delay awal digeser biar gak numpuk sama sweep
  // closing di atas.
  const { jalankanCekStokPerlengkapan } = await import('@/lib/perlengkapanStokOtomatis');
  const jalanStok = () => jalankanCekStokPerlengkapan().catch(e => console.error('[perlengkapan-stok-otomatis]', e));

  setTimeout(jalanStok, 15_000);
  setInterval(jalanStok, 24 * 60 * 60 * 1000);

  // Auto-terima perlengkapan — jamaah yang gak konfirmasi manual dalam 7 hari
  // sejak 'dikirim' dianggap sudah terima (lihat jalankanAutoTerimaPerlengkapan).
  const dbPool = (await import('@/lib/db')).default;
  const { jalankanAutoTerimaPerlengkapan, jalankanReminderAutoTerimaPerlengkapan } = await import('@/lib/perlengkapan');
  const jalanAutoTerima = () => jalankanAutoTerimaPerlengkapan(dbPool).catch(e => console.error('[perlengkapan-auto-terima]', e));

  setTimeout(jalanAutoTerima, 20_000);
  setInterval(jalanAutoTerima, 24 * 60 * 60 * 1000);

  // Reminder H-2 sebelum auto-terima di atas kejadian — kasih jamaah
  // kesempatan konfirmasi manual dulu sebelum otomatis dianggap diterima.
  const jalanReminderAutoTerima = () => jalankanReminderAutoTerimaPerlengkapan(dbPool).catch(e => console.error('[perlengkapan-reminder-auto-terima]', e));

  setTimeout(jalanReminderAutoTerima, 25_000);
  setInterval(jalanReminderAutoTerima, 24 * 60 * 60 * 1000);
}
