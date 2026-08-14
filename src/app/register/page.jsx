'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Memuat...</div>}>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Dari modal kemitraan di landing page (lihat page.tsx) — biar gak disuruh
  // milih ulang tipe akun di step 2 padahal udah milih dari kartu kemitraan.
  const roleAwal = searchParams.get('role');
  const roleValid = roleAwal === 'perwakilan';
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name:'', nik:'', wa:'', email:'', password:'', confirmPassword:'',
    role: roleValid ? roleAwal : '',
    perekrut_id:'',
  });
  // Kalau role udah kebawa dari popup kemitraan, step 2 gak perlu nampilin
  // kartu pilihan lagi (kesannya disuruh milih ulang) — cukup ringkasan
  // konfirmasi. "Ubah" bisa buka lagi kartu pilihannya kalau salah pilih.
  const [tampilkanPilihan, setTampilkanPilihan] = useState(!roleValid);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [perwList, setPerwList] = useState([]);

  const isDirty = step > 1 || !!(form.name || form.nik || form.wa || form.email || form.password);
  useUnsavedGuard(isDirty);

  function keluar(tujuan) {
    if (isDirty && !confirm('Yakin ingin keluar? Data pendaftaran yang sudah diisi akan hilang.')) return;
    router.push(tujuan);
  }

  useEffect(() => {
    // Publik (belum login) — untuk pilih "siapa yang merekrut Anda",
    // menentukan rantai komisi override.
    fetch('/api/referral-list')
      .then(r => r.json())
      .then(d => { setPerwList(d.perwakilan || []); })
      .catch(() => {});
  }, []);

  function nextStep() {
    setError('');
    if (step === 1) {
      if (!form.name || !form.nik || !form.wa || !form.email || !form.password || !form.confirmPassword) {
        setError('Semua field wajib diisi'); return;
      }
      if (form.nik.length !== 16) { setError('NIK harus 16 digit'); return; }
      if (form.password.length < 8) { setError('Password min. 8 karakter'); return; }
      if (form.password !== form.confirmPassword) { setError('Password tidak cocok'); return; }
      setStep(2);
    }
  }

  async function handleRegister() {
    if (!form.role) { setError('Pilih tipe akun'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Pendaftaran gagal.'); return; }

      // Auto login. Cookie di-set SERVER (httpOnly) — jangan set manual.
      // BUG LAMA: dulu memakai loginData.token yang kini undefined,
      // sehingga cookie menjadi "token=undefined" dan SEMUA request API gagal.
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password.trim(),
        }),
      });
      const loginData = await loginRes.json();

      if (!loginRes.ok) {
        setError('Akun dibuat, tetapi login otomatis gagal. Silakan login manual.');
        router.push('/login');
        return;
      }

      localStorage.setItem('user', JSON.stringify(loginData.user));

      // Akun baru wajib verifikasi dulu (WA atau Email) — pilihan metode
      // dilakukan di sana, bukan di sini, supaya tidak dobel tanya.
      router.push('/verifikasi');
    } catch (e) {
      setError('Terjadi kesalahan, coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  const steps = ['Data Diri', 'Tipe Akun'];

  return (
    <div className="min-h-screen bg-[#eef1f8] flex items-center justify-center px-4 py-8 font-sans">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8 cursor-pointer" onClick={() => keluar('/')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/jm-travel-logo.png" alt="JM Travel" className="h-24 mx-auto object-contain" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Steps */}
          <div className="flex items-center mb-8">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i+1 < step ? 'bg-[#C9952A] text-white' :
                    i+1 === step ? 'bg-[#1A4FA0] text-white' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {i+1 < step ? '✓' : i+1}
                  </div>
                  <div className={`text-[10px] mt-1 text-center max-w-[60px] ${i+1 === step ? 'text-[#1A4FA0] font-semibold' : 'text-gray-400'}`}>{s}</div>
                </div>
                {i < steps.length-1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-4 transition-colors ${i+1 < step ? 'bg-[#C9952A]' : 'bg-gray-200'}`}></div>
                )}
              </div>
            ))}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[#0E2F6E]">Buat Akun</h2>
                <p className="text-sm text-gray-400">Isi data diri untuk mendaftar</p>
              </div>
              {form.role && (
                <div className="bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-2.5 text-xs text-[#1A4FA0]">
                  ✓ Mendaftar sebagai <b>{form.role === 'perwakilan' ? 'Perwakilan Resmi' : 'Jamaah'}</b>
                </div>
              )}
              {[
                {id:'name', label:'Nama Lengkap *', placeholder:'Nama sesuai KTP'},
                {id:'nik', label:'No. KTP (NIK 16 digit) *', placeholder:'16 digit angka', maxLength:16},
                {id:'wa', label:'No. WhatsApp *', placeholder:'08xxxxxxxxxx'},
                {id:'email', label:'Email *', placeholder:'email@domain.com'},
              ].map(f => (
                <div key={f.id}>
                  <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">{f.label}</label>
                  <input
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    value={form[f.id]}
                    onChange={e => setForm({...form, [f.id]: e.target.value})}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">Password *</label>
                <input type="password"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                  placeholder="Min. 8 karakter"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">Konfirmasi Password *</label>
                <input type="password"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                  placeholder="Ulangi password"
                  value={form.confirmPassword}
                  onChange={e => setForm({...form, confirmPassword: e.target.value})}
                />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">⚠️ {error}</div>}
              <button onClick={nextStep}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
                Lanjut →
              </button>
              <p className="text-center text-sm text-gray-400">
                Sudah punya akun?{' '}
                <span className="text-[#1A4FA0] font-semibold cursor-pointer hover:underline" onClick={() => keluar('/login')}>Masuk</span>
              </p>
            </div>
          )}

          {/* STEP 2 - ROLE */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[#0E2F6E]">
                  {tampilkanPilihan ? 'Pilih Tipe Akun' : 'Konfirmasi Tipe Akun'}
                </h2>
                <p className="text-sm text-gray-400">
                  {tampilkanPilihan ? 'Satu langkah lagi — pilih peran Anda.' : 'Sesuai pilihan Anda sebelumnya.'}
                </p>
              </div>

              {!tampilkanPilihan ? (
                // Role udah kebawa dari popup kemitraan — gak perlu nyuruh
                // pilih ulang, cukup konfirmasi + opsi ubah kalau salah pilih.
                <div className="flex items-center justify-between gap-3 bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">🏢</div>
                    <div className="font-bold text-[#0E2F6E] text-sm">
                      Perwakilan Resmi
                    </div>
                  </div>
                  <button type="button" onClick={() => setTampilkanPilihan(true)}
                    className="text-xs font-bold text-[#1A4FA0] hover:underline whitespace-nowrap">Ubah</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {value:'jamaah', icon:'🕌', title:'Jamaah', desc:'Daftar program umroh & haji'},
                    {value:'perwakilan', icon:'🏢', title:'Perwakilan', desc:'Kelola program di wilayah Anda'},
                  ].map(r => (
                    <div key={r.value}
                      onClick={() => setForm({...form, role: r.value})}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        form.role === r.value
                          ? 'border-[#1A4FA0] bg-[#E8F0FB]'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="text-2xl">{r.icon}</div>
                      <div>
                        <div className="font-bold text-[#0E2F6E] text-sm">{r.title}</div>
                        <div className="text-xs text-gray-400">{r.desc}</div>
                      </div>
                      {form.role === r.value && <div className="ml-auto text-[#1A4FA0] font-bold">✓</div>}
                    </div>
                  ))}
                </div>
              )}

              {form.role === 'perwakilan' && (
                <div>
                  <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">
                    Siapa yang merekrut Anda? <span className="text-gray-400 font-normal">(opsional)</span>
                  </label>
                  <select
                    value={form.perekrut_id}
                    onChange={e => setForm({...form, perekrut_id: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                    <option value="">-- Tidak ada / daftar mandiri --</option>
                    {/* Perwakilan bisa direkrut oleh perwakilan lain. */}
                    {perwList.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.kode_unik}){p.wilayah ? ' — ' + p.wilayah : ''}</option>
                    ))}
                  </select>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Menentukan komisi override yang diterima perekrut Anda dari closing Anda.
                  </div>
                </div>
              )}

              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">⚠️ {error}</div>}
              <button onClick={handleRegister} disabled={loading}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-60">
                {loading ? 'Memproses...' : 'Selesai & Masuk →'}
              </button>
            </div>
          )}
        </div>

        <div className="text-center mt-4">
          <span className="text-sm text-gray-400 cursor-pointer hover:text-[#1A4FA0]" onClick={() => keluar('/')}>
            ← Kembali ke Beranda
          </span>
        </div>
      </div>
    </div>
  );
}