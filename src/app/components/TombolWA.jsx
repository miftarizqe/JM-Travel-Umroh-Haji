'use client';
import { waLink } from '@/lib/usePengaturan';

// Tombol generik buat buka WhatsApp ke SATU nomor dengan pesan siap-edit.
// Ini BUKAN pengiriman otomatis — cuma buka wa.me dengan teks udah keisi,
// admin masih harus klik kirim sendiri di WhatsApp (wa.me gak bisa attach
// file, jadi ini murni pesan teks).
export default function TombolWA({ nomor, pesan, label, className, disabled }) {
  const link = waLink(nomor, pesan);
  if (!link) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-gray-400 ${className || ''}`} title="Nomor WA belum diisi">
        📵 {label || 'Kirim WA'} (nomor belum ada)
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.open(link, '_blank')}
      className={className || 'inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap'}>
      💬 {label || 'Kirim WA'}
    </button>
  );
}
