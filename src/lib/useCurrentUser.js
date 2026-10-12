'use client';
import { useEffect, useMemo, useState } from 'react';

function bacaLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    // Sesi 24 jam sejak login (dikonfirmasi user 2026-10-12) — cache data
    // user yang udah lewat batasnya dibuang (cookie-nya sendiri udah dibuang
    // browser/proxy). Cache lama tanpa sesi_berakhir_at dibiarkan (cookie
    // tetap dibatasi server & proxy).
    const u = raw ? JSON.parse(raw) : null;
    if (u?.sesi_berakhir_at && Date.now() >= u.sesi_berakhir_at) {
      localStorage.removeItem('user');
      return null;
    }
    return raw;
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
  // Tab lagi kebuka pas sesinya habis -> bersihin cache & langsung arahkan
  // ke login (bukan nunggu klik yang gagal 401).
  useEffect(() => {
    let u = null;
    try { u = raw ? JSON.parse(raw) : null; } catch { u = null; }
    if (!u?.sesi_berakhir_at) return;
    const habiskan = () => {
      try { localStorage.removeItem('user'); } catch {}
      setRaw(null);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?sesi=habis&from=${encodeURIComponent(window.location.pathname)}`;
      }
    };
    // setTimeout maks ~24.8 hari, sesi 24 jam aman.
    const t = setTimeout(habiskan, Math.max(0, u.sesi_berakhir_at - Date.now()));
    return () => clearTimeout(t);
  }, [raw]);
  return [user];
}

// Pasangan `useCurrentUser` buat halaman yang render "Loading..." selagi
// nunggu `user` (bukan buat guard redirect efek — itu tetap harus baca
// `user`/`useCurrentUser()` langsung, lihat komentar di atas). Server SELALU
// `false` di render pertama; client juga `false` di render pertama (baru
// `true` sesudah effect mount jalan) — jadi cabang render yang gantungin ke
// `mounted` (mis. `if (!mounted || !user) return <Loading/>`) otomatis
// identik antara server & client, gak ada lagi hydration mismatch warning
// kayak yang kejadian di Layout.jsx (fix yg sama, lihat komentar di sana
// 2026-09-06) — `user` sendiri TETAP kebaca langsung dari mount pertama jadi
// prefill form dsb yang butuh nilai asli dari awal tidak ikut ketunda.
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

// Ambil status & verifikasi akun TERKINI dari server, lalu segarkan cache
// localStorage. Cache `user` cuma diisi pas login, jadi akun yang baru
// di-verifikasi/ACC admin sesudah login tetap kebaca "belum diverifikasi"
// sampai logout-login ulang (bug ditemukan 2026-10-11) — dipakai di gerbang
// "Daftar Program" & checkout biar gak nyangkut di nilai lama.
// /api/profil gak ngirim kolom mentah terverifikasi, cuma status_akun.
// Gagal fetch -> balikin user dari cache apa adanya.
export async function segarkanStatusUser(user) {
  if (!user?.id) return user;
  try {
    const res = await fetch(`/api/profil?user_id=${user.id}`);
    const d = await res.json();
    if (!res.ok || !d.user) return user;
    const updated = {
      ...user,
      status: d.user.status,
      terverifikasi: d.user.status_akun !== 'belum_diverifikasi',
    };
    try { localStorage.setItem('user', JSON.stringify(updated)); } catch {}
    return updated;
  } catch {
    return user;
  }
}
