'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tangkapRefAgen } from '@/lib/referralCapture';

// Link referral pribadi akun "agen" (dikonfirmasi user 2026-10-17) — cuma
// titik singgah: tangkap identitas agen-nya ke localStorage (dipakai nge-
// swap tombol WA di landing page & nge-tag booking pas checkout), lalu
// langsung redirect ke beranda. Link mati/kode gak ketemu TETAP redirect
// ke beranda tanpa pesan error — jangan sampai calon jamaah lihat halaman
// rusak gara-gara link yang salah ketik/kadaluarsa.
export default function LinkAgenPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/agen/${encodeURIComponent(params.kode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) tangkapRefAgen(d); })
      .catch(() => {})
      .finally(() => router.replace('/'));
  }, [params.kode, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      Memuat...
    </div>
  );
}
