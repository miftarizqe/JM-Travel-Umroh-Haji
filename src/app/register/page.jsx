'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import PasswordInput from '@/app/components/PasswordInput';
import { tangkapRefPerwakilan, ambilRefPerwakilan } from '@/lib/referralCapture';

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
  const roleValid = ['perwakilan', 'sahabat_baitullah'].includes(roleAwal);
  // Kode referral di URL (dibagikan lewat link pribadi perekrut/anggota
  // sahabat) — kalau match akun aktif, perekrut_id di-lock otomatis, gak
  // perlu pilih manual dari dropdown lagi.
  const refCode = searchParams.get('ref');
  // Dari login-gate Kalkulator Estimasi Publik (atau tombol lain yang butuh
  // login) — diteruskan apa adanya lewat verifikasi -> upload-foto, biar
  // begitu akun baru selesai dibuat & di-onboard, user balik ke halaman asal
  // dengan pilihan yang udah diisi sebelumnya (lihat kalkulator/[template_id]).
  const redirect = searchParams.get('redirect');
  const loginUrl = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
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
  const [sahabatList, setSahabatList] = useState([]);
  const [refNotFound, setRefNotFound] = useState(false);
  // Referral permanen buat registrasi role='jamaah' — TERPISAH dari
  // form.perekrut_id (yang khusus rantai perwakilan-rekrut-perwakilan/
  // sahabat-rekrut-sahabat). Independen dari roleAwal/form.role biar gak
  // ilang kalau user klik "Ubah" ganti pilihan role di step 2.
  const [refPerwakilanJamaahId, setRefPerwakilanJamaahId] = useState(null);
  const [refSahabatJamaahId, setRefSahabatJamaahId] = useState(null);
  // Kode referral perwakilan yang diketik manual (bukan dari link) —
  // dikonfirmasi user 2026-09-03: kartu "Perwakilan" tetap selalu
  // ditawarkan, tapi WAJIB isi kode referral valid (bukan pilih nama dari
  // dropdown) sebagai bukti orangnya beneran kenal/direkomendasikan
  // perwakilan aktif — gak ada lagi jalur "daftar mandiri".
  const [kodeReferralPerwakilan, setKodeReferralPerwakilan] = useState('');
  const [kodeReferralInvalid, setKodeReferralInvalid] = useState(false);
  const [kodeReferralChecking, setKodeReferralChecking] = useState(false);
  // Eligible daftar Perwakilan TANPA kode referral kalau NIK yang diketik
  // tercatat pernah beneran berangkat umroh bersama JM Travel (dikonfirmasi
  // user 2026-09-06) — dicek publik (belum ada akun), cuma balikin boolean,
  // gak expose detail booking siapa pun.
  const [pernahUmroh, setPernahUmroh] = useState(false);
  useEffect(() => {
    const nik = form.nik.trim();
    if (nik.length !== 16) { setPernahUmroh(false); return; }
    const timer = setTimeout(() => {
      fetch(`/api/cek-riwayat-umroh?nik=${encodeURIComponent(nik)}`)
        .then(r => r.json())
        .then(d => setPernahUmroh(!!d.pernahUmroh))
        .catch(() => setPernahUmroh(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [form.nik]);
  // Sama persis pola kode referral Perwakilan di atas, tapi buat gerbang
  // rekrut-sahabat-baru (dikonfirmasi user 2026-09-03: "gada lg bs milih
  // siapa yg rekrut" — dropdown bebas diganti kode invite acak, mirror
  // kode_invite_perwakilan). kodeInviteSahabatDariLink nandain kartu
  // Sahabat Baitullah harus tetap kebuka/kepilih kalau link-nya pakai kode
  // invite valid (BEDA dari refSahabatJamaahId yang match kode_unik biasa
  // buat referral JAMAAH, bukan buat jadi anggota sahabat baru).
  const [kodeReferralSahabat, setKodeReferralSahabat] = useState('');
  const [kodeReferralSahabatInvalid, setKodeReferralSahabatInvalid] = useState(false);
  const [kodeReferralSahabatChecking, setKodeReferralSahabatChecking] = useState(false);
  const [kodeInviteSahabatDariLink, setKodeInviteSahabatDariLink] = useState(false);

  const isDirty = step > 1 || !!(form.name || form.nik || form.wa || form.email || form.password);
  useUnsavedGuard(isDirty);

  function keluar(tujuan) {
    if (isDirty && !confirm('Yakin ingin keluar? Data pendaftaran yang sudah diisi akan hilang.')) return;
    router.push(tujuan);
  }

  // Jaga-jaga jamaah publik landing lewat link referral perwakilan (buat
  // checkout, bukan buat jadi perwakilan) sebelum sempat mampir ke halaman
  // program — simpan ke localStorage biar kepakai nanti di /checkout.
  useEffect(() => { tangkapRefPerwakilan(); }, []);

  useEffect(() => {
    // Publik (belum login) — untuk pilih "siapa yang merekrut Anda",
    // menentukan rantai komisi override. Ambil dua-duanya sekaligus (bukan
    // cuma role yang lagi kepilih) karena user bisa ganti pilihan role di
    // step 2 kapan saja.
    fetch('/api/referral-list')
      .then(r => r.json())
      .then(d => {
        const list = d.perwakilan || [];
        setPerwList(list);
        // Referral permanen jamaah — dicek TERLEPAS dari roleAwal, biar
        // tetap kepakai walau user akhirnya daftar sebagai jamaah (link
        // perwakilan dishare ke calon jamaah, bukan cuma calon perwakilan).
        if (refCode) {
          const matchJamaah = list.find(p => p.kode_unik === refCode);
          if (matchJamaah) setRefPerwakilanJamaahId(matchJamaah.id);
        }
      })
      .catch(() => {});
    fetch('/api/referral-list?role=sahabat')
      .then(r => r.json())
      .then(d => {
        const list = d.perwakilan || [];
        setSahabatList(list);
        // ?ref=<kode_unik> dari link pribadi anggota sahabat — auto-lock
        // perekrut_id kalau match, gak perlu pilih manual dari dropdown.
        const matchRoleAwal = refCode && list.find(k => k.kode_unik === refCode);
        if (refCode && roleAwal === 'sahabat_baitullah') {
          if (matchRoleAwal) setForm(f => ({ ...f, perekrut_id: matchRoleAwal.id }));
          else setRefNotFound(true);
        }
        // Sahabat Baitullah BUKAN pilihan self-service terbuka — cuma boleh
        // dipilih kalau beneran datang dari link referral anggota sahabat
        // aktif (dikonfirmasi user 2026-09-03). Kalau modal kemitraan landing
        // page (atau siapapun) bawa ?role=sahabat tanpa ref yang valid,
        // batalkan pre-seleksinya & balik ke kartu pilihan biasa (yang di
        // bawah juga udah nyaring sahabat keluar kalau refSahabatJamaahId
        // kosong).
        if (roleAwal === 'sahabat_baitullah' && !matchRoleAwal) {
          setTampilkanPilihan(true);
          setForm(f => (f.role === 'sahabat_baitullah' ? { ...f, role: '' } : f));
        }
        // Referral permanen jamaah dari link sahabat (Sahabat Baitullah) —
        // dicek TERLEPAS dari roleAwal juga, sama alasannya kayak di atas:
        // ini yang nutup celah lama (form.perekrut_id nyasar ke users.perekrut_id
        // pas user klik "Ubah" pilih Jamaah) dengan nyimpen ke state terpisah.
        if (refCode) {
          const matchKopJamaah = list.find(k => k.kode_unik === refCode);
          if (matchKopJamaah) setRefSahabatJamaahId(matchKopJamaah.id);
        }
      })
      .catch(() => {});
  }, []);

  // ?role=perwakilan&ref=<kode_invite> dari link pribadi rekrut-perwakilan —
  // BEDA sumber kode dari kode_unik (dikonfirmasi user 2026-09-03: kode_unik
  // sekuensial/predictable, gak aman dipakai buat gerbang wajib ini). Divalidasi
  // ke server (bukan cocokin ke list yang di-fetch client), karena daftar kode
  // invite MEMANG gak boleh pernah di-list ke client sama sekali — itu inti
  // kenapa kode ini aman dari tebak-tebakan.
  useEffect(() => {
    if (!(refCode && roleAwal === 'perwakilan')) return;
    fetch('/api/referral-list/verify-invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kode: refCode }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.valid) setForm(f => ({ ...f, perekrut_id: d.id }));
        else setRefNotFound(true);
      })
      .catch(() => {});
  }, [refCode, roleAwal]);

  // ?role=sahabat&ref=<kode_invite_sahabat> dari link "rekrut anggota
  // sahabat baru" (beda dari link referral biasa yang pakai kode_unik,
  // lihat matchKopJamaah di atas) — begitu valid, paksa role & pilihan
  // tetap 'sahabat_baitullah' + perekrut_id terkunci, override reset yang mungkin
  // sempat kejadian di effect /api/referral-list di atas (race aman karena
  // ini state terakhir yang menang buat kasus ini).
  useEffect(() => {
    if (!(refCode && roleAwal === 'sahabat_baitullah')) return;
    fetch('/api/referral-list/verify-invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kode: refCode, tipe: 'sahabat_baitullah' }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.valid) {
          setKodeInviteSahabatDariLink(true);
          setTampilkanPilihan(false);
          setForm(f => ({ ...f, role: 'sahabat_baitullah', perekrut_id: d.id }));
        }
      })
      .catch(() => {});
  }, [refCode, roleAwal]);

  // Verifikasi kode referral perwakilan yang DIKETIK MANUAL (bukan dari
  // link) — didebounce 400ms, ke server yang sama persis dgn di atas.
  // Sengaja gak ada matching client-side ke perwList sama sekali (itu cuma
  // punya kode_unik, bukan kode invite) — satu-satunya sumber kebenaran
  // adalah endpoint verify-invite.
  useEffect(() => {
    const kode = kodeReferralPerwakilan.trim();
    if (!kode) { setKodeReferralInvalid(false); return; }
    setKodeReferralChecking(true);
    const timer = setTimeout(() => {
      fetch('/api/referral-list/verify-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) { setForm(f => ({ ...f, perekrut_id: d.id })); setKodeReferralInvalid(false); }
          else setKodeReferralInvalid(true);
        })
        .catch(() => {})
        .finally(() => setKodeReferralChecking(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [kodeReferralPerwakilan]);

  // Verifikasi kode referral sahabat yang DIKETIK MANUAL — mirror persis
  // yang perwakilan di atas.
  useEffect(() => {
    const kode = kodeReferralSahabat.trim();
    if (!kode) { setKodeReferralSahabatInvalid(false); return; }
    setKodeReferralSahabatChecking(true);
    const timer = setTimeout(() => {
      fetch('/api/referral-list/verify-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode, tipe: 'sahabat_baitullah' }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) { setForm(f => ({ ...f, perekrut_id: d.id })); setKodeReferralSahabatInvalid(false); }
          else setKodeReferralSahabatInvalid(true);
        })
        .catch(() => {})
        .finally(() => setKodeReferralSahabatChecking(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [kodeReferralSahabat]);

  // Fallback: jamaah yang landing lewat link referral perwakilan di
  // /program/[id]?ref=... (bukan langsung ke /register?ref=...) — kodenya
  // udah ke-capture ke localStorage (tangkapRefPerwakilan di halaman lain),
  // dipakai di sini kalau ?ref= gak ada di URL registrasi itu sendiri.
  useEffect(() => {
    if (refPerwakilanJamaahId || perwList.length === 0) return;
    const kode = ambilRefPerwakilan();
    if (!kode) return;
    const match = perwList.find(p => p.kode_unik === kode);
    if (match) setRefPerwakilanJamaahId(match.id);
  }, [perwList, refPerwakilanJamaahId]);

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
    // Perwakilan & sahabat wajib punya kode referral valid (dikonfirmasi
    // user 2026-09-03) — dicek di sini juga, jangan cuma andalkan disable
    // tombol/UI, biar konsisten kalau ada state race. KECUALI (dikonfirmasi
    // user 2026-09-06): NIK-nya tercatat udah pernah berangkat umroh
    // bersama JM Travel — otomatis eligible tanpa kode referral, tapi kode
    // yang udah keisi (link/manual) tetap dipakai/gak dipaksa dikosongkan.
    if (form.role === 'perwakilan' && !form.perekrut_id && !pernahUmroh) {
      setError('Masukkan kode referral perwakilan yang valid untuk melanjutkan.'); return;
    }
    if (form.role === 'sahabat_baitullah' && !form.perekrut_id) {
      setError('Masukkan kode referral Sahabat Baitullah yang valid untuk melanjutkan.'); return;
    }
    setLoading(true);
    try {
      // role='jamaah' TIDAK PERNAH kirim perekrut_id (itu khusus rantai
      // perwakilan-rekrut-perwakilan/sahabat-rekrut-sahabat) — referral
      // permanen jamaah dikirim lewat 2 field terpisah di bawah, biar gak
      // ketuker/nyasar ke users.perekrut_id kalau user sempat klik "Ubah"
      // pindah dari role sahabat/perwakilan ke jamaah.
      const payload = form.role === 'jamaah'
        ? { ...form, perekrut_id: undefined,
            ref_perwakilan_jamaah_id: refPerwakilanJamaahId || undefined,
            ref_sahabat_jamaah_id: refSahabatJamaahId || undefined }
        : form;
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      router.push(redirect ? `/verifikasi?redirect=${encodeURIComponent(redirect)}` : '/verifikasi');
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
                  ✓ Mendaftar sebagai <b>{form.role === 'perwakilan' ? 'Perwakilan Resmi' : form.role === 'sahabat_baitullah' ? 'Jamaah Sahabat Baitullah' : 'Jamaah'}</b>
                </div>
              )}
              {(refPerwakilanJamaahId || refSahabatJamaahId) && (() => {
                const nama = refPerwakilanJamaahId
                  ? perwList.find(p => p.id === refPerwakilanJamaahId)?.name
                  : sahabatList.find(k => k.id === refSahabatJamaahId)?.name;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700">
                    📌 Kalau Anda daftar sebagai <b>Jamaah</b>, akun ini akan terhubung permanen dengan {refPerwakilanJamaahId ? 'Perwakilan' : 'anggota Sahabat Baitullah'} <b>{nama || '-'}</b> — tidak bisa diubah lagi setelah akun dibuat.
                  </div>
                );
              })()}
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
                <PasswordInput
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                  placeholder="Min. 8 karakter"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">Konfirmasi Password *</label>
                <PasswordInput
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
                <span className="text-[#1A4FA0] font-semibold cursor-pointer hover:underline" onClick={() => keluar(loginUrl)}>Masuk</span>
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
                // Role udah kebawa dari link/popup kemitraan — SENGAJA gak ada
                // tombol "Ubah" (dikonfirmasi user 2026-09-03): begitu datang
                // lewat link referral, tipe akun & kode referralnya permanen,
                // gak bisa diubah di sini. Kalau mau daftar tipe lain (mis.
                // jamaah biasa), tinggal keluar dari link ini & buka /register
                // polos — bukan ubah-ubah pilihan di form yang sama.
                <div className="flex items-center gap-3 bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-3">
                  <div className="text-2xl">{form.role === 'sahabat_baitullah' ? '🤝' : '🏢'}</div>
                  <div className="font-bold text-[#0E2F6E] text-sm">
                    {form.role === 'sahabat_baitullah' ? 'Jamaah Sahabat Baitullah' : 'Perwakilan Resmi'}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {value:'jamaah', icon:'🕌', title:'Jamaah', desc:'Daftar program umroh & haji'},
                    // Kartu Perwakilan TETAP selalu ditawarkan (beda dari
                    // Sahabat Baitullah di bawah) — gerbangnya bukan di sini,
                    // tapi di kolom kode referral wajib pas dipilih (lihat
                    // blok form.role==='perwakilan' di bawah, dikonfirmasi
                    // user 2026-09-03).
                    {value:'perwakilan', icon:'🏢', title:'Perwakilan', desc:'Kelola program di wilayah Anda'},
                    // Sahabat Baitullah cuma ditawarkan kalau kode referral di
                    // URL beneran match anggota sahabat aktif — bukan
                    // pilihan self-service terbuka (dikonfirmasi user
                    // 2026-09-03), sejalan sama program-nya sendiri yang
                    // exclusive undangan/referral. Dua sumber kode BEDA yang
                    // sama-sama boleh buka kartu ini: refSahabatJamaahId
                    // (kode_unik, link referral jamaah biasa) ATAU
                    // kodeInviteSahabatDariLink (kode_invite_sahabat, link
                    // khusus rekrut anggota sahabat baru).
                    ...((refSahabatJamaahId || kodeInviteSahabatDariLink) ? [{value:'sahabat_baitullah', icon:'🤝', title:'Sahabat Baitullah', desc:'Program tabungan umroh bersama JM Travel & BSI'}] : []),
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

              {form.role === 'perwakilan' && (() => {
                const terkunci = perwList.find(p => p.id === form.perekrut_id);
                return (
                  <div>
                    <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">
                      Kode Referral Perwakilan {!pernahUmroh && <span className="text-red-500">*</span>}
                      {pernahUmroh && <span className="font-normal text-gray-400"> (opsional)</span>}
                    </label>
                    {pernahUmroh && (
                      <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mb-2">
                        ✅ Anda sudah eligible menjadi perwakilan karena tercatat sudah pernah umroh bersama JM Travel. Kode referral di bawah opsional — boleh tetap diisi kalau ada, atau langsung lanjut tanpa kode.
                      </div>
                    )}
                    {terkunci ? (
                      // Permanen begitu valid — SENGAJA gak ada tombol "Ubah"
                      // (dikonfirmasi user 2026-09-03), mirror alasan yang sama
                      // kayak tipe akun di atas.
                      <div className="bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-3">
                        <div className="text-sm font-bold text-[#0E2F6E]">{terkunci.name} ({terkunci.kode_unik})</div>
                      </div>
                    ) : (
                      <input
                        value={kodeReferralPerwakilan}
                        onChange={e => setKodeReferralPerwakilan(e.target.value)}
                        placeholder="Contoh: 7XQK92B"
                        className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none text-sm ${kodeReferralInvalid ? 'border-red-300' : 'border-gray-200 focus:border-[#1A4FA0]'}`}
                      />
                    )}
                    {kodeReferralChecking && (
                      <div className="text-[10px] text-gray-400 mt-1">Mengecek kode...</div>
                    )}
                    {kodeReferralInvalid && !kodeReferralChecking && (
                      <div className="text-[10px] text-red-500 mt-1">Kode referral tidak ditemukan atau perwakilan tidak aktif.</div>
                    )}
                    {refNotFound && (
                      <div className="text-[10px] text-red-500 mt-1">Kode referral di link tidak ditemukan/nonaktif — silakan masukkan manual.</div>
                    )}
                    <div className="text-[10px] text-gray-400 mt-1">
                      {pernahUmroh
                        ? 'Kode referral rekrut-perwakilan milik salah satu Perwakilan JM Travel yang aktif (bukan kode akun/kode_unik biasa) — opsional buat Anda karena sudah eligible dari riwayat umroh.'
                        : 'Wajib diisi kode referral rekrut-perwakilan milik salah satu Perwakilan JM Travel yang aktif (bukan kode akun/kode_unik biasa) — pendaftaran mandiri tanpa referral tidak tersedia lagi. Belum punya kode? Hubungi kami langsung.'}
                    </div>
                  </div>
                );
              })()}

              {form.role === 'sahabat_baitullah' && (() => {
                const terkunci = sahabatList.find(k => k.id === form.perekrut_id);
                return (
                  <div>
                    <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">
                      Kode Referral Sahabat Baitullah <span className="text-red-500">*</span>
                    </label>
                    {terkunci ? (
                      <div className="bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-3">
                        <div className="text-sm font-bold text-[#0E2F6E]">{terkunci.name} ({terkunci.kode_unik})</div>
                      </div>
                    ) : (
                      <input
                        value={kodeReferralSahabat}
                        onChange={e => setKodeReferralSahabat(e.target.value)}
                        placeholder="Contoh: 7XQK92B"
                        className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none text-sm ${kodeReferralSahabatInvalid ? 'border-red-300' : 'border-gray-200 focus:border-[#1A4FA0]'}`}
                      />
                    )}
                    {kodeReferralSahabatChecking && (
                      <div className="text-[10px] text-gray-400 mt-1">Mengecek kode...</div>
                    )}
                    {kodeReferralSahabatInvalid && !kodeReferralSahabatChecking && (
                      <div className="text-[10px] text-red-500 mt-1">Kode referral tidak ditemukan atau anggota Sahabat Baitullah tidak aktif.</div>
                    )}
                    <div className="text-[10px] text-gray-400 mt-1">
                      Wajib diisi kode referral rekrut-anggota milik salah satu Jamaah Sahabat Baitullah yang aktif (bukan kode akun/kode_unik biasa) — pendaftaran mandiri tanpa referral tidak tersedia.
                    </div>
                  </div>
                );
              })()}

              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">⚠️ {error}</div>}
              <div className="flex gap-2">
                <button onClick={() => setStep(1)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
                  ← Kembali
                </button>
                <button onClick={handleRegister} disabled={loading}
                  className="flex-[2] bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-60">
                  {loading ? 'Memproses...' : 'Selesai & Masuk →'}
                </button>
              </div>
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