// Dipanggil sekali oleh Next.js saat server instance nyala.
// Dipakai untuk menjalankan sweep closing otomatis (lihat src/lib/closing-otomatis.js)
// secara berkala, tanpa perlu cron di luar aplikasi.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { jalankanClosingOtomatis } = await import('@/lib/closing-otomatis');
  const jalan = () => jalankanClosingOtomatis().catch(e => console.error('[closing-otomatis]', e));

  setTimeout(jalan, 10_000); // sekali saat server baru nyala (delay biar pool DB siap)
  setInterval(jalan, 6 * 60 * 60 * 1000); // lalu diulang tiap 6 jam
}
