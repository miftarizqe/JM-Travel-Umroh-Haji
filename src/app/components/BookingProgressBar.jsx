'use client';
import { langkahBooking } from '@/lib/bookingStage';

// Bar progres booking — SATU komponen dipakai jamaah/Sahabat (Booking Saya,
// Riwayat Closing) & admin (modal detail booking, kartu jamaah Kelola
// Program), biar tahapnya gak beda-beda antar role (dikonfirmasi user
// 2026-10-12).
//
// BERURUTAN MURNI (dikonfirmasi user 2026-10-16) — logika langkah & posisi
// ada di langkahBooking() (src/lib/bookingStage.js): titik sebelum posisi
// ✓ biru, titik posisi = "giliran" (cincin biru) atau "menunggu admin"
// (kuning ⏳), titik sesudahnya SELALU abu-abu polos. Gak ada lagi titik
// yang nyala loncat di depan titik yang belum selesai. Booking-nya butuh
// prog_publish_type & perjanjian_sig (server admin: lampirkanInfoStage di
// src/lib/bookingStageServer.js).
//
// `keterangan` (default true) = kalimat "langkah berikutnya" di bawah bar;
// dimatiin di list ringkas yang udah punya chip status sendiri.
const NADA_CATATAN = {
  aksi: 'bg-[#E8F0FB] text-[#1A4FA0]',
  nunggu: 'bg-amber-50 text-amber-700',
  selesai: 'bg-green-50 text-green-700',
};
const IKON_CATATAN = { aksi: '👉', nunggu: '⏳', selesai: '✅' };

export default function BookingProgressBar({ booking, className = '', keterangan = true }) {
  const { langkah, posisi, catatan } = langkahBooking(booking);
  return (
    <div className={className}>
      <div className="flex items-center">
        {langkah.map((l, i) => {
          const sudah = i < posisi;
          const kini = i === posisi;
          const nunggu = kini && l.nunggu;
          const titik = sudah ? 'bg-[#1A4FA0] text-white'
            : nunggu ? 'bg-amber-100 text-amber-700 border-2 border-amber-400'
            : kini ? 'bg-white text-[#1A4FA0] border-2 border-[#1A4FA0] ring-4 ring-[#1A4FA0]/20 animate-pulse'
            : 'bg-gray-100 text-gray-400';
          const teks = sudah ? 'text-[#1A4FA0] font-bold'
            : nunggu ? 'text-amber-700 font-bold'
            : kini ? 'text-[#1A4FA0] font-bold'
            : 'text-gray-400';
          return (
            <div key={l.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${titik}`}>
                  {sudah ? '✓' : nunggu ? '⏳' : i + 1}
                </div>
                <div className={`text-[9px] mt-1 text-center leading-tight ${teks}`}>{l.label}</div>
              </div>
              {i < langkah.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mb-4 ${sudah ? 'bg-[#1A4FA0]' : 'bg-gray-200'}`}></div>
              )}
            </div>
          );
        })}
      </div>
      {keterangan && catatan && (
        <div className={`mt-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${NADA_CATATAN[catatan.nada]}`}>
          {IKON_CATATAN[catatan.nada]} {catatan.teks}
        </div>
      )}
    </div>
  );
}
