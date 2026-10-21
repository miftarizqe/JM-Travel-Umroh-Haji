'use client';
import { useEffect, useState } from 'react';

const fmtTgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

// Carousel foto auto-play — dipakai di landing page (dokumentasi per
// keberangkatan) dan bisa dipakai ulang di tempat lain yang butuh galeri.
// Geser SLIDE beneran (strip semua gambar digeser transform translateX),
// bukan cuma ganti `src` di 1 <img> yang keliatan "lempeng"/motong tanpa
// animasi — ditemukan & diperbaiki 2026-10-21, transisi lama secara teknis
// gak pernah kepicu (class transition-opacity nempel di <img> yang cuma
// ganti src, bukan property yang di-animasi CSS).
//
// `images` boleh array string (URL polos, kompatibel sama pemanggil lama)
// ATAU array objek {src, judul, tanggal} — kalau ada judul, dirender jadi
// caption overlay gaya Instagram (gradient gelap di bawah) biar keterangan
// batch gak ilang begitu aja (dikonfirmasi user 2026-10-21, "kenapa gak
// dibuat kayak IG, ada caption judul batch").
export default function Slideshow({ images, aspect = 'aspect-[4/3]', intervalMs = 4000 }) {
  const [i, setI] = useState(0);
  const items = images.map(it => typeof it === 'string' ? { src: it, judul: null, tanggal: null } : it);

  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setI(p => (p + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items.length, intervalMs]);

  if (!items.length) return null;

  return (
    <div className={`relative ${aspect} rounded-xl overflow-hidden bg-gray-100 group`}>
      <div
        className="flex h-full transition-transform duration-700 ease-in-out"
        style={{ width: `${items.length * 100}%`, transform: `translateX(-${i * (100 / items.length)}%)` }}
      >
        {items.map((it, idx) => (
          <div key={idx} className="relative h-full shrink-0" style={{ width: `${100 / items.length}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.src} alt={it.judul || ''} className="w-full h-full object-cover" />
            {it.judul && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pt-10 pb-6">
                <div className="text-white font-bold text-sm leading-tight">{it.judul}</div>
                {fmtTgl(it.tanggal) && (
                  <div className="text-white/80 text-xs mt-0.5">{fmtTgl(it.tanggal)}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <>
          <button onClick={() => setI(p => (p - 1 + items.length) % items.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm">
            ‹
          </button>
          <button onClick={() => setI(p => (p + 1) % items.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm">
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {items.map((_, idx) => (
              <button key={idx} onClick={() => setI(idx)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${idx === i ? 'bg-white w-4' : 'bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
