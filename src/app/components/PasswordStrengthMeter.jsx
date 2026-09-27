'use client';
import { kekuatanPassword } from '@/lib/passwordStrength';

const WARNA = {
  lemah: 'bg-red-500',
  sedang: 'bg-yellow-500',
  kuat: 'bg-green-500',
};
const WARNA_TEKS = {
  lemah: 'text-red-500',
  sedang: 'text-yellow-600',
  kuat: 'text-green-600',
};

// Visual doang — TIDAK menghalangi submit, cuma ngingetin user (dikonfirmasi
// user 2026-09-27). Gak render apa-apa kalau password masih kosong.
export default function PasswordStrengthMeter({ password }) {
  const { level, label, persen } = kekuatanPassword(password);
  if (level === 'kosong') return null;

  return (
    <div className="mt-1.5">
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${WARNA[level]}`} style={{ width: `${persen}%` }} />
      </div>
      <div className={`text-[10px] mt-1 font-semibold ${WARNA_TEKS[level]}`}>
        Kekuatan password: {label}
        {level !== 'kuat' && <span className="text-gray-400 font-normal"> — min. 8 karakter + huruf besar, kecil, dan angka</span>}
      </div>
    </div>
  );
}
