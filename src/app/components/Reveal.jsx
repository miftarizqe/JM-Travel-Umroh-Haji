'use client';
import { useEffect, useRef, useState } from 'react';

// Fade + slide-up pas section masuk viewport, sekali aja (gak reset pas
// discroll keluar lagi) — IntersectionObserver murni, sengaja gak nambah
// dependency (framer-motion dkk) buat efek sekecil ini (dikonfirmasi user
// 2026-10-23, kompetitor punya animasi, landing kita masih statis).
export default function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.unobserve(el); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}>
      {children}
    </div>
  );
}
