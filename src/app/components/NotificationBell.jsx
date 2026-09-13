'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_MS = 30000;

function waktuRelatif(iso) {
  const detik = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (detik < 60) return 'Baru saja';
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

// openUp/openRight — arah dropdown relatif ke posisi tombol lonceng. Default
// (false/false) cocok buat lonceng di navbar atas kanan (dropdown ke bawah-
// kiri, muat di layar). Sidebar admin naruh lonceng di POJOK KIRI BAWAH —
// dropdown ke bawah-kiri dari situ bakal kepotong layar (ke bawah karena
// udah mepet dasar layar, ke kiri karena mepet tepi kiri) — butuh openUp+openRight.
export default function NotificationBell({ user, openUp = false, openRight = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    async function muat() {
      try {
        const res = await fetch(`/api/notifications?user_id=${user.id}`);
        const d = await res.json();
        if (res.ok) {
          setNotifications(d.notifications || []);
          setUnreadCount(d.unread_count || 0);
        }
      } catch {}
    }
    muat();
    const interval = setInterval(muat, POLL_MS);
    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function tandaiSemuaTerbaca() {
    setNotifications(prev => prev.map(n => ({ ...n, dibaca: 1 })));
    setUnreadCount(0);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
    } catch {}
  }

  async function klikNotifikasi(n) {
    if (!n.dibaca) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, dibaca: 1 } : x));
      setUnreadCount(c => Math.max(0, c - 1));
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, id: n.id }),
        });
      } catch {}
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  if (!user?.id) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifikasi"
        className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-white"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute w-80 max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800 z-50 overflow-hidden ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'} ${openRight ? 'left-0' : 'right-0'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-bold text-sm text-[#0E2F6E]">Notifikasi</span>
            {unreadCount > 0 && (
              <button onClick={tandaiSemuaTerbaca} className="text-xs font-semibold text-[#1A4FA0] hover:underline">
                Tandai semua terbaca
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Belum ada notifikasi</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => klikNotifikasi(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!n.dibaca ? 'bg-[#E8F0FB]/50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.dibaca && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1A4FA0] flex-shrink-0" />}
                    <div className={!n.dibaca ? '' : 'ml-3.5'}>
                      <div className="text-sm font-semibold text-[#0E2F6E]">{n.judul}</div>
                      {n.pesan && <div className="text-xs text-gray-500 mt-0.5">{n.pesan}</div>}
                      <div className="text-[10px] text-gray-400 mt-1">{waktuRelatif(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
