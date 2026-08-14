'use client';
import { useEffect, useState } from 'react';

// Carousel foto auto-play sederhana — dipakai di landing page (dokumentasi
// per keberangkatan) dan bisa dipakai ulang di tempat lain yang butuh galeri.
export default function Slideshow({ images, aspect = 'aspect-[4/3]', intervalMs = 4000 }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setI(p => (p + 1) % images.length), intervalMs);
    return () => clearInterval(t);
  }, [images.length, intervalMs]);

  if (!images.length) return null;

  return (
    <div className={`relative ${aspect} rounded-xl overflow-hidden bg-gray-100 group`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[i]} alt="" className="w-full h-full object-cover transition-opacity duration-500" />

      {images.length > 1 && (
        <>
          <button onClick={() => setI(p => (p - 1 + images.length) % images.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm">
            ‹
          </button>
          <button onClick={() => setI(p => (p + 1) % images.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm">
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, idx) => (
              <button key={idx} onClick={() => setI(idx)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${idx === i ? 'bg-white w-4' : 'bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
