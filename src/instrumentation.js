// Dipanggil sekali oleh Next.js saat server instance nyala.
// Dipakai untuk menjalankan sweep closing otomatis (lihat src/lib/closing-otomatis.js)
// secara berkala, tanpa perlu cron di luar aplikasi.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

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
}
