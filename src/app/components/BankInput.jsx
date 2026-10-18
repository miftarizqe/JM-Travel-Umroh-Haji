'use client';
import { useState } from 'react';
import SearchableSelect from './SearchableSelect';
import { OPSI_DAFTAR_BANK, DAFTAR_BANK } from '@/lib/daftarBank';

// Field "Nama Bank" — dropdown bisa dicari dari daftar bank Indonesia
// (dikonfirmasi user 2026-10-18, gantiin free-text biar gak ada variasi
// penulisan beda-beda per orang). Pilih "Lainnya" buat ketik manual kalau
// bank-nya gak ada di daftar. `value` tetap string nama bank apa adanya
// (gak ada kode/ID terpisah), jadi drop-in replacement buat input lama.
export default function BankInput({ value, onChange, placeholder, className }) {
  const [modeManual, setModeManual] = useState(!!value && !DAFTAR_BANK.includes(value));

  if (modeManual) {
    return (
      <div>
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'Ketik nama bank'} className={className} />
        <button type="button" onClick={() => { setModeManual(false); onChange(''); }}
          className="text-[11px] font-bold text-[#1A4FA0] mt-1 hover:underline">← Pilih dari daftar bank</button>
      </div>
    );
  }

  return (
    <SearchableSelect
      options={OPSI_DAFTAR_BANK}
      value={value}
      onChange={v => { if (v === '__lainnya__') { setModeManual(true); onChange(''); } else { onChange(v); } }}
      placeholder={placeholder || 'Cari nama bank...'}
    />
  );
}
