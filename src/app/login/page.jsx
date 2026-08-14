'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    // Validasi sebelum kirim — mencegah tombol "seolah tidak bereaksi"
    if (!form.email.trim() || !form.password.trim()) {
      setError('Email/WA dan password wajib diisi.');
      return;
    }

    setError('');
    setLoading(true);
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
      const redirect = searchParams.get('redirect');
      if (redirect) {
        router.push(redirect);
      } else if (role === 'admin' || role === 'super_admin') router.push('/admin');
      else if (role === 'perwakilan') router.push('/dashboard/perwakilan');
      else router.push('/dashboard/jamaah');
    } catch (e) {
      setError('Terjadi kesalahan, coba lagi.');
    } finally {
      // BUG FIX: dulu setLoading(false) tidak dipanggil saat sukses,
      // sehingga tombol tetap disabled dan tampak "tidak bisa dipencet".
      setLoading(false);
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
              <input
                type="password"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                placeholder="password"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>

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