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

// Nav desktop (jamaah/perwakilan — daftar flat, gak perlu sidebar/accordion
// buat sedikit item begini) — item dengan `children` dirender sebagai
// dropdown yang menempel (tema gelap sama seperti navbar), bukan baris kedua
// terpisah.
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

// Nav mobile (bottom bar, jamaah/perwakilan) — item dengan children langsung
// ke anak pertama, dropdown gak masuk akal di ruang sekecil itu.
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

// Sidebar admin — dikelompokkan per divisi (Operasional, Program & Pricing,
// Gudang, Finance, Marketing, Akun & Jaringan, Pengaturan), bukan lagi
// navbar horizontal (dulu 6-7 grup udah nabrak logo di layar sempit).
// Grup yang cuma py 1 anak (mis. Gudang buat admin biasa non-super_admin,
// atau setelah filter role) dirender jadi 1 link datar aja — gak masuk akal
// nyuruh 2x klik buka accordion cuma buat 1 pilihan.
// Kumpulin semua leaf item (yang punya .path) dari `children`, turun ke
// subgrup bersarang kalau ada (.children lagi) — dipakai buat cek "grup ini
// aktif gak" tanpa peduli seberapa dalam nestingnya.
function flattenLeaves(children) {
  let leaves = [];
  for (const c of children) {
    leaves = c.children ? leaves.concat(flattenLeaves(c.children)) : leaves.concat([c]);
  }
  return leaves;
}

// Status buka-tutup grup sidebar HARUS tahan remount (dikonfirmasi user
// 2026-09-06) — tiap halaman admin manggil <Layout> sendiri-sendiri (bukan
// nested layout.js Next yang persist), jadi SidebarNav ke-remount TOTAL
// tiap pindah halaman. Kalau openGroups cuma di useState biasa, state-nya
// ke-reset ulang tiap klik (cuma nyisain grup yang aktif buat halaman baru),
// keliatan kayak "sidebar collapse sendiri" terus "balik lagi" pas navigasi
// balik — bukan animasi, beneran dihitung ulang dari nol. Variabel modul ini
// hidup selama sesi SPA (cuma reset kalau bener-bener full reload), jadi
// grup yang sengaja dibuka/ditutup manual admin tetap awet dibawa lintas
// halaman, gak "loncat-loncat".
let sidebarOpenGroupsStore = new Set();

