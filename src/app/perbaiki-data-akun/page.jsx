'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { dashboardPathForRole } from '@/lib/dashboardPath';

// Isi ulang form registrasi setelah admin "Minta Perbaikan" di antrian
// Verifikasi Akun (dikonfirmasi user 2026-10-11) — user tetap bisa login,
// gak lagi langsung keblokir kayak tolak permanen. Field sama dengan form
// registrasi (minus password). Lihat /api/perbaiki-data-akun.
export default function PerbaikiDataAkunPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    fetch('/api/perbaiki-data-akun').then(r => r.json()).then(d => {
      setInfo(d);
      if (d.data) setForm({ ...d.data, agama: d.data.agama || '' });
    }).catch(() => setInfo({ error: 'Gagal memuat data' }));
  }, [user]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function kirim() {
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.wa.trim() || !form.nik.trim() || !form.agama) {
      setError('Semua field wajib diisi.'); return;
    }
    if (!/^\d{16}$/.test(form.nik.trim())) { setError('NIK harus 16 digit angka.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/perbaiki-data-akun', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal mengirim perbaikan'); setSaving(false); return; }
      try {
        localStorage.setItem('user', JSON.stringify({ ...user, ...d.user, perlu_perbaikan_akun: false }));
      } catch {}
      alert(d.message);
      router.replace(dashboardPathForRole(user.role));
    } catch { setError('Terjadi kesalahan, coba lagi.'); setSaving(false); }
  }

  const inp = 'w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm';
  const lbl = 'block text-xs font-semibold text-[#0E2F6E] mb-1';

  return (
    <Layout title="📝 Perbaiki Data Akun" showBack>
      <div className="max-w-lg mx-auto">
        {!info ? (
          <div className="text-center py-20 text-gray-400">Memuat...</div>
        ) : info.error ? (
          <div className="text-center py-20 text-gray-400">{info.error}</div>
        ) : !info.perlu_perbaikan ? (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center space-y-3">
            <div className="text-3xl">✅</div>
            <div className="text-sm text-gray-600">Akun Anda tidak sedang diminta memperbaiki data.</div>
            <button onClick={() => router.replace(dashboardPathForRole(user.role))}
              className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-colors">
              Ke Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <div className="font-bold text-red-700 text-sm">⚠️ Verifikasi akun Anda ditolak admin</div>
              {info.catatan && <div className="text-sm text-red-700 mt-1">Alasan: {info.catatan}</div>}
              <div className="text-xs text-gray-600 mt-2">Perbaiki data di bawah lalu kirim ulang. Akun Anda akan diverifikasi ulang oleh admin.</div>
            </div>

            <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">
              <div><label className={lbl}>Nama Lengkap (sesuai KTP) *</label>
                <input value={form.name} maxLength={100} onChange={e => setF('name', e.target.value)} className={inp} /></div>
              <div><label className={lbl}>NIK (16 digit) *</label>
                <input value={form.nik} maxLength={16} inputMode="numeric"
                  onChange={e => setF('nik', e.target.value.replace(/\D/g, ''))} className={inp} /></div>
              <div><label className={lbl}>No. WhatsApp *</label>
                <input value={form.wa} inputMode="tel" placeholder="081234567890" onChange={e => setF('wa', e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Email *</label>
                <input value={form.email} type="email" onChange={e => setF('email', e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Agama *</label>
                <select value={form.agama} onChange={e => setF('agama', e.target.value)} className={`${inp} bg-white`}>
                  <option value="">— Pilih —</option>
                  <option value="islam">Islam</option>
                  <option value="non_islam">Non-Islam</option>
                </select></div>

              {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

              <button onClick={kirim} disabled={saving}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-50 transition-colors">
                {saving ? 'Mengirim...' : 'Kirim Perbaikan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
