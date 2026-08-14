'use client';
import { useEffect, useState } from 'react';

// Cache sederhana di module scope — sama pola kayak usePengaturan.js.
let cache = null;

// Daftar metode pembayaran aktif (bisa lebih dari satu — beberapa bank,
// e-wallet, QRIS, dst). Dikelola dari /admin/pengaturan/pembayaran.
export function useMetodePembayaran() {
  const [data, setData] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    fetch('/api/metode-pembayaran')
      .then(r => r.json())
      .then(d => {
        cache = d.metode || [];
        setData(cache);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return [data, loading];
}
