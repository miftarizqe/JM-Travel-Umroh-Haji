'use client';
import { useEffect, useState } from 'react';

let cache = null;

// Semua teks statis landing page (headline, tagline, dst) — dikelola dari
// /admin/pengaturan/teks-landing. Return { kunci: nilai } map; pemanggil
// selalu kasih fallback (mis. teks.hero_badge || 'default') buat jaga-jaga
// sebelum fetch selesai / kalau suatu kunci somehow kehapus dari DB.
export function useLandingTeks() {
  const [data, setData] = useState(cache || {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    fetch('/api/landing-teks')
      .then(r => r.json())
      .then(d => {
        cache = d.teks || {};
        setData(cache);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return [data, loading];
}
