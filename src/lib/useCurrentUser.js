'use client';
import { useEffect, useMemo, useState } from 'react';

function bacaLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('user');
  } catch {
    return null;
  }
}

// BUG (ditemukan & diperbaiki 2026-09-03): versi lama (useSyncExternalStore
// + getServerSnapshot selalu null) sengaja bikin render client PERTAMA
// "belum login" biar cocok sama HTML server — TAPI ini bikin render itu
// SEMPAT ke-commit dulu, dan halaman yang nge-guard "kalau !user, redirect
// ke /login" di useEffect ikut kepanggil dgn user=null itu (útil ~10ms
// sebelum korupsinya sempat kebenerin) — user yang SEBENARNYA udah login
// jadi ke-redirect keluar (lolos ke /login, lalu mantul lagi ke `/` karena
// ternyata udah login, kelihatan kayak halaman dashboard-nya "dibuang" pas
// dibuka lewat reload/URL langsung). Udah dicoba useLayoutEffect buat
// ngejar duluan sebelum useEffect manapun, TETAP gak ngejar (React/Next
// tetap sempat commit 1 render dgn user=null duluan).
//
// Fix: baca localStorage LANGSUNG di lazy initializer useState, SEBELUM
// render pertama sama sekali — gak ada lagi jeda "null dulu, baru
// dikoreksi belakangan" yang bisa kepakai keliru sama efek guard di
// halaman manapun. Konsekuensinya: render client pertama BISA beda dari
// HTML server kalau user lagi login (server emang selalu "belum login",
// gak punya akses localStorage) — React akan nge-log warning hydration
// mismatch di console (development doang) tapi TETAP otomatis pakai nilai
// client yang benar, gak ada dampak fungsional ke user. Ini jauh lebih
// aman drpd bug redirect-keluar yang sebelumnya beneran ngusir user dari
// halamannya sendiri.
export function useCurrentUser() {
  const [raw, setRaw] = useState(bacaLocalStorage);
  // Storage event cuma nembak antar-TAB (login/logout di tab lain) — bukan
  // pengganti baca awal di atas, cuma jaga-jaga biar tetap sinkron kalau
  // ada perubahan dari luar komponen ini.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'user' || e.key === null) setRaw(bacaLocalStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const user = useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [raw]);
  return [user];
}
