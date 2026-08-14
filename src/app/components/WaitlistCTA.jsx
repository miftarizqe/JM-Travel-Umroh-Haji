'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';

// Tombol "Infokan Jika Ada Slot Kosong" — nyatet minat ke program_waitlist,
// dikabarin via notifikasi in-app begitu admin approve pembatalan & seat-nya
// beneran kebuka (lihat api/pembatalan PATCH). Dipakai di checkout
// (CartPaketKamar) MAUPUN halaman publik /program/[id] — makanya perlu cek
// login sendiri di sini (checkout selalu udah login duluan, tapi halaman
// program bisa dibuka siapa aja termasuk yang belum login).
export default function WaitlistCTA({ progId }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user] = useCurrentUser();
  const [status, setStatus] = useState('cek'); // cek | idle | loading | done

  useEffect(() => {
    if (!progId || !user) { setStatus('idle'); return; }
    let ignore = false;
    fetch(`/api/program-waitlist?program_id=${progId}`).then(r => r.json())
      .then(d => { if (!ignore) setStatus(d.terdaftar ? 'done' : 'idle'); })
      .catch(() => { if (!ignore) setStatus('idle'); });
    return () => { ignore = true; };
  }, [progId, user]);

  async function daftar() {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch('/api/program-waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program_id: progId }),
      });
      setStatus(res.ok ? 'done' : 'idle');
    } catch { setStatus('idle'); }
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center">
      <div className="text-3xl mb-2">🈵</div>
      <div className="font-bold text-amber-800 mb-1">Slot Penuh</div>
      <div className="text-sm text-amber-700 mb-4">
        Semua slot buat program ini lagi penuh. Kadang ada jamaah lain yang batal — kamu bisa didaftarin buat dikabarin duluan kalau itu kejadian.
      </div>
      {status === 'done' ? (
        <div className="text-sm text-green-700 font-semibold">✓ Kamu bakal dikabarin begitu ada slot kosong.</div>
      ) : (
        <button onClick={daftar} disabled={status === 'loading' || status === 'cek'}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-full transition-colors">
          {status === 'loading' ? 'Memproses...' : !user ? '🔔 Login buat Diinfokan Kalau Ada Slot Kosong' : '🔔 Infokan Jika Ada Slot Kosong'}
        </button>
      )}
    </div>
  );
}
