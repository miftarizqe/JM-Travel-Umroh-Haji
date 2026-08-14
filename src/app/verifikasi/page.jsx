'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function VerifikasiPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [step, setStep] = useState(1); // 1=pilih metode, 2=input kode
  const [metode, setMetode] = useState('');
  const [kode, setKode] = useState('');
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  async function kirimKode(m) {
    setMetode(m);
    setLoading(true);
    try {
      const res = await fetch('/api/verifikasi/kirim', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ metode: m })
      });
      const d = await res.json();
      if (res.ok) { setInfo(d); setStep(2); }
      else alert(d.error);
    } catch { alert('Gagal mengirim kode'); }
    setLoading(false);
  }

  async function verifikasi() {
    if (!kode.trim()) { alert('Masukkan kode!'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/verifikasi/kirim', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ kode })
      });
      const d = await res.json();
      if (res.ok) {
        alert(d.message);
        const u = { ...user, terverifikasi: 1 };
        localStorage.setItem('user', JSON.stringify(u));
        router.push('/upload-foto');
      } else alert(d.error);
    } catch { alert('Gagal verifikasi'); }
    setLoading(false);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="🔐 Verifikasi Akun" showBack>
      <div className="max-w-md mx-auto">
        {step === 1 ? (
          <>
            <div className="bg-[#E8F0FB] rounded-xl p-4 mb-6 text-sm text-[#1A4FA0]">
              Pilih cara menerima kode verifikasi. Kode berlaku 10 menit.
            </div>
            <div className="space-y-3">
              <button onClick={() => kirimKode('whatsapp')} disabled={loading}
                className="w-full bg-white border-2 border-gray-200 hover:border-green-500 rounded-xl p-5 text-left transition-all disabled:opacity-50">
                <div className="text-3xl mb-2">💬</div>
                <div className="font-bold text-[#0E2F6E]">Kirim via WhatsApp</div>
                <div className="text-xs text-gray-400 mt-0.5">Ke nomor {user.wa || '-'}</div>
              </button>
              <button onClick={() => kirimKode('email')} disabled={loading}
                className="w-full bg-white border-2 border-gray-200 hover:border-[#1A4FA0] rounded-xl p-5 text-left transition-all disabled:opacity-50">
                <div className="text-3xl mb-2">📧</div>
                <div className="font-bold text-[#0E2F6E]">Kirim via Email</div>
                <div className="text-xs text-gray-400 mt-0.5">Ke {user.email || '-'}</div>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm text-green-700">
              ✅ Kode dikirim via {metode} ke <b>{info?.tujuan}</b>
              {info?.kode_dev && (
                <div className="mt-2 bg-yellow-100 border border-yellow-300 rounded p-2 text-yellow-800 text-xs">
                  🛠️ Mode development — kode: <b className="text-lg">{info.kode_dev}</b>
                  <div className="mt-1 opacity-75">Di produksi kode ini tidak ditampilkan.</div>
                </div>
              )}
            </div>
            <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Masukkan 6 Digit Kode</label>
            <input value={kode} onChange={e => setKode(e.target.value.replace(/\D/g,'').slice(0,6))}
              inputMode="numeric" maxLength={6} placeholder="000000"
              className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-center text-2xl tracking-[0.5em] font-bold"/>
            <button onClick={verifikasi} disabled={loading || kode.length !== 6}
              className="w-full mt-4 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full disabled:opacity-50">
              {loading ? 'Memverifikasi...' : '✅ Verifikasi Akun'}
            </button>
            <button onClick={() => { setStep(1); setKode(''); setInfo(null); }}
              className="w-full mt-2 text-sm text-gray-500 hover:text-[#1A4FA0]">
              ← Ganti metode / kirim ulang
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
