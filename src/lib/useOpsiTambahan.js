'use client';
import { useEffect, useState } from 'react';

// Cache per prog_id (bukan 1 cache global) — tiap program punya daftar
// opsi tambahan sendiri-sendiri, dikelola dari halaman Kelola Program.
const cache = {};

// Daftar opsi tambahan aktif MILIK 1 PROGRAM (mis. upgrade kamar, request
// khusus) yang bisa dipilih di checkout/order-jamaah, harga per jamaah.
export function useOpsiTambahan(progId) {
  const [data, setData] = useState(() => (progId && cache[progId]) || []);
  const [loading, setLoading] = useState(() => !!progId && !cache[progId]);

  useEffect(() => {
    if (!progId || cache[progId]) return;
    fetch(`/api/opsi-tambahan?prog_id=${progId}`)
      .then(r => r.json())
      .then(d => {
        cache[progId] = d.opsi || [];
        setData(cache[progId]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [progId]);

  return [data, loading];
}
