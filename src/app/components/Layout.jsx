'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import NotificationBell from './NotificationBell';
import { useCurrentUser } from '@/lib/useCurrentUser';

const DEFAULT_CONFIRM_MSG = 'Yakin ingin keluar? Perubahan yang belum disimpan akan hilang.';

// item.path bisa bawa ?tab=... (dipakai admin) — dicocokkan terhadap query
// aktif, bukan cuma pathname, biar tiap tab admin bisa punya status aktif
// sendiri walau semuanya di path /admin yang sama.
function matchTab(item, pathname, currentTab) {
  const [itemPath, itemQuery] = item.path.split('?');
  if (pathname !== itemPath) return false;
  if (!itemQuery) return true;
  const itemTab = new URLSearchParams(itemQuery).get('tab');
  return itemTab ? itemTab === currentTab : true;
}

// Nav desktop — item dengan `children` dirender sebagai dropdown yang
// menempel (tema gelap sama seperti navbar), bukan baris kedua terpisah.
function NavPills({ items, pathname, router, guardedNavigate }) {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'dashboard';
  const [openDropdown, setOpenDropdown] = useState(null);
  const isActive = (item) => item.children ? item.children.some(c => matchTab(c, pathname, currentTab)) : matchTab(item, pathname, currentTab);

  return (
    <div className="hidden md:flex items-center gap-1">
      {items.map(item => item.children ? (
        <div key={item.label} className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
              isActive(item) ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white hover:bg-white/10'
            }`}
          >
            {item.icon} {item.label}
            <span className="text-[9px] opacity-75">{openDropdown === item.label ? '▲' : '▼'}</span>
          </button>

          {openDropdown === item.label && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />
              <div className="absolute top-full left-0 mt-2 bg-[#0E2F6E] rounded-xl py-1.5 z-20 min-w-[230px] shadow-lg border border-white/10">
                {item.children.map(c => (
                  <button
                    key={c.label}
                    onClick={() => { guardedNavigate(() => router.push(c.path)); setOpenDropdown(null); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-left whitespace-nowrap transition-all ${
                      matchTab(c, pathname, currentTab) ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{c.icon}</span>
                    <span className="flex-1">{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          key={item.label}
          onClick={() => guardedNavigate(() => router.push(item.path))}
          className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
            isActive(item) ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white hover:bg-white/10'
          }`}
        >
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  );
}

// Nav mobile (bottom bar) — item dengan children langsung ke anak pertama,
// dropdown gak masuk akal di ruang sekecil itu.
function NavBottomItems({ items, pathname, router }) {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'dashboard';
  const isActive = (item) => item.children ? item.children.some(c => matchTab(c, pathname, currentTab)) : matchTab(item, pathname, currentTab);

  return (
    <div className="flex">
      {items.map(item => {
        const target = item.children ? item.children[0].path : item.path;
        return (
          <button
            key={item.label}
            onClick={() => router.push(target)}
            className={`flex-1 flex flex-col items-center py-2 text-[10px] font-semibold transition-colors ${
              isActive(item) ? 'text-[#1A4FA0]' : 'text-gray-400'
            }`}
          >
            <span className="text-xl mb-0.5">{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Layout({ children, title, backHref, showBack, confirmLeave, confirmMessage }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user] = useCurrentUser();

  // Paksa akun yang password-nya baru di-reset admin (lihat
  // /api/profil/password) buat ganti password dulu sebelum
  // bisa akses halaman lain mana pun yang pakai Layout ini.
  useEffect(() => {
    if (user?.wajib_ganti_password) router.replace('/ganti-password-wajib');
  }, [user]);

  // Bungkus semua navigasi yang dipicu dari Layout (tombol back, nav
  // atas/bawah, logo, logout) — kalau confirmLeave true, tanya dulu
  // sebelum beneran pindah halaman, biar isian yang belum disimpan
  // gak ilang gara-gara kepencet gak sengaja.
  function guardedNavigate(go) {
    if (confirmLeave && !window.confirm(confirmMessage || DEFAULT_CONFIRM_MSG)) return;
    go();
  }

  function handleBack() {
    guardedNavigate(() => {
      if (backHref) router.push(backHref);
      else router.back();
    });
  }

  function logout() {
    guardedNavigate(async () => {
      // Cookie token httpOnly hanya bisa dihapus oleh server
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      localStorage.removeItem('user');
      router.push('/login');
    });
  }

  const navItems = {
    jamaah: [
      // "Booking" dihapus: mengarah ke halaman yang sama dengan Beranda,
      // sehingga dua tab menyala bersamaan. Booking sudah jadi bagian Beranda.
      { icon: '🏠', label: 'Beranda', path: '/dashboard/jamaah' },
      { icon: '🕌', label: 'Program', path: '/programs' },
      { icon: '👤', label: 'Profil', path: '/profil' },
    ],
    perwakilan: [
      { icon: '🏠', label: 'Beranda', path: '/dashboard/perwakilan' },
      { icon: '🕌', label: 'Program', path: '/programs' },
      { icon: '➕', label: 'Order', path: '/order-jamaah' },
      { icon: '🌳', label: 'Downline', path: '/dashboard/downline' },
      { icon: '💰', label: 'Harga', path: '/perwakilan/harga' },
      { icon: '🎟️', label: 'Voucher', path: '/voucher' },
      { icon: '👤', label: 'Profil', path: '/profil' },
    ],
    // Grup dengan `children` dirender sebagai dropdown di navbar (desktop)
    // atau langsung ke anak pertama (mobile). Isi tiap tab tetap ditentukan
    // oleh src/app/admin/page.jsx lewat query ?tab=..., bukan di sini.
    // Dikelompokkan ulang jadi 6 grup (dari 8) biar navbar gak nabrak logo —
    // Audit Trail digabung ke Akun & Jaringan (sama-sama soal jejak akun/
    // aktivitas), Order Jamaah digabung ke Approval (sama-sama proses booking),
    // konten landing page digabung ke Katalog (sama-sama konten publik),
    // Pengaturan dipangkas jadi murni konfigurasi sistem.
    admin: [
      { icon: '📊', label: 'Dashboard', path: '/admin?tab=dashboard' },
      { icon: '🔔', label: 'Approval', children: [
        { icon: '🪪', label: 'Pendaftaran', path: '/admin?tab=pendaftaran' },
        { icon: '💳', label: 'Pembayaran', path: '/admin?tab=payments' },
        { icon: '🚫', label: 'Pembatalan', path: '/admin?tab=pembatalan' },
        { icon: '💰', label: 'Custom Harga', path: '/admin?tab=customharga' },
        { icon: '➕', label: 'Order Jamaah', path: '/order-jamaah' },
      ] },
      { icon: '👥', label: 'Akun & Jaringan', children: [
        { icon: '👥', label: 'Pengguna', path: '/admin?tab=users' },
        { icon: '🌳', label: 'Hierarki & Closing', path: '/admin?tab=hierarki' },
        { icon: '🕵️', label: 'Audit Trail', path: '/admin?tab=auditlog' },
      ] },
      { icon: '📦', label: 'Katalog & Konten', children: [
        { icon: '📦', label: 'Program', path: '/admin?tab=programs' },
        { icon: '🎟️', label: 'Voucher', path: '/admin?tab=voucher' },
        { icon: '🖼️', label: 'Galeri', path: '/admin/galeri' },
        { icon: '📰', label: 'Berita & Kegiatan', path: '/admin/berita' },
        { icon: '📣', label: 'Banner Promo', path: '/admin/promo' },
        { icon: '🏠', label: 'Konten Landing Page', path: '/admin/pengaturan/skema-pembayaran' },
        { icon: '✏️', label: 'Teks Landing Page', path: '/admin/pengaturan/teks-landing' },
        // Cuma super admin — kalkulator ini nyakup komponen biaya vendor
        // (hotel, mutawwif, dll) yang sensitif, gak untuk semua admin biasa.
        // Proposal Corporate juga di sini — dibatasi super_admin sesuai
        // permintaan, bukan soal sensitif tapi biar kata-kata & harga yang
        // ditawarkan ke corporate klien terjaga konsisten dari satu pintu.
        ...(user?.role === 'super_admin' ? [
          { icon: '🧮', label: 'Costing Program', path: '/admin/program-costing' },
          { icon: '🤝', label: 'Proposal Corporate', path: '/admin/proposal-corporate' },
        ] : []),
      ] },
      { icon: '📊', label: 'Laporan', children: [
        { icon: '💰', label: 'Closing & Forecast Ujroh', path: '/admin/laporan/ujroh-closing' },
        { icon: '🧾', label: 'Invoice & Kwitansi', path: '/admin/invoice-kwitansi' },
        // Cuma super admin — semua yang berhubungan langsung sama angka
        // keuangan (HPP/margin per program, pengeluaran operasional, dll)
        // sensitif, gak untuk semua admin biasa.
        ...(user?.role === 'super_admin' ? [
          { icon: '🔒', label: 'Keuangan Program', path: '/admin/laporan/keuangan-program' },
          { icon: '🔒', label: 'Keuangan Perusahaan', path: '/admin/laporan/keuangan-perusahaan' },
          { icon: '🔒', label: 'Cashflow Bulanan', path: '/admin/laporan/cashflow' },
          { icon: '🧾', label: 'Pengajuan Dana Bulanan', path: '/admin/laporan/pengajuan-dana' },
        ] : []),
      ] },
      { icon: '⚙️', label: 'Pengaturan', children: [
        { icon: '⚙️', label: 'Pengaturan Umum', path: '/admin/pengaturan' },
        { icon: '📜', label: 'Pengaturan Dokumen', path: '/admin/pengaturan/dokumen' },
        { icon: '📤', label: 'Import Dokumen Fisik', path: '/admin/pengaturan/dokumen-fisik' },
        { icon: '💳', label: 'Metode Pembayaran', path: '/admin/pengaturan/pembayaran' },
        // Cuma super admin — pasangan dari menu Proposal Corporate di atas.
        ...(user?.role === 'super_admin' ? [
          { icon: '🤝', label: 'Company Profile Proposal', path: '/admin/pengaturan/proposal-profile' },
        ] : []),
      ] },
    ],
  };

  // super_admin superset dari admin — pakai nav yang sama (isi "Laporan"
  // di atas sudah nambahin link Keuangan Perusahaan cuma buat super_admin).
  const navRole = user?.role === 'super_admin' ? 'admin' : user?.role;
  const items = (user && navItems[navRole]) ? navItems[navRole] : [];

  return (
    <div className="min-h-screen bg-[#eef1f8]">
      {/* TOP NAVBAR — tampil di semua ukuran */}
      <nav className="sticky top-0 z-50 bg-[#0E2F6E] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => guardedNavigate(() => router.push('/'))}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/jm-travel-icon.png" alt="JM Travel" className="w-8 h-8 object-contain" />
            <div>
              <div className="font-bold text-sm leading-tight">JM Travel</div>
              <div className="text-[10px] opacity-70">Umroh & Haji</div>
            </div>
          </div>

          {/* Desktop nav links — hidden di mobile */}
          {user && (
            <Suspense fallback={<div className="hidden md:flex items-center gap-1" />}>
              <NavPills items={items} pathname={pathname} router={router} guardedNavigate={guardedNavigate} />
            </Suspense>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <NotificationBell user={user} />
                <span className="hidden md:block text-xs opacity-80 bg-white/15 px-3 py-1 rounded-full">
                  👤 {user.name.split(' ')[0]}
                </span>
                <button
                  onClick={logout}
                  className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-700 transition-colors"
                >
                  Keluar
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="bg-[#C9952A] text-white text-xs font-bold px-4 py-1.5 rounded-full"
              >
                Masuk
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* PAGE TITLE — optional, dengan tombol Kembali kalau backHref/showBack diisi */}
      {(title || showBack || backHref) && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 md:px-8">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            {(showBack || backHref) && (
              <button
                onClick={handleBack}
                aria-label="Kembali"
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-[#E8F0FB] text-[#1A4FA0] hover:bg-[#d6e4f7] transition-colors"
              >
                ←
              </button>
            )}
            {title && <h1 className="text-lg font-bold text-[#0E2F6E]">{title}</h1>}
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-4 md:px-8 pb-24 md:pb-8">
        {children}
      </main>

      {/* BOTTOM NAVBAR — hanya tampil di mobile */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-lg">
          <Suspense fallback={<div className="flex" />}>
            <NavBottomItems items={items} pathname={pathname} router={router} />
          </Suspense>
        </nav>
      )}
    </div>
  );
}
