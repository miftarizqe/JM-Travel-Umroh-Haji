'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';

function getDashPath(role) {
  if (role === 'admin' || role === 'super_admin') return '/admin';
  return `/dashboard/${role}`;
}

// Halaman WAJIB buat akun yang password-nya baru di-reset admin (lihat
// /api/profil/password) — dicek di Layout.jsx, semua halaman
// lain otomatis dialihkan ke sini kalau wajib_ganti_password masih nyala.
// SENGAJA gak pakai <Layout> biar gak ikut kena guard-nya sendiri (infinite
// redirect kalau dibungkus Layout yang jugsa ngecek flag yang sama).
export default function GantiPasswordWajibPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [passwordLama, setPasswordLama] = useState('');
  const [passwordBaru, setPasswordBaru] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!user.wajib_ganti_password) router.replace(getDashPath(user.role));
  }, [user]);

  if (!user || !user.wajib_ganti_password) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  async function simpan() {
    setError('');
    if (!passwordLama.trim()) { setError('Isi password sementara yang diberikan admin.'); return; }
    if (passwordBaru.trim().length < 6) { setError('Password baru minimal 6 karakter.'); return; }
    if (passwordBaru !== konfirmasi) { setError('Konfirmasi password tidak sama.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/profil/password', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, password_lama: passwordLama, password_baru: passwordBaru }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal mengubah password'); setSaving(false); return; }

      const updated = { ...user, wajib_ganti_password: false };
      localStorage.setItem('user', JSON.stringify(updated));
      router.replace(getDashPath(user.role));
    } catch { setError('Terjadi kesalahan, coba lagi.'); setSaving(false); }
  }

  const inp = "w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";

  return (
    <div className="min-h-screen bg-[#eef1f8] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6">
        <div className="text-3xl mb-2 text-center">🔑</div>
        <h1 className="text-lg font-bold text-[#0E2F6E] text-center mb-1">Ganti Password Anda</h1>
        <p className="text-sm text-gray-500 text-center mb-5">
          Akun Anda baru diberikan password sementara oleh admin. Silakan buat password baru sebelum melanjutkan.
        </p>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg p-2.5 mb-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Password Sementara (dari admin)</label>
            <input type="password" value={passwordLama} onChange={e => setPasswordLama(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Password Baru</label>
            <input type="password" value={passwordBaru} onChange={e => setPasswordBaru(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Konfirmasi Password Baru</label>
            <input type="password" value={konfirmasi} onChange={e => setKonfirmasi(e.target.value)} className={inp} />
          </div>
        </div>

        <button onClick={simpan} disabled={saving}
          className="w-full mt-5 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white font-bold py-2.5 rounded-full">
          {saving ? 'Menyimpan...' : 'Simpan & Lanjutkan'}
        </button>
      </div>
    </div>
  );
}
