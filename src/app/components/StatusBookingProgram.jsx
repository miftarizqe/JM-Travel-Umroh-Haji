'use client';
import { statusBookingProgram } from '@/lib/bookingStage';

// Panel status booking pengganti tombol "Daftar Sekarang" di kartu /programs
// & /program/[id] begitu akun ini udah checkout program tsb (dikonfirmasi
// user 2026-10-12). Klik -> Booking Saya.
// Status "menunggu" full kuning (dikonfirmasi user 2026-10-12). Isi
// (ikon + 2 baris teks) dikelompokkan & diposisikan di TENGAH panel, teksnya
// sendiri rata kiri nempel ke ikon.
const NADA = {
  proses: { kotak: 'bg-[#F6C343] border-[#F6C343] hover:bg-[#F2B824]', ikon: 'bg-white/50', label: 'text-[#6B4E00]', teks: 'text-[#0E2F6E]' },
  aksi: { kotak: 'bg-[#E8F0FB] border-[#B9CCEB] hover:border-[#1A4FA0]', ikon: 'bg-white', label: 'text-[#1A4FA0]', teks: 'text-[#0E2F6E]' },
  selesai: { kotak: 'bg-green-50 border-green-200 hover:border-green-500', ikon: 'bg-white', label: 'text-green-700', teks: 'text-green-800' },
};

export default function StatusBookingProgram({ booking, onClick, besar = false }) {
  const st = statusBookingProgram(booking);
  const n = NADA[st.nada];
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex justify-center rounded-2xl border-2 transition-colors ${besar ? 'px-4 py-3.5 shadow-lg' : 'px-3 py-2.5'} ${n.kotak}`}>
      <span className="flex items-center gap-3 min-w-0 text-left">
        <span className={`shrink-0 rounded-full flex items-center justify-center ${besar ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-base'} ${n.ikon}`}>{st.ikon}</span>
        <span className="min-w-0">
          <span className={`block text-[10px] font-bold uppercase tracking-wider ${n.label}`}>Status Booking Anda</span>
          <span className={`block font-bold truncate ${besar ? 'text-base' : 'text-sm'} ${n.teks}`}>{st.teks}</span>
        </span>
      </span>
    </button>
  );
}
