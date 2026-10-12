'use client';
import { STAGE_LABELS, getStage } from '@/lib/bookingStage';

// Bar progres 5 tahap booking (DP → Konfirmasi → Formulir → Perjanjian →
// Lunas) — SATU komponen dipakai jamaah/Sahabat (Booking Saya) & admin
// (modal detail booking, kartu jamaah Kelola Program), biar tahapnya gak
// beda-beda antar role (dikonfirmasi user 2026-10-12). Tahap dihitung
// getStage() — booking-nya butuh prog_publish_type & perjanjian_sig (server
// admin: lampirkanInfoStage di src/lib/bookingStageServer.js).
export default function BookingProgressBar({ booking, className = '' }) {
  const stage = getStage(booking);
  return (
    <div className={`flex items-center ${className}`}>
      {STAGE_LABELS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i + 1 <= stage ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              {i + 1 <= stage ? '✓' : i + 1}
            </div>
            <div className={`text-[9px] mt-1 ${i + 1 <= stage ? 'text-[#1A4FA0] font-bold' : 'text-gray-400'}`}>{label}</div>
          </div>
          {i < STAGE_LABELS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 mb-4 ${i + 1 < stage ? 'bg-[#1A4FA0]' : 'bg-gray-200'}`}></div>
          )}
        </div>
      ))}
    </div>
  );
}
