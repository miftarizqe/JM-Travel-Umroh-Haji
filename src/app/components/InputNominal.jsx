'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { formatNominal, normalisasiNominal, parseNominal } from '@/lib/nominal';

// Pengganti <input type="number"> buat field uang: user lihat & ketik
// "3.000.000", tapi onChange tetap nerima e.target.value angka mentah
// ("3000000") — jadi handler lama `e => setX(e.target.value)` jalan apa adanya.
// desimal: izinkan koma desimal (maks 2 digit) — buat field SAR/USD/kurs.
// bolehMinus: izinkan tanda minus di depan (koreksi saldo, dst).
export default function InputNominal({ value, onChange, desimal = false, bolehMinus = false, onFocus, onBlur, ...props }) {
  const ref = useRef(null);
  const posisiCaret = useRef(null);
  const [fokus, setFokus] = useState(false);

  const mentah = desimal && fokus ? String(value ?? '') : normalisasiNominal(value, { desimal });
  const tampil = formatNominal(mentah);

  // Jaga posisi kursor: hitung jumlah karakter "bermakna" (digit, koma, minus)
  // di kiri kursor sebelum diformat ulang, lalu taruh kursor setelah jumlah
  // yang sama di teks baru — biar gak loncat ke ujung tiap titik nambah.
  useLayoutEffect(() => {
    const el = ref.current;
    const n = posisiCaret.current;
    if (!el || n === null || document.activeElement !== el) return;
    posisiCaret.current = null;
    let pos = 0, hitung = 0;
    while (pos < tampil.length && hitung < n) {
      if (/[\d,-]/.test(tampil[pos])) hitung++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [tampil]);

  const ubah = (e) => {
    const el = e.target;
    const kiri = el.value.slice(0, el.selectionStart ?? el.value.length);
    posisiCaret.current = (kiri.match(/[\d,-]/g) || []).length;
    const baru = parseNominal(el.value, { desimal, bolehMinus });
    onChange?.({ ...e, target: { name: el.name, value: baru }, currentTarget: { name: el.name, value: baru } });
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={desimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={tampil}
      onChange={ubah}
      onFocus={e => { setFokus(true); onFocus?.(e); }}
      onBlur={e => { setFokus(false); onBlur?.(e); }}
    />
  );
}
