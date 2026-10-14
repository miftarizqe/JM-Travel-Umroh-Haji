'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PasswordInput from '@/app/components/PasswordInput';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import { dashboardPathForRole } from '@/lib/dashboardPath';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Memuat...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pengaturan] = usePengaturan();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Diarahkan ke sini karena sesi 4 jam habis (src/proxy.js /
  // useCurrentUser) — kasih tau alasannya.
  const sesiHabis = searchParams.get('sesi') === 'habis';
  // Halaman ini cuma bisa kebuka kalau GAK ada sesi aktif (proxy ngelempar
  // yang masih login ke `/`), jadi cache data user apa pun di sini pasti
  // basi — buang SELALU, bukan cuma pas ?sesi=habis. Dulu cache tanpa
  // sesi_berakhir_at (login sebelum aturan 4 jam) gak pernah kebuang:
  // nama tetap nongol di navbar walau udah gak login (bug 2026-10-14).
  useEffect(() => {
    try { localStorage.removeItem('user'); } catch {}
  }, []);

  async function handleLogin() {
    // Validasi sebelum kirim — mencegah tombol "seolah tidak bereaksi"
    if (!form.email.trim() || !form.password.trim()) {
      setError('Email/WA dan password wajib diisi.');
      return;
    }

    setError('');
    setLoading(true);
    let berhasil = false;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Trim: spasi sering ikut saat copy-paste
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login gagal.');
        return;
      }

      // Cookie token di-set SERVER (httpOnly). Frontend hanya simpan data user.
      localStorage.setItem('user', JSON.stringify(data.user));
      const role = data.user.role;
      // Kalau datang dari tombol Booking (ada ?redirect=), balik ke sana
      const redirect = searchParams.get('redirect') || searchParams.get('from');
      // Navigasi PENUH (bukan router.push): Client Cache Next nyimpen hasil
      // navigasi halaman statis sampai 5 menit — termasuk redirect proxy
      // `/dashboard` -> `/login` waktu sesi tadi habis. router.push pakai
      // cache itu, jadi habis login sukses malah mantul balik ke /login;
      // user coba lagi terus sampai kena rate limit (bug 2026-10-14).
      // Navigasi penuh juga mastiin cookie baru ikut terkirim ke proxy.
      const tujuan = data.user.perlu_perbaikan_akun
        ? '/perbaiki-data-akun'
        : (redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : dashboardPathForRole(role));
      berhasil = true;
      window.location.assign(tujuan);
    } catch (e) {
      setError('Terjadi kesalahan, coba lagi.');
    } finally {
      // Gagal -> tombol aktif lagi. Sukses -> tetap "Memproses..." sampai
      // halaman tujuan kebuka (navigasi penuh), biar gak kepencet dobel.
      if (!berhasil) setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#eef1f8] flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8 cursor-pointer" onClick={() => router.push('/')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/jm-travel-logo.png" alt="JM Travel" className="h-24 mx-auto object-contain" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🕋</div>
            <h1 className="text-xl font-bold text-[#0E2F6E]">Selamat Datang</h1>
            <p className="text-sm text-gray-400 mt-1">Masuk ke akun JM Travel Anda</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">Email / No. WhatsApp</label>
              <input
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                placeholder="email atau 08xxxxxxxxxx"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">Password</label>
              <PasswordInput
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                placeholder="password"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <div className="text-right mt-1.5">
                <a href={waLink(pengaturan.wa_kantor, 'Assalamu\'alaikum JM Travel, saya lupa password akun saya. Mohon bantuannya untuk reset password.') || '#'}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#1A4FA0] hover:underline">
                  Lupa password? Hubungi Admin →
                </a>
              </div>
            </div>

            {sesiHabis && !error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-4">
                ⏰ Sesi login Anda sudah berakhir (berlaku 4 jam). Silakan login kembali.
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </div>

          <div className="text-center mt-6 text-sm text-gray-400">
            Belum punya akun?{' '}
            <span className="text-[#1A4FA0] font-semibold cursor-pointer hover:underline" onClick={() => router.push('/register')}>
              Daftar Sekarang
            </span>
          </div>
        </div>

        <div className="text-center mt-4">
          <span className="text-sm text-gray-400 cursor-pointer hover:text-[#1A4FA0]" onClick={() => router.push('/')}>
            ← Kembali ke Beranda
          </span>
        </div>
      </div>
    </div>
  );
}
