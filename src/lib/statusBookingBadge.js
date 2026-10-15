// Label + warna badge status booking (bookings.status) — dipakai bareng di
// halaman Riwayat Closing admin & sahabat. Sebelumnya semua status
// di-hardcode abu-abu, "active" & "dibatalkan" gak bisa dibedain selain dari
// teksnya (dikonfirmasi user 2026-10-16).
export const STATUS_BOOKING_BADGE = {
  active: { label: '▶ Berjalan', cls: 'bg-green-100 text-green-700 border border-green-300' },
  selesai: { label: '✓ Selesai', cls: 'bg-blue-100 text-blue-700 border border-blue-300' },
  menunggu_batal: { label: '⏳ Proses Batal', cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
  dibatalkan: { label: '✕ Dibatalkan', cls: 'bg-red-100 text-red-700 border border-red-300' },
};

export function statusBookingBadge(status) {
  return STATUS_BOOKING_BADGE[status] || { label: status || '-', cls: 'bg-gray-100 text-gray-600 border border-gray-300' };
}
