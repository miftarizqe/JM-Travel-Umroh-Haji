'use client';
import { useRef, useState } from 'react';

// Pengganti <input type="date"> di semua form (2026-10-08). Segmen bulan di
// input tanggal bawaan browser perilakunya beda-beda — ada yang bisa diketik
// lebih dari 12 lalu value-nya diam-diam jadi kosong. Di sini user ngetik
// DD/MM/YYYY dengan validasi per segmen (hari 01-31, bulan 01-12, tahun 4
// digit, tanggal yang gak ada di bulan itu dikoreksi ke hari terakhir), plus
// tombol kalender yang tetap buka picker bawaan browser.
//
// Drop-in: value tetap string 'YYYY-MM-DD' dan onChange tetap dipanggil
// dengan { target: { value } } — onChange cuma dipanggil kalau tanggal sudah
// lengkap & valid, atau '' kalau dikosongkan. Ketikan setengah jadi yang
// ditinggal (blur) dibalikin ke value terakhir.

const LAYOUT = /^((sm|md|lg|xl):)?(flex-|grow|shrink|basis-|w-|min-w-|max-w-|m[trblxy]?-|-m[trblxy]?-|col-span|self-)/;

function hariDalamBulan(y, m) {
  return new Date(Number(y), Number(m), 0).getDate();
}

function dariIso(v) {
  const s = String(v || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

function keIso(teks) {
  const hasil = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(teks);
  return hasil ? `${hasil[3]}-${hasil[2]}-${hasil[1]}` : null;
}

// Ketikan mentah -> "DD/MM/YYYY" (atau sebagian). Digit yang bikin segmen gak
// valid (hari > 31, bulan > 12, 00) langsung ditolak.
function rapikan(mentah) {
  let d = '', m = '', y = '';
  for (const ch of mentah) {
    if (ch === '/') {
      if (d.length === 1 && !m) d = '0' + d;
      else if (m.length === 1 && !y) m = '0' + m;
      continue;
    }
    if (ch < '0' || ch > '9') continue;
    if (d.length < 2) {
      if (!d) d = ch > '3' ? '0' + ch : ch;
      else if (d + ch !== '00' && Number(d + ch) <= 31) d += ch;
    } else if (m.length < 2) {
      if (!m) m = ch > '1' ? '0' + ch : ch;
      else if (m + ch !== '00' && Number(m + ch) <= 12) m += ch;
    } else if (y.length < 4) {
      y += ch;
    }
  }
  if (y.length === 4 && Number(y) > 0 && Number(d) > hariDalamBulan(y, m)) {
    d = String(hariDalamBulan(y, m)).padStart(2, '0');
  }
  let teks = d;
  if (m || y) teks += '/' + m;
  if (y) teks += '/' + y;
  // Pertahankan "/" yang baru diketik biar user lihat segmennya pindah.
  if (mentah.endsWith('/') && ((d.length === 2 && !m) || (m.length === 2 && !y))) teks += '/';
  return teks;
}

export default function InputTanggal({ value, onChange, className = '', disabled, required, title, id, name, min, max }) {
  const [teks, setTeks] = useState(() => dariIso(value));
  const [valueLalu, setValueLalu] = useState(value);
  const picker = useRef(null);

  // value diganti dari luar (reset form, buka data lain) -> sinkronkan teks.
  if (value !== valueLalu) {
    setValueLalu(value);
    if (keIso(teks) !== String(value || '').slice(0, 10)) setTeks(dariIso(value));
  }

  function kirim(iso) {
    onChange?.({ target: { value: iso, name } });
  }

  function ketik(e) {
    const baru = rapikan(e.target.value);
    setTeks(baru);
    if (!baru) return kirim('');
    const iso = keIso(baru);
    if (iso && Number(iso.slice(0, 4)) >= 1000) kirim(iso);
  }

  function blur() {
    const iso = keIso(teks);
    if (teks && !(iso && Number(iso.slice(0, 4)) >= 1000)) setTeks(dariIso(value));
  }

  function bukaKalender() {
    try { picker.current?.showPicker(); } catch { picker.current?.focus(); }
  }

  const token = className.split(/\s+/).filter(Boolean);
  const layout = token.filter(t => LAYOUT.test(t));
  const sisa = token.filter(t => !LAYOUT.test(t));
  const punyaLebar = layout.some(t => /(^|:)(flex-|grow|basis-|w-)/.test(t));

  return (
    <div className={`relative ${punyaLebar ? '' : 'inline-block'} ${layout.join(' ')}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        id={id}
        name={name}
        title={title}
        required={required}
        disabled={disabled}
        value={teks}
        onChange={ketik}
        onBlur={blur}
        maxLength={10}
        className={`${sisa.join(' ')} ${punyaLebar ? 'w-full' : ''} pr-9`}
      />
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        value={String(value || '').slice(0, 10)}
        onChange={e => { if (e.target.value) { setTeks(dariIso(e.target.value)); kirim(e.target.value); } }}
        className="absolute left-0 bottom-0 w-full h-0 opacity-0 pointer-events-none"
      />
      <button
        type="button"
        onClick={bukaKalender}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Pilih dari kalender"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
    </div>
  );
}
