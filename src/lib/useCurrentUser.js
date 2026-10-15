'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { isRuteTerlindungi } from '@/lib/ruteTerlindungi';

function bacaLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    // Sesi 4 jam sejak login (dikonfirmasi user 2026-10-13) — cache data
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
// Cache `user` di localStorage cuma "tebakan" — sumber kebenaran sesi itu
// cookie httpOnly yang gak kebaca JS. Kalau cookie-nya udah gak berlaku
// (sesi 4 jam habis, cache lama tanpa sesi_berakhir_at, logout di perangkat/
// tab lain, dst) cache-nya bisa nyangkut: nama masih nongol di navbar
// landing page padahal klik Dashboard dilempar ke /login (bug 2026-10-14).
// Jadi tiap page load, kalau ada cache, tanya server SEKALI (dibagi ke
// semua pemakai hook ini) — sesi gak aktif -> cache dibuang, tampil mode tamu.
let cekSesiPromise = null;

// Hydration (2026-10-15): pas halaman dibuka lewat page load PENUH (reload,
// link langsung, & sekarang SELALU sesudah login/register/logout karena
// pakai window.location — lihat login/page.jsx), HTML-nya dari server yang
// gak bisa baca localStorage -> render "belum tau user". Kalau render
// client pertama langsung baca localStorage (lazy init lama), hasilnya
// beda -> "Hydration failed" & seluruh tree dirender ulang.
// Fix: useSyncExternalStore + getServerSnapshot = `undefined` ("belum tau").
// React sendiri yang tau komponen mana lagi hydration — termasuk isi
// <Suspense> yang hydrate BELAKANGAN (flag global "udah hydrate" gak bisa
// dipakai: komponen di luar Suspense keburu jalanin effect-nya duluan).
// Mount biasa (navigasi client/router.push) langsung pakai getSnapshot,
// gak ada jeda. `null` = beneran gak ada user.
// Guard "kalau gak login -> /login" WAJIB cek `user === null`, bukan
// `!user` — itu sumber bug redirect-keluar 2026-09-03 (lihat di atas:
// dulu getServerSnapshot = null, gak bisa dibedain dari "gak login").
const pendengarCache = new Set();

function buangCacheUser() {
  try { localStorage.removeItem('user'); } catch {}
  for (const fn of pendengarCache) fn();
}

// Storage event cuma nembak antar-TAB (login/logout di tab lain); perubahan
// di tab yang sama lewat buangCacheUser. Penulisan localStorage lain di tab
// yang sama ikut kebaca begitu komponen render ulang (getSnapshot dibaca
// tiap render).
function langganan(onChange) {
  pendengarCache.add(onChange);
  const onStorage = e => { if (e.key === 'user' || e.key === null) onChange(); };
  window.addEventListener('storage', onStorage);
  return () => {
    pendengarCache.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}
const snapshotServer = () => undefined;

function cekSesiServer() {
  if (!cekSesiPromise) {
    cekSesiPromise = fetch('/api/auth/sesi', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null); // offline/error -> jangan buang apa-apa
  }
  return cekSesiPromise;
}

// Return [user, sesiTerkonfirmasi]. `user` = cache localStorage (langsung
// ada dari render pertama, dipakai guard & prefill). `sesiTerkonfirmasi` =
// server udah bilang cookie sesinya masih aktif — dipakai tampilan publik
// (navbar landing page) biar nama akun yang terakhir login di perangkat ini
// gak nongol SAMA SEKALI (bahkan sekilas) begitu sesi 4 jam-nya habis
// (dikonfirmasi user 2026-10-14).
export function useCurrentUser() {
  const raw = useSyncExternalStore(langganan, bacaLocalStorage, snapshotServer);
  const [sesiTerkonfirmasi, setSesiTerkonfirmasi] = useState(false);
  useEffect(() => {
    if (!raw) return;
    let batal = false;
    cekSesiServer().then(d => {
      if (batal || !d) return;
      if (d.aktif) { setSesiTerkonfirmasi(true); return; }
      // Cache keburu diganti (mis. barusan login) -> jangan dibuang.
      let sekarang = null;
      try { sekarang = localStorage.getItem('user'); } catch {}
      if (sekarang === raw) buangCacheUser();
    });
    return () => { batal = true; };
  }, [raw]);
  const user = useMemo(() => {
    if (raw === undefined) return undefined;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [raw]);
  // Tab lagi kebuka pas sesinya habis -> bersihin cache. Di halaman privat
  // langsung arahkan ke login (bukan nunggu klik yang gagal 401); di halaman
  // publik (landing page, dst) cukup balik ke mode tamu (dikonfirmasi user
  // 2026-10-14).
  useEffect(() => {
    let u = null;
    try { u = raw ? JSON.parse(raw) : null; } catch { u = null; }
    if (!u?.sesi_berakhir_at) return;
    const habiskan = () => {
      buangCacheUser();
      const path = window.location.pathname;
      if (isRuteTerlindungi(path)) {
        window.location.href = `/login?sesi=habis&from=${encodeURIComponent(path)}`;
      }
    };
    // setTimeout maks ~24.8 hari, sesi 4 jam aman.
    const t = setTimeout(habiskan, Math.max(0, u.sesi_berakhir_at - Date.now()));
    return () => clearTimeout(t);
  }, [raw]);
  return [user, !!user && sesiTerkonfirmasi];
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
