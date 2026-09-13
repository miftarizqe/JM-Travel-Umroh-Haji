'use client';
import { useEffect, useState } from 'react';

// Head of Program (dikonfirmasi user 2026-09-07) — dipakai di halaman-halaman
// admin/sahabat/* biar HOP (akun role sahabat_baitullah biasa, BUKAN admin)
// bisa MASUK & LIHAT halaman itu, tapi read-only (tombol aksi harus dicek
// `!isHop` sebelum ditampilin — endpoint aksinya sendiri tetap admin-only di
// server, ini cuma buat UX biar HOP gak lihat tombol yang bakal 403 kalau
// diklik). `checked` jadi true begitu status HOP-nya udah dipastikan
// (dipakai buat nunda keputusan redirect sampai kita YAKIN dia bukan HOP).
export function useIsHop(user) {
  const [isHop, setIsHop] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (['admin', 'super_admin'].includes(user.role)) { setChecked(true); return; }
    setChecked(false);
    fetch('/api/sahabat/hop-status').then(r => r.json())
      .then(d => setIsHop(!!d.isHop))
      .catch(() => setIsHop(false))
      .finally(() => setChecked(true));
  }, [user]);

  const isAdmin = !!(user && ['admin', 'super_admin'].includes(user.role));
  const isAdminOrHop = isAdmin || isHop;
  return { isHop, isAdmin, isAdminOrHop, checked };
}
