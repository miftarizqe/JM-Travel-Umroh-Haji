'use client';
import { STAGE_LABELS, formLengkap, perjanjianSelesai } from '@/lib/bookingStage';

// Bar progres 5 tahap booking (DP → Konfirmasi → Formulir → Perjanjian →
// Lunas) — SATU komponen dipakai jamaah/Sahabat (Booking Saya) & admin
// (modal detail booking, kartu jamaah Kelola Program), biar tahapnya gak
// beda-beda antar role (dikonfirmasi user 2026-10-12).
//
// Tiap titik dicek INDEPENDEN dari kondisi aslinya masing-masing (dp_status/
// form_filled/perjanjianSelesai/pelunasan_status) — BUKAN dari 1 angka
// "stage" linear (getStage()) kayak sebelumnya (ditemukan user 2026-10-14,
// "lunas tapi form belum ada, jangan dibiruin dulu"). getStage() sengaja
// langsung return 5 begitu pelunasan_status='paid' (dipakai di tempat lain
// buat nentuin AKSI berikutnya, SAH buat itu) — tapi itu nganggep form/
// perjanjian PASTI udah kelar duluan, asumsi yang BENAR di alur pembayaran
// normal (gerbangnya di /api/payments) tapi SALAH begitu admin bisa nandain
// lunas dari jalur lain (Invoice di-paid-in manual, lihat
// syncKwitansiDariInvoice) yang gak lewat gerbang form/perjanjian sama
// sekali. Booking-nya butuh prog_publish_type & perjanjian_sig (server
// admin: lampirkanInfoStage di src/lib/bookingStageServer.js).
export default function BookingProgressBar({ booking, className = '' }) {
  const dpDone = booking.dp_status === 'confirmed';
  const formDone = formLengkap(booking);
  const perjanjianDone = perjanjianSelesai(booking);
  const lunasDone = booking.pelunasan_status === 'paid';
  // DP & Konfirmasi SAMA kondisinya (dp_status confirmed) -- dua titik
  // ini emang representasi 1 syarat yang sama, dipecah visual doang.
  const selesai = [dpDone, dpDone, formDone, perjanjianDone, lunasDone];
  return (
    <div className={`flex items-center ${className}`}>
      {STAGE_LABELS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              selesai[i] ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              {selesai[i] ? '✓' : i + 1}
            </div>
            <div className={`text-[9px] mt-1 ${selesai[i] ? 'text-[#1A4FA0] font-bold' : 'text-gray-400'}`}>{label}</div>
          </div>
          {i < STAGE_LABELS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 mb-4 ${selesai[i] && selesai[i + 1] ? 'bg-[#1A4FA0]' : 'bg-gray-200'}`}></div>
          )}
        </div>
      ))}
    </div>
  );
}
