'use client';

// Head of Program = management, role 'hop' (dikonfirmasi user 2026-10-03) —
// dipakai di halaman admin/sahabat/* biar HoP bisa MASUK & LIHAT, tapi
// read-only: tombol aksi wajib dicek `!isHop` sebelum ditampilkan. Endpoint
// aksinya tetap admin-only di server; ini cuma UX biar HoP gak lihat tombol
// yang bakal 403. Status HoP cukup dari role di token, jadi `checked` langsung
// true begitu user terbaca (gak perlu fetch apa pun).
export function useIsHop(user) {
  const isHop = user?.role === 'hop';
  const isAdmin = !!(user && ['admin', 'super_admin'].includes(user.role));
  return { isHop, isAdmin, isAdminOrHop: isAdmin || isHop, checked: !!user };
}
