// Adapter mock e-meterai — dipakai selama akun bisnis Peruri belum aktif.
// Tidak ada biaya/transaksi asli, cuma bikin nomor seri palsu supaya jalur
// materai_pending -> materai_selesai bisa dites end-to-end.
export async function beli({ dokumen, refId }) {
  const kodeUnik = `MOCK-MTR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  return { kodeUnik, dibeliAt: new Date() };
}
