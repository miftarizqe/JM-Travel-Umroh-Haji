'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { AddressFields, alamatLengkap } from '@/app/components/AddressFields';
import { langkahBerikutnyaPerwakilan } from '@/lib/perwakilanFlow';

const emptyForm = () => ({
  nama:'', nik:'', tempat_lahir:'', tl:'', jk:'Laki-Laki', ibu:'', foto_ktp_path:'',
  // Alamat KTP
  jalan:'', norumah:'', rt:'', rw:'', kp:'', kel:'', kec:'', kota:'', provinsi:'', negara:'Indonesia',
  // Alamat domisili — sama_ktp true berarti dianggap sama dgn alamat KTP di atas
  sama_ktp: true,
  jalan_dom:'', norumah_dom:'', rt_dom:'', rw_dom:'', kp_dom:'', kel_dom:'', kec_dom:'', kota_dom:'', provinsi_dom:'', negara_dom:'Indonesia',
  wa:'', email:'', pkj:'',
  bank:'', norek:'', pemilik:'',
  perekrut_id:'',
});

export default function DaftarPerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [perwList, setPerwList] = useState([]);
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    nama: user?.name || '', nik: user?.nik || '', wa: user?.wa || '', email: user?.email || '',
  }));
  const [step, setStep] = useState(1); // 1=data diri, 2=alamat, 3=rekening+perekrut, 4=konfirmasi
  const [loading, setLoading] = useState(false);
  const [cek, setCek] = useState(null); // prasyarat
  const [uploadingKtp, setUploadingKtp] = useState(false);
  const [profil, setProfil] = useState(null);

  const isDirty = step > 1 || !!form.tl || !!form.ibu.trim() || !!form.pkj.trim();
  useUnsavedGuard(isDirty);

  const setF = (k,v) => setForm(p => ({...p, [k]: v}));

  useEffect(() => {
    if (!user) return;

    // Cek prasyarat — jangan biarkan step diloncati
    fetch('/api/status-pendaftaran').then(r => r.json()).then(d => setCek(d)).catch(()=>{});
    // Perekrut boleh perwakilan aktif lain — sama seperti register/page.jsx
    fetch('/api/referral-list').then(r => r.json()).then(d => { setPerwList(d.perwakilan||[]); }).catch(()=>{});
    // User yang daftar LANGSUNG sebagai perwakilan (role sudah 'perwakilan'
    // sejak register/page.jsx, lihat upload-foto/page.jsx yang paksa mampir
    // ke sini) SUDAH ditanya "siapa yang merekrut Anda" pas register — jangan
    // tanya ulang di sini, tinggal tampilkan. User yang upgrade dari jamaah
    // (lewat /upgrade-perwakilan) belum pernah ditanya sama sekali, tetap
    // pakai dropdown biasa di bawah.
    fetch(`/api/profil?user_id=${user.id}`).then(r => r.json()).then(d => { if (d.user) setProfil(d.user); }).catch(()=>{});
  }, [user]);

  // Perekrut dari registrasi sudah final (role sudah 'perwakilan') — dipakai
  // langsung dari `profil` pas submit, bukan disalin ke form.perekrut_id,
  // biar gak ada setState nyinkron di useEffect buat state yang bisa
  // diturunkan langsung (lihat submit() & ringkasan step 4). Upgrade dari
  // jamaah yang PUNYA referral permanen (dikunci sejak registrasi jamaah,
  // lihat users.perekrut_perwakilan_jamaah_id) WAJIB pakai itu juga, gak
  // boleh pilih manual — baru jamaah TANPA referral permanen yang tetap
  // pakai dropdown form.perekrut_id biasa.
  const perekrutIdTerkirim = user?.role === 'perwakilan'
    ? (profil?.perekrut_id || '')
    : profil?.perekrut_perwakilan_jamaah_id
      ? profil.perekrut_perwakilan_jamaah_id
      : form.perekrut_id;

  async function pilihFotoKtp(file) {
    if (!file) return;
    setUploadingKtp(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-ktp', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setF('foto_ktp_path', d.path);
      else alert(d.error || 'Gagal mengunggah foto KTP');
    } catch { alert('Terjadi kesalahan saat mengunggah foto KTP'); }
    setUploadingKtp(false);
  }

  function validStep() {
    if (step === 1) {
      if (!form.nama.trim()) return alert('Nama wajib diisi!') || false;
      if (!/^\d{16}$/.test(form.nik.trim())) return alert('NIK harus 16 digit angka!') || false;
      if (!form.tempat_lahir.trim()) return alert('Tempat lahir wajib diisi!') || false;
      if (!form.tl) return alert('Tanggal lahir wajib diisi!') || false;
      if (!form.ibu.trim()) return alert('Nama ibu kandung wajib diisi!') || false;
      if (!form.wa.trim()) return alert('No. WhatsApp wajib diisi!') || false;
      if (!form.foto_ktp_path) return alert('Foto KTP wajib diunggah!') || false;
    }
    if (step === 2) {
      if (!alamatLengkap(form, ''))
        return alert('Alamat KTP wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)!') || false;
      if (!form.sama_ktp && !alamatLengkap(form, '_dom'))
        return alert('Alamat domisili wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)!') || false;
    }
    if (step === 3) {
      if (!form.bank.trim() || !form.norek.trim() || !form.pemilik.trim())
        return alert('Data rekening wajib diisi!') || false;
    }
    return true;
  }

  // Submit formulir -> langsung chain ke TTD digital (self-service, pola sama
  // kayak simpanLaluTtdDigital jamaah di pks/page.jsx) -> /tanda-tangan/[id].
  // Metode Pendaftaran & PKS dipindah ke langkah SETELAH ini (lihat
  // /daftar-perwakilan/metode & /pks?jenis=perwakilan), gak lagi di sini.
  async function submit() {
    if (!validStep()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/daftar-perwakilan', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, perekrut_id: perekrutIdTerkirim })   // user_id diambil dari token, tidak dikirim
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setLoading(false); return; }

      const resSig = await fetch('/api/admin/dokumen-signature', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen: 'formulir', ref_id: user.id, metode: 'digital' }),
      });
      const dSig = await resSig.json();
      if (!resSig.ok) {
        alert((dSig.error || 'Formulir tersimpan, tapi gagal menyiapkan TTD digital.') + ' Silakan lanjutkan dari halaman status.');
        router.push('/status-pendaftaran');
        return;
      }
      router.push(`/tanda-tangan/${dSig.id}`);
    } catch { alert('Terjadi kesalahan'); }
    setLoading(false);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  // Blokir kalau prasyarat belum lengkap — mencegah step diloncati
  if (cek && !cek.prasyarat?.akun_terverifikasi) {
    return <Layout title="📝 Formulir Kemitraan Perwakilan" showBack><div className="max-w-md mx-auto">
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center">
        <div className="text-3xl mb-2">🔐</div>
        <h4 className="font-bold text-yellow-800 mb-1">Verifikasi Akun Dulu</h4>
        <p className="text-sm text-yellow-700 mb-3">Akun Anda belum terverifikasi.</p>
        <button onClick={() => router.push('/verifikasi')}
          className="bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full">Verifikasi Sekarang →</button>
      </div></div></Layout>;
  }
  if (cek && !cek.prasyarat?.foto_profil) {
    return <Layout title="📝 Formulir Kemitraan Perwakilan" showBack><div className="max-w-md mx-auto">
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center">
        <div className="text-3xl mb-2">📷</div>
        <h4 className="font-bold text-yellow-800 mb-1">Unggah Foto Profil Dulu</h4>
        <p className="text-sm text-yellow-700 mb-3">Foto wajib untuk ID Card perwakilan.</p>
        <button onClick={() => router.push('/upload-foto')}
          className="bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full">Unggah Foto →</button>
      </div></div></Layout>;
  }
  if (cek?.pendaftaran) {
    // Formulir udah pernah dikirim — arahkan ke langkah LANJUTAN yang belum
    // selesai (TTD formulir/PKS/pilih metode), bukan selalu ke status
    // tracker mentah, biar applicant yang keluar di tengah jalan gak nyangkut.
    const langkah = langkahBerikutnyaPerwakilan(cek) || '/status-pendaftaran';
    const sudahLengkap = langkah === '/status-pendaftaran';
    return <Layout title="📝 Formulir Kemitraan Perwakilan" showBack><div className="max-w-md mx-auto">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
        <h4 className="font-bold text-blue-800 mb-1">Anda Sudah Mendaftar</h4>
        <p className="text-sm text-blue-600 mb-3">
          {sudahLengkap ? 'Pantau progres pendaftaran Anda.' : 'Lanjutkan langkah pendaftaran yang belum selesai.'}
        </p>
        <button onClick={() => router.push(langkah)}
          className="bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full">
          {sudahLengkap ? 'Lihat Status →' : 'Lanjutkan Pendaftaran →'}
        </button>
      </div></div></Layout>;
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-[#0E2F6E] mb-1";
  const perekrutList = perwList;

  return (
    <Layout title="📝 Formulir Kemitraan Perwakilan" showBack confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Data formulir yang sudah diisi akan hilang.">
      <div className="max-w-2xl mx-auto">

        {/* Progress step */}
        <div className="flex items-center mb-6">
          {['Data Diri','Alamat','Rekening','Konfirmasi'].map((l,i) => (
            <div key={l} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i+1 < step ? 'bg-[#C9952A] text-white' : i+1 === step ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {i+1 < step ? '✓' : i+1}
                </div>
                <div className={`text-[9px] mt-1 ${i+1===step?'text-[#1A4FA0] font-bold':'text-gray-400'}`}>{l}</div>
              </div>
              {i < 3 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i+1<step?'bg-[#C9952A]':'bg-gray-200'}`}></div>}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">

          {step === 1 && (<>
            <div className="font-bold text-[#0E2F6E]">👤 Data Diri</div>
            <div><label className={lbl}>Nama Lengkap *</label>
              <input value={form.nama} onChange={e=>setF('nama',e.target.value)} className={inp}/></div>
            {/* NIK/WA/Email dikunci begitu sampai sini (dikonfirmasi user
                2026-09-20) — udah jadi data verifikasi awal pas akun
                dibuat, gak boleh diubah sendiri lagi. Koreksi cuma lewat admin. */}
            <div><label className={lbl}>NIK (16 digit) *</label>
              <div className={`${inp} bg-gray-50 text-gray-400`}>{form.nik || '-'}</div></div>
            <div><label className={lbl}>Tempat Lahir *</label>
              <input value={form.tempat_lahir} onChange={e=>setF('tempat_lahir',e.target.value)} className={inp}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Tanggal Lahir *</label>
                <input type="date" value={form.tl} onChange={e=>{ if (e.target.value) setF('tl',e.target.value); }} className={inp}/></div>
              <div><label className={lbl}>Jenis Kelamin *</label>
                <select value={form.jk} onChange={e=>setF('jk',e.target.value)} className={inp}>
                  <option>Laki-Laki</option><option>Perempuan</option></select></div>
            </div>
            <div><label className={lbl}>Nama Ibu Kandung *</label>
              <input value={form.ibu} onChange={e=>setF('ibu',e.target.value)} className={inp}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>No. WhatsApp *</label>
                <div className={`${inp} bg-gray-50 text-gray-400`}>{form.wa || '-'}</div></div>
              <div><label className={lbl}>Email *</label>
                <div className={`${inp} bg-gray-50 text-gray-400`}>{form.email || '-'}</div></div>
            </div>
            <div className="text-[10px] text-gray-400 -mt-1">NIK, No. WhatsApp, dan Email adalah data verifikasi awal — cuma bisa dikoreksi lewat admin.</div>
            <div><label className={lbl}>Pekerjaan</label>
              <input value={form.pkj} onChange={e=>setF('pkj',e.target.value)} className={inp}/></div>

            <div>
              <label className={lbl}>Foto KTP *</label>
              {form.foto_ktp_path ? (
                <div className="border-2 border-green-200 bg-green-50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-green-700">✅ Foto KTP terunggah</span>
                  <label className="text-xs font-bold text-[#1A4FA0] cursor-pointer">
                    Ganti
                    <input type="file" accept="image/jpeg,image/png" className="hidden"
                      onChange={e=>pilihFotoKtp(e.target.files?.[0])}/>
                  </label>
                </div>
              ) : (
                <label className={`block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer ${uploadingKtp ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-500 hover:border-[#1A4FA0]'}`}>
                  {uploadingKtp ? 'Mengunggah...' : '📷 Klik untuk unggah foto KTP (JPG/PNG, maks 3MB)'}
                  <input type="file" accept="image/jpeg,image/png" className="hidden" disabled={uploadingKtp}
                    onChange={e=>pilihFotoKtp(e.target.files?.[0])}/>
                </label>
              )}
            </div>
          </>)}

          {step === 2 && (<>
            <div className="font-bold text-[#0E2F6E]">🏠 Alamat KTP</div>
            <AddressFields form={form} setF={setF} suffix="" inp={inp} lbl={lbl}/>

            <div className="pt-3 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={form.sama_ktp} onChange={e=>setF('sama_ktp',e.target.checked)}
                  className="w-4 h-4 accent-[#1A4FA0]"/>
                <span className="text-sm font-semibold text-[#0E2F6E]">Alamat domisili sama dengan alamat KTP</span>
              </label>
              {!form.sama_ktp && (<>
                <div className="font-bold text-[#0E2F6E] mt-2">🏠 Alamat Domisili</div>
                <AddressFields form={form} setF={setF} suffix="_dom" inp={inp} lbl={lbl}/>
              </>)}
            </div>
          </>)}

          {step === 3 && (<>
            <div className="font-bold text-[#0E2F6E]">🏦 Rekening & Perekrut</div>
            <div><label className={lbl}>Nama Bank *</label>
              <input value={form.bank} onChange={e=>setF('bank',e.target.value)} placeholder="Contoh: BSI" className={inp}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>No. Rekening *</label>
                <input value={form.norek} onChange={e=>setF('norek',e.target.value.replace(/\D/g,''))} inputMode="numeric" className={inp}/></div>
              <div><label className={lbl}>Nama Pemilik *</label>
                <input value={form.pemilik} onChange={e=>setF('pemilik',e.target.value)} className={inp}/></div>
            </div>

            <div className="pt-2">
              <label className={lbl}>Siapa yang merekrut Anda?</label>
              {user?.role === 'perwakilan' ? (
                <>
                  <div className="w-full px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-sm text-gray-600">
                    {profil?.perekrut_nama || '-- Tidak ada / daftar mandiri --'}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Sudah dipilih waktu Anda mendaftar akun, tidak bisa diubah di sini.
                  </div>
                </>
              ) : profil?.perekrut_perwakilan_jamaah_id ? (
                <>
                  <div className="w-full px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-sm text-gray-600">
                    {profil.perekrut_perwakilan_jamaah_nama} ({profil.perekrut_perwakilan_jamaah_kode})
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Terhubung otomatis dari referral saat Anda mendaftar sebagai jamaah — tidak bisa diubah.
                  </div>
                </>
              ) : (
                <>
                  <select value={form.perekrut_id} onChange={e=>setF('perekrut_id',e.target.value)} className={inp}>
                    <option value="">-- Tidak ada / daftar mandiri --</option>
                    {perwList.map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.wilayah ? ` — ${p.wilayah}` : ''} ({p.kode_unik})</option>
                    ))}
                  </select>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Hanya perwakilan aktif yang bisa dipilih. Perekrut mendapat komisi override dari closing Anda.
                  </div>
                </>
              )}
            </div>
          </>)}

          {step === 4 && (<>
            <div className="font-bold text-[#0E2F6E]">✅ Konfirmasi Data</div>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5">
              {[
                ['Nama', form.nama], ['NIK', form.nik], ['Tgl Lahir', form.tl],
                ['WhatsApp', form.wa], ['Email', form.email],
                ['Kota', form.kota], ['Bank', `${form.bank} - ${form.norek}`],
                ['Perekrut', user?.role === 'perwakilan'
                  ? (profil?.perekrut_nama || 'Tidak ada')
                  : profil?.perekrut_perwakilan_jamaah_id
                    ? profil.perekrut_perwakilan_jamaah_nama
                    : (perekrutList.find(a=>String(a.id)===String(form.perekrut_id))?.name || 'Tidak ada')],
              ].map(([k,v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-400">{k}</span>
                  <span className="font-semibold text-[#0E2F6E]">{v || '-'}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#E8F0FB] rounded-lg p-3 text-xs text-[#1A4FA0]">
              Setelah kirim, Anda akan diminta <b>TTD digital</b> formulir ini, lalu membaca &
              menyetujui <b>Perjanjian Kerjasama Perwakilan</b>, lalu memilih metode pendaftaran
              (datang ke kantor / kirim paket).
            </div>
          </>)}

          {/* Navigasi */}
          <div className="flex gap-2 pt-2">
            {step > 1 && (
              <button onClick={()=>setStep(step-1)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-full text-sm">
                ← Kembali
              </button>
            )}
            {step < 4 ? (
              <button onClick={()=>{ if(validStep()) setStep(step+1); }}
                className="flex-[2] bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full text-sm">
                Lanjut →
              </button>
            ) : (
              <button onClick={submit} disabled={loading}
                className="flex-[2] bg-[#C9952A] hover:bg-yellow-600 text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-50">
                {loading ? 'Mengirim...' : '📤 Kirim Formulir'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
