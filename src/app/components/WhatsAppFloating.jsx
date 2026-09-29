'use client';
import { usePathname } from 'next/navigation';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import { useCurrentUser } from '@/lib/useCurrentUser';

// Tombol WhatsApp melayang pojok kanan bawah — quick action chat ke kantor
// (dikonfirmasi user 2026-09-28). Nomor ikut Pengaturan Umum (wa_kantor),
// jadi admin bisa ganti tanpa deploy. Dipasang sekali di root layout biar
// muncul juga di landing page (page.tsx gak pakai Layout.jsx).
//
// Disembunyikan di panel admin (/admin/*, termasuk halaman cetak) & buat
// akun staff — mereka gak perlu chat ke nomor kantornya sendiri.
export default function WhatsAppFloating() {
  const pathname = usePathname() || '';
  const [pengaturan] = usePengaturan();
  const [user] = useCurrentUser();

  if (pathname.startsWith('/admin')) return null;
  if (user && ['admin', 'super_admin'].includes(user.role)) return null;

  const link = waLink(pengaturan.wa_kantor, 'Halo JM Travel, saya ingin bertanya.');
  if (!link) return null;

  // Bottom navbar mobile (Layout.jsx) cuma tampil kalau login — naikkan
  // tombolnya biar gak ketutup navbar itu.
  const posisiBawah = user ? 'bottom-20 md:bottom-6' : 'bottom-6';

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat WhatsApp JM Travel"
      title="Chat WhatsApp JM Travel"
      className={`print:hidden fixed right-4 md:right-6 ${posisiBawah} z-40 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1EBE5A] text-white shadow-lg transition-transform hover:scale-105`}
    >
      <svg viewBox="0 0 32 32" className="w-8 h-8" fill="currentColor" aria-hidden="true">
        <path d="M16.004 3C9.378 3 3.99 8.387 3.99 15.012c0 2.117.553 4.184 1.603 6.007L3.9 27.1l6.24-1.637a12 12 0 0 0 5.864 1.527h.005c6.625 0 12.013-5.388 12.013-12.013 0-3.21-1.25-6.227-3.52-8.497A11.94 11.94 0 0 0 16.004 3Zm0 21.96h-.004a9.97 9.97 0 0 1-5.08-1.39l-.364-.216-3.703.972.989-3.61-.237-.37a9.94 9.94 0 0 1-1.527-5.334c0-5.507 4.48-9.987 9.99-9.987 2.667 0 5.174 1.04 7.06 2.927a9.92 9.92 0 0 1 2.922 7.065c-.002 5.508-4.482 9.943-10.046 9.943Zm5.478-7.478c-.3-.15-1.777-.877-2.052-.977-.275-.1-.476-.15-.676.15-.2.3-.776.977-.951 1.177-.175.2-.35.225-.65.075-.3-.15-1.268-.467-2.415-1.49-.893-.796-1.495-1.78-1.67-2.08-.175-.3-.019-.462.131-.612.135-.134.3-.35.45-.525.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.628-.926-2.23-.244-.585-.492-.506-.676-.515l-.576-.01c-.2 0-.525.075-.8.375-.275.3-1.05 1.026-1.05 2.503 0 1.477 1.075 2.904 1.225 3.104.15.2 2.116 3.231 5.126 4.531.716.309 1.275.494 1.711.632.719.229 1.373.196 1.89.119.576-.086 1.777-.727 2.027-1.428.25-.702.25-1.303.175-1.428-.075-.125-.275-.2-.576-.35Z" />
      </svg>
    </a>
  );
}