function SidebarNav({ dashboardItem, groups, pathname, guardedNavigate, onNavigate }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'dashboard';
  const groupAktif = (g) => flattenLeaves(g.children).some(c => matchTab(c, pathname, currentTab));
  // Kunci grup yang lagi aktif — termasuk subgrup bersarang (kunci gabungan
  // "parent::sub"), biar auto-expand kebuka sampai ke dalam kayak grup biasa.
  function kunciAktif() {
    const keys = [];
    for (const g of groups) {
      if (groupAktif(g)) keys.push(g.label);
      for (const c of g.children) {
        if (c.children && flattenLeaves(c.children).some(cc => matchTab(cc, pathname, currentTab))) {
          keys.push(g.label, `${g.label}::${c.label}`);
        }
      }
    }
    return keys;
  }
  const [openGroups, setOpenGroupsState] = useState(() => {
    const initial = new Set(sidebarOpenGroupsStore);
    kunciAktif().forEach(l => initial.add(l));
    sidebarOpenGroupsStore = initial;
    return initial;
  });
  function setOpenGroups(updater) {
    setOpenGroupsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      sidebarOpenGroupsStore = next;
      return next;
    });
  }

  // Path pindah (klik link lain / lewat browser back) -> auto-expand grup
  // yang baru aktif, TANPA nutup grup yang udah sengaja dibuka manual admin.
  useEffect(() => {
    const id = setTimeout(() => {
      setOpenGroups(prev => {
        const next = new Set(prev);
        kunciAktif().forEach(l => next.add(l));
        return next;
      });
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentTab]);

  function toggle(label) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  function pergi(path) {
    guardedNavigate(() => router.push(path));
    onNavigate?.();
  }

  const linkCls = (active) => `w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-left transition-colors ${
    active ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
  }`;

  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
      <button onClick={() => pergi(dashboardItem.path)} className={linkCls(matchTab(dashboardItem, pathname, currentTab))}>
        <span>{dashboardItem.icon}</span><span className="flex-1">{dashboardItem.label}</span>
      </button>

      <div className="pt-2 mt-2 border-t border-white/10 space-y-0.5">
        {groups.map(g => {
          if (g.children.length === 1) {
            const c = g.children[0];
            return (
              <button key={g.label} onClick={() => pergi(c.path)} className={linkCls(matchTab(c, pathname, currentTab))}>
                <span>{c.icon}</span><span className="flex-1">{g.label}</span>
              </button>
            );
          }
          const terbuka = openGroups.has(g.label);
          return (
            <div key={g.label}>
              <button onClick={() => toggle(g.label)} className={linkCls(groupAktif(g) && !terbuka)}>
                <span>{g.icon}</span><span className="flex-1">{g.label}</span>
                <span className="text-[9px] opacity-60">{terbuka ? '▲' : '▼'}</span>
              </button>
              {terbuka && (
                <div className="ml-2 pl-3 border-l border-white/10 space-y-0.5 mt-0.5 mb-1">
                  {g.children.map(c => c.children ? (
                    // Subgrup bersarang (mis. "Program Kemitraan" > "Perwakilan")
                    // — toggle sendiri, key digabung sama parent biar gak bentrok
                    // sama label subgrup lain yang kebetulan sama di grup beda.
                    (() => {
                      const subKey = `${g.label}::${c.label}`;
                      const subTerbuka = openGroups.has(subKey);
                      const subAktif = flattenLeaves(c.children).some(cc => matchTab(cc, pathname, currentTab));
                      return (
                        <div key={subKey}>
                          <button onClick={() => toggle(subKey)} className={linkCls(subAktif && !subTerbuka)}>
                            <span>{c.icon}</span><span className="flex-1">{c.label}</span>
                            <span className="text-[9px] opacity-60">{subTerbuka ? '▲' : '▼'}</span>
                          </button>
                          {subTerbuka && (
                            <div className="ml-2 pl-3 border-l border-white/10 space-y-0.5 mt-0.5 mb-1">
                              {c.children.map(cc => (
                                <button key={cc.label} onClick={() => pergi(cc.path)} className={linkCls(matchTab(cc, pathname, currentTab))}>
                                  <span>{cc.icon}</span><span className="flex-1">{cc.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <button key={c.label} onClick={() => pergi(c.path)} className={linkCls(matchTab(c, pathname, currentTab))}>
                      <span>{c.icon}</span><span className="flex-1">{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export default function Layout({ children, title, backHref, showBack, confirmLeave, confirmMessage }) {
  const router = useRouter();
  const pathname = usePathname();
  const [rawUser] = useCurrentUser();
  // Hydration mismatch fix (2026-09-06): server SELALU render tanpa tau role
  // (gak ada akses localStorage), jadi server anggap "belum login" total.
  // Client (lewat lazy init di useCurrentUser) BISA langsung tau user/role
  // sejak render pertama, beda dari server -> React ngeluh hydration
  // mismatch tiap buka halaman mana pun yang login (bukan cuma admin — nama
  // di navbar, notifikasi, dll ikut beda). `mounted` (default false, sama
  // kayak asumsi server) dipakai buat `user` versi RENDER (`= mounted ?
  // rawUser : null`) — jadi render PERTAMA client identik ke server (semua
  // JSX yang bergantung ke `user` otomatis ikut netral), baru "nyala" ke
  // data asli 1 tick sesudahnya. TIDAK gpp ini beda dari fix asli di
  // useCurrentUser.js (jangan sampai user ke-redirect ke /login): guard
  // effect di bawah (wajib_ganti_password) SENGAJA tetap baca `rawUser`
  // langsung, gak ikut digate `mounted`, biar reaksinya tetap instan.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const user = mounted ? rawUser : null;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Collapse sidebar desktop (beda dari sidebarOpen yang buat drawer mobile)
  // — admin bisa sembunyikan sementara buat lapangin layar, preferensinya
  // diinget lewat localStorage biar gak collapse lagi tiap reload.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Paksa akun yang password-nya baru di-reset admin (lihat
  // /api/profil/password) buat ganti password dulu sebelum
  // bisa akses halaman lain mana pun yang pakai Layout ini.
  useEffect(() => {
    if (rawUser?.wajib_ganti_password) router.replace('/ganti-password-wajib');
  }, [rawUser]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (localStorage.getItem('admin_sidebar_collapsed') === '1') setSidebarCollapsed(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  function toggleSidebarCollapsed() {
    setSidebarCollapsed(prev => {
      localStorage.setItem('admin_sidebar_collapsed', prev ? '0' : '1');
      return !prev;
    });
  }

  // Path pindah -> tutup drawer sidebar mobile otomatis.
  useEffect(() => {
    const id = setTimeout(() => setSidebarOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  // Bungkus semua navigasi yang dipicu dari Layout (tombol back, nav
  // atas/bawah/sidebar, logo, logout) — kalau confirmLeave true, tanya dulu
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

  // Ganti "mode" akun buat dual-role (perwakilan + sahabat/Sahabat
  // Baitullah) — cuma muncul kalau akun ini punya role_kedua (diberi admin
  // dari /admin/database, khusus direkrut langsung manajemen).
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  async function switchRole(ke) {
    setModeMenuOpen(false);
    try {
      const res = await fetch('/api/auth/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ke }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Gagal ganti mode'); return; }
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push(ke === 'sahabat_baitullah' ? '/dashboard/sahabat' : '/dashboard/perwakilan');
    } catch {
      alert('Gagal ganti mode. Coba lagi.');
    }
  }
  const roleLabel = { perwakilan: 'Perwakilan', sahabat: 'Sahabat Baitullah' };
  const modeSwitcher = user?.role_kedua && (
    <div className="relative">
      <button
        onClick={() => setModeMenuOpen(v => !v)}
        className="flex items-center gap-1 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-colors"
      >
        Mode: {roleLabel[user.role] || user.role} ▾
      </button>
      {modeMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setModeMenuOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl overflow-hidden z-50 text-[#0E2F6E]">
            {[user.role, user.role_kedua].map(r => (
              <button
                key={r}
                onClick={() => r !== user.role && switchRole(r)}
                className={`w-full text-left px-4 py-2.5 text-sm font-semibold ${r === user.role ? 'bg-[#E8F0FB]' : 'hover:bg-gray-50'}`}
              >
                {r === user.role ? '✓ ' : ''}{roleLabel[r] || r}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const dashboardItem = { icon: '📊', label: 'Dashboard', path: '/admin?tab=dashboard' };

  // Cluster per DIVISI (bukan lagi per "jenis aksi") — biar tim yang beda2
  // (CS, Program/Pricing, Gudang, Finance, Marketing, Akun & Jaringan, IT)
  // masing2 punya "rumah" sendiri di sidebar, gak nyampur. Item super_admin-
  // only tetap sama persis pembatasannya kayak sebelumnya, cuma pindah
  // kelompok. Grup yang isinya jadi kosong (semua anaknya super_admin-only,
  // dibuka user admin biasa) di-filter otomatis pas dipakai (lihat di bawah).
  const adminGroups = [
    { icon: '📞', label: 'Operasional / CS', children: [
      { icon: '🧳', label: 'Database Jamaah', path: '/admin/database/jamaah' },
      { icon: '📋', label: 'Daftar Booking', path: '/admin?tab=bookings' },
      { icon: '💳', label: 'Pembayaran', path: '/admin?tab=payments' },
      { icon: '🚫', label: 'Pembatalan', path: '/admin?tab=pembatalan' },
      { icon: '💰', label: 'Custom Harga', path: '/admin?tab=customharga' },
      { icon: '➕', label: 'Order Jamaah', path: '/order-jamaah' },
      { icon: '🧮', label: 'Ajuan Budget Kalkulator', path: '/admin/kalkulator-leads' },
      // Ajuan Kalkulator Perwakilan SENGAJA tetap di sini (bukan pindah ke
      // "Program Kemitraan" > Perwakilan) — itu review quote/leads harga,
      // beda total dari pendaftaran akun (dikonfirmasi user 2026-09-06).
      { icon: '🧮', label: 'Ajuan Kalkulator Perwakilan', path: '/admin/kalkulator-perwakilan' },
    ] },
    // "Program Kemitraan" — payung buat 2 program kemitraan (Sahabat
    // Baitullah & Perwakilan), tiap satu jadi SUBGRUP sendiri di sidebar
    // (dikonfirmasi user 2026-09-06 — sebelumnya "Sejuta Baitullah" grup
    // sendiri & Perwakilan nyebar di Operasional/CS + Finance + halaman
    // database generik, sekarang keduanya setara & "punya rumah" masing2).
    { icon: '🤝', label: 'Program Kemitraan', children: [
      { icon: '🕌', label: 'Sahabat Baitullah', children: [
        { icon: '🪪', label: 'Pendaftaran', path: '/admin/sahabat' },
        { icon: '💰', label: 'Database Jamaah', path: '/admin/sahabat/database' },
        { icon: '📜', label: 'Riwayat Closing', path: '/admin/sahabat/riwayat-closing' },
        { icon: '💸', label: 'Pencairan Komisi', path: '/admin/sahabat/pencairan' },
        { icon: '🎞️', label: 'Materi Presentasi', path: '/admin/sahabat/materi' },
        // Link "Costing Program" khusus Sahabat Baitullah (dulu ke
        // /admin/programs?publish_type=sahabat_baitullah) DIHAPUS dari sini
        // (dikonfirmasi user 2026-09-06) — dikonsolidasi jadi 1 titik akses
        // di grup "Program & Pricing" > Kelola Program, dengan filter
        // kategori (Publik/Perwakilan/Sahabat Baitullah/Private) di DALAM
        // halaman itu sendiri (lihat tab filter di /admin/programs).
        // Nominal komisi "angka fatal" — super_admin only, dikonfirmasi user
        // 2026-08-29 (lihat guard server di /api/admin/pengaturan yang nolak
        // field sensitif dari admin biasa).
        ...(user?.role === 'super_admin' ? [
          { icon: '🔒', label: 'Pengaturan Komisi', path: '/admin/sahabat/pengaturan-komisi' },
        ] : []),
      ] },
      { icon: '💼', label: 'Perwakilan', children: [
        { icon: '🪪', label: 'Pendaftaran', path: '/admin/perwakilan' },
        { icon: '💰', label: 'Database Perwakilan', path: '/admin/perwakilan/database' },
        { icon: '📜', label: 'Riwayat Closing', path: '/admin/perwakilan/riwayat-closing' },
        { icon: '💸', label: 'Pencairan Komisi', path: '/admin/perwakilan/pencairan' },
      ] },
    ] },
    { icon: '🕌', label: 'Program & Pricing', children: [
      { icon: '📦', label: 'Kelola Program', path: '/admin?tab=programs' },
      // Cuma super admin — kalkulator/costing ini nyakup komponen biaya
      // vendor (hotel, mutawwif, dll) yang sensitif, gak untuk semua admin
      // biasa. Proposal Corporate & Company Profile-nya juga dibatasi
      // super_admin sesuai permintaan, bukan soal sensitif tapi biar kata2 &
      // harga yang ditawarkan ke corporate klien terjaga konsisten dari 1 pintu.
      ...(user?.role === 'super_admin' ? [
        { icon: '🧮', label: 'Costing Program', path: '/admin/program-costing' },
        { icon: '🗂️', label: 'Master Data', path: '/admin/master-data' },
        { icon: '🤝', label: 'Proposal Corporate', path: '/admin/proposal-corporate' },
        { icon: '🤝', label: 'Company Profile Proposal', path: '/admin/pengaturan/proposal-profile' },
      ] : []),
    ] },
    { icon: '📦', label: 'Gudang (WMS)', children: [
      // Status pengiriman per program = admin biasa juga boleh (bukan data
      // stok yang sensitif, cuma status kirim per jamaah).
      { icon: '🚚', label: 'Status Pengiriman Perlengkapan', path: '/admin/perlengkapan-pengiriman' },
      // Stok/ambang-reorder = super_admin only (lihat src/lib/perlengkapan.js).
      ...(user?.role === 'super_admin' ? [
        { icon: '🔒', label: 'Kelola Perlengkapan (Gudang)', path: '/admin/perlengkapan' },
      ] : []),
    ] },
    // Urutan Finance sengaja disusun dasar -> akhir (dikonfirmasi user
    // 2026-09-03), bukan sekadar daftar alfabet/acak: (1) setup rekening,
    // (2) pencatatan transaksi mentah bulanan, (3) siklus ujroh (proyeksi ->
    // cair), (4) dokumen per booking, (5) laporan/analisis yang dibangun dari
    // semua data di atas, (6) perencanaan dana ke depan. Item admin-biasa
    // (gak digate super_admin) DISELIPKAN di posisi yang sesuai alurnya,
    // bukan dikumpulin di 1 blok — makanya beberapa spread super_admin
    // kepisah-pisah gini, bukan digabung jadi 1 array besar.
    { icon: '💰', label: 'Finance', children: [
      // Cuma super admin — semua yang berhubungan langsung sama angka
      // keuangan (HPP/margin per program, pengeluaran operasional, dll)
      // sensitif, gak untuk semua admin biasa.
      ...(user?.role === 'super_admin' ? [
        { icon: '💳', label: 'Metode Pembayaran', path: '/admin/pengaturan/pembayaran' },
        { icon: '🏦', label: 'Rekening 3-Bank', path: '/admin/finance/rekening' },
        { icon: '🔒', label: 'Cashflow Bulanan', path: '/admin/laporan/cashflow' },
        { icon: '🧾', label: 'Purchasing (Bon Vendor & Program)', path: '/admin/purchasing' },
      ] : []),
      { icon: '🧾', label: 'Invoice & Kwitansi', path: '/admin/invoice-kwitansi' },
      { icon: '💰', label: 'Closing & Forecast Ujroh', path: '/admin/laporan/ujroh-closing' },
      // Pencairan Ujroh Perwakilan PINDAH ke "Program Kemitraan" > Perwakilan
      // (dikonfirmasi user 2026-09-06) — gak nyebar lagi antara Finance & grup
      // sendiri kayak sebelumnya.
      ...(user?.role === 'super_admin' ? [
        { icon: '🔒', label: 'Keuangan Program', path: '/admin/laporan/keuangan-program' },
        { icon: '🎯', label: 'Realisasi vs Budget Program', path: '/admin/laporan/realisasi-program' },
        { icon: '🔒', label: 'Keuangan Perusahaan', path: '/admin/laporan/keuangan-perusahaan' },
        { icon: '🧾', label: 'Pengajuan Dana Bulanan', path: '/admin/laporan/pengajuan-dana' },
      ] : []),
    ] },
    { icon: '📣', label: 'Marketing & Konten', children: [
      { icon: '🎟️', label: 'Voucher', path: '/admin?tab=voucher' },
      { icon: '🖼️', label: 'Galeri', path: '/admin/galeri' },
      { icon: '📰', label: 'Berita & Kegiatan', path: '/admin/berita' },
      { icon: '📣', label: 'Banner Promo', path: '/admin/promo' },
      { icon: '🏠', label: 'Konten Landing Page', path: '/admin/pengaturan/skema-pembayaran' },
      { icon: '✏️', label: 'Teks Landing Page', path: '/admin/pengaturan/teks-landing' },
    ] },
    { icon: '👥', label: 'Akun & Jaringan', children: [
      { icon: '👥', label: 'Pengguna', path: '/admin?tab=users' },
      { icon: '🌳', label: 'Hierarki & Closing', path: '/admin?tab=hierarki' },
      // Log siapa-ngapain-kapan — khusus super_admin (dikonfirmasi user
      // 2026-08-21), bukan buat visibilitas admin biasa.
      ...(user?.role === 'super_admin' ? [
        { icon: '🕵️', label: 'Audit Trail', path: '/admin?tab=auditlog' },
      ] : []),
    ] },
    { icon: '⚙️', label: 'Pengaturan Sistem', children: [
      { icon: '⚙️', label: 'Pengaturan Umum', path: '/admin/pengaturan' },
      { icon: '📜', label: 'Pengaturan Dokumen', path: '/admin/pengaturan/dokumen' },
      { icon: '📤', label: 'Import Dokumen Fisik', path: '/admin/pengaturan/dokumen-fisik' },
    ] },
  ].filter(g => g.children.length > 0);

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
    sahabat: [
      { icon: '🏠', label: 'Beranda', path: '/dashboard/sahabat' },
      { icon: '🕌', label: 'Program', path: '/programs' },
      { icon: '➕', label: 'Order (Closing Langsung)', path: '/order-jamaah' },
      { icon: '🌳', label: 'Team', path: '/dashboard/sahabat/team' },
      { icon: '📜', label: 'Riwayat Closing', path: '/dashboard/sahabat/riwayat-closing' },
      { icon: '🧾', label: 'Riwayat Tabungan Umroh', path: '/dashboard/sahabat/riwayat' },
      { icon: '🎞️', label: 'Materi Presentasi', path: '/dashboard/sahabat/materi' },
      { icon: '🎟️', label: 'Voucher', path: '/voucher' },
      { icon: '👤', label: 'Profil', path: '/profil' },
    ],
  };

  // super_admin superset dari admin — pakai sidebar yang sama (grup2 di atas
  // udah nambahin item super_admin-only sendiri). role DB-nya 'sahabat_baitullah'
  // tapi key di navItems di bawah 'sahabat' (lebih pendek) — WAJIB dipetakan di
  // sini, kalau enggak navItems[navRole] selalu undefined buat akun ini (bug
  // ditemukan & diperbaiki 2026-09-21 — akibatnya sidebar sahabat kosong total,
  // jatuh ke fallback dashboardItem admin yang nunjuk ke /admin?tab=dashboard).
  const navRole = user?.role === 'super_admin' ? 'admin' : user?.role === 'sahabat_baitullah' ? 'sahabat' : user?.role;
  const isAdminNav = navRole === 'admin';
  const items = (user && navItems[navRole]) ? navItems[navRole] : [];

  // Sidebar sekarang juga dipakai jamaah/perwakilan/sahabat_baitullah (dulu
  // navbar pill horizontal + tab bawah mobile) — dikonfirmasi user
  // 2026-09-21, biar konsisten sama admin & gak kepepet nabrak logo kalau
  // item nav nambah (kayak "Team" yang baru ditambahin ke sahabat). Item
  // pertama ("Beranda") jadi dashboardItem yang dipin di atas divider, sisanya
  // dibungkus jadi "grup 1-anak" biar SidebarNav render flat (bukan accordion)
  // — reuse persis komponen yang sama, gak bikin komponen sidebar baru.
  const useSidebar = isAdminNav || ['jamaah', 'perwakilan', 'sahabat'].includes(navRole);
  const sidebarDashboardItem = isAdminNav ? dashboardItem : (items[0] || dashboardItem);
  const sidebarGroups = isAdminNav ? adminGroups : items.slice(1).map(it => ({ icon: it.icon, label: it.label, children: it.children || [it] }));

  const logo = (
    <div className="flex items-center gap-2 cursor-pointer" onClick={() => guardedNavigate(() => router.push('/'))}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/jm-travel-icon.png" alt="JM Travel" className="w-8 h-8 object-contain" />
      <div>
        <div className="font-bold text-sm leading-tight">JM Travel</div>
        <div className="text-[10px] opacity-70">{isAdminNav ? 'Admin Panel' : 'Umroh & Haji'}</div>
      </div>
    </div>
  );

  const titleBar = (title || showBack || backHref) && (
    <div className="no-print bg-white border-b border-gray-200 px-4 py-3 md:px-8">
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
  );

  // ================= ADMIN — SIDEBAR PER DIVISI =================
  // Nav dikelompokkan per divisi (bukan navbar horizontal lagi — dulu 6-7
  // grup udah kepepet nabrak logo). Sidebar tetap ("Program & Pricing",
  // "Finance", dst) di kiri layar desktop, jadi drawer slide-in di mobile
  // (tombol ☰ di top bar).
  if (useSidebar) {
    return (
      <div className="min-h-screen bg-[#eef1f8]">
        <aside className={`no-print fixed top-0 left-0 h-screen w-64 bg-[#0E2F6E] text-white z-50 flex flex-col shadow-xl transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'md:-translate-x-full' : 'md:translate-x-0'}`}>
          <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10 shrink-0">
            {logo}
            <button onClick={() => setSidebarOpen(false)} aria-label="Tutup menu" className="md:hidden ml-auto text-white/70 hover:text-white text-xl leading-none">✕</button>
            <button onClick={toggleSidebarCollapsed} aria-label="Sembunyikan menu" title="Sembunyikan sementara"
              className="hidden md:flex ml-auto w-7 h-7 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 text-sm leading-none">«</button>
          </div>
          <Suspense fallback={<div className="flex-1" />}>
            <SidebarNav dashboardItem={sidebarDashboardItem} groups={sidebarGroups} pathname={pathname} guardedNavigate={guardedNavigate} onNavigate={() => setSidebarOpen(false)} />
          </Suspense>
          {user && (
            <div className="border-t border-white/10 p-3 shrink-0 space-y-2">
              {modeSwitcher}
              <div className="flex items-center gap-2">
                <NotificationBell user={user} openUp openRight />
                <span className="flex-1 text-xs opacity-80 bg-white/10 px-3 py-1.5 rounded-full truncate">👤 {user.name.split(' ')[0]}</span>
              </div>
              <button onClick={logout} className="w-full bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-full hover:bg-red-700 transition-colors">
                Keluar
              </button>
            </div>
          )}
        </aside>

        {sidebarOpen && <div className="no-print fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* Sidebar desktop lagi disembunyikan — tombol kecil buat manggil balik. */}
        {sidebarCollapsed && (
          <button onClick={toggleSidebarCollapsed} aria-label="Tampilkan menu" title="Tampilkan menu"
            className="no-print hidden md:flex fixed top-4 left-4 z-50 w-9 h-9 items-center justify-center rounded-full bg-[#0E2F6E] text-white shadow-lg hover:bg-[#1A4FA0] transition-colors">
            ☰
          </button>
        )}

        {/* layout-shell: class stabil buat di-reset khusus print (offset
            md:pl-64 buat ngasih ruang sidebar fixed itu perlu di-nol-in pas
            print, soalnya sidebar-nya sendiri udah .no-print/display:none —
            biarin offset ini nyisa bakal nggeser/motong .sheet ke kanan,
            lihat print CSS di admin/pengaturan/dokumen/page.jsx). */}
        <div className={`layout-shell transition-[padding] duration-200 ${sidebarCollapsed ? '' : 'md:pl-64'}`}>
          <nav className="no-print sticky top-0 z-30 bg-[#0E2F6E] text-white shadow-lg md:hidden">
            <div className="px-4 py-3 flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} aria-label="Buka menu" className="text-xl leading-none">☰</button>
              {logo}
            </div>
          </nav>

          {titleBar}

          <main className="layout-main max-w-7xl mx-auto px-4 py-4 md:px-8 pb-8">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // ================= JAMAAH / PERWAKILAN / PUBLIK — NAVBAR ATAS =================
  return (
    <div className="min-h-screen bg-[#eef1f8]">
      {/* TOP NAVBAR — tampil di semua ukuran */}
      <nav className="no-print sticky top-0 z-50 bg-[#0E2F6E] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {logo}

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
                {modeSwitcher}
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

      {titleBar}

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-4 md:px-8 pb-24 md:pb-8">
        {children}
      </main>

      {/* BOTTOM NAVBAR — hanya tampil di mobile */}
      {user && (
        <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 shadow-lg">
          <Suspense fallback={<div className="flex" />}>
            <NavBottomItems items={items} pathname={pathname} router={router} />
          </Suspense>
        </nav>
      )}
    </div>
  );
}
