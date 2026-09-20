'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser, useMounted } from '@/lib/useCurrentUser';
import { usePengaturan } from '@/lib/usePengaturan';
import { AddressFields, alamatLengkap } from '@/app/components/AddressFields';
import { hargaTermurahProgram } from '@/lib/harga';

const emptyForm = () => ({
  nama:'', nik:'', tempat_lahir:'', tl:'', jk:'Laki-Laki', ibu:'', foto_ktp_path:'',
  jalan:'', norumah:'', rt:'', rw:'', kp:'', kel:'', kec:'', kota:'', provinsi:'', negara:'Indonesia',
  sama_ktp: true,
  jalan_dom:'', norumah_dom:'', rt_dom:'', rw_dom:'', kp_dom:'', kel_dom:'', kec_dom:'', kota_dom:'', provinsi_dom:'', negara_dom:'Indonesia',
  wa:'', email:'', pkj:'',
  target_program_id:'',
  // Paspor OPSIONAL (dikonfirmasi user 2026-09-20) — sekalian disimpen dari
  // awal kalau jamaah udah punya, biar gak perlu diminta ulang pas beneran
  // booking berangkat nanti.
  no_paspor:'', tempat_keluar_paspor:'', masa_berlaku_paspor_dari:'', masa_berlaku_paspor_sampai:'', foto_paspor_path:'',
  bank:'', norek:'', pemilik:'',
  perekrut_id:'',
  target_minat:'', target_estimasi_harga:'',
});

export default function DaftarSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const mounted = useMounted();
  const [pengaturan] = usePengaturan();
  const [sahabatList, setSahabatList] = useState([]);
  const [programEksklusif, setProgramEksklusif] = useState([]);
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    nama: user?.name || '', nik: user?.nik || '', wa: user?.wa || '', email: user?.email || '',
  }));
  const [step, setStep] = useState(1); // 1=data diri, 2=alamat, 3=perekrut+target, 4=rekening tabungan umroh
  const [sudahKirim, setSudahKirim] = useState(false);
  const [uploadingKtp, setUploadingKtp] = useState(false);
  const [uploadingPaspor, setUploadingPaspor] = useState(false);
  const [profil, setProfil] = useState(null);
  const [punyaRekening, setPunyaRekening] = useState('sudah'); // 'sudah' | 'belum' — cuma nentuin tampil-gaknya panduan Byond
  const [norekUmroh, setNorekUmroh] = useState('');
  const [savingRekening, setSavingRekening] = useState(false);

  const isDirty = step > 1 || !!form.tl || !!form.ibu.trim();
  useUnsavedGuard(isDirty);

  const setF = (k,v) => setForm(p => ({...p, [k]: v}));

  useEffect(() => {
    if (!user) return;
    fetch('/api/referral-list?role=sahabat_baitullah').then(r => r.json()).then(d => setSahabatList(d.perwakilan || [])).catch(()=>{});
    fetch(`/api/profil?user_id=${user.id}`).then(r => r.json()).then(d => { if (d.user) setProfil(d.user); }).catch(()=>{});
    // Target Impian (step 3) dipilih dari Program Eksklusif yang admin
    // tandai khusus Sahabat Baitullah (publish_type='sahabat_baitullah',
    // dikonfirmasi user 2026-09-20) — bukan lagi teks bebas. /api/programs
    // buat role ini juga ngembaliin publish_type='public' & 'private'
    // whitelist, jadi difilter lagi di sini biar cuma yang eksklusif aja
    // yang muncul di dropdown ini.
    fetch('/api/programs').then(r => r.json()).then(d => {
      setProgramEksklusif((d.programs || []).filter(p => p.publish_type === 'sahabat_baitullah'));
    }).catch(()=>{});
    // Sudah pernah isi data diri? Kalau rekening tabungan umroh juga udah
    // keisi (mis. diisi lewat /status-pendaftaran-sahabat), gak ada lagi
    // yang perlu dikerjakan di wizard ini — lompat langsung ke perjanjian.
    // Kalau belum, lompat ke step Rekening (step 4).
    fetch('/api/status-pendaftaran-sahabat').then(r => r.json()).then(d => {
      if (d.prasyarat?.data_diri_terkirim) {
        setSudahKirim(true);
        if (d.prasyarat?.tabungan_haji_status) router.push('/pks?jenis=sahabat_baitullah');
        else setStep(4);
      }
    }).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Perekrut dari registrasi (kalau daftar via link) sudah final — dipakai
  // langsung dari `profil`, bukan disalin ke form.perekrut_id.
  const perekrutIdTerkirim = profil?.perekrut_id || form.perekrut_id;

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

  async function pilihFotoPaspor(file) {
    if (!file) return;
    setUploadingPaspor(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-paspor', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setF('foto_paspor_path', d.path);
      else alert(d.error || 'Gagal mengunggah foto paspor');
    } catch { alert('Terjadi kesalahan saat mengunggah foto paspor'); }
    setUploadingPaspor(false);
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
      if (!form.target_program_id) return alert('Target Impian (Program) wajib dipilih!') || false;
    }
    if (step === 4) {
      if (!norekUmroh.trim()) return alert('Nomor rekening tabungan umroh wajib diisi!') || false;
    }
    return true;
  }

  // Data diri (step 1-3) disimpan sekali lewat POST /api/daftar-sahabat.
  // Rekening tabungan umroh (step 4) disimpan terpisah lewat PATCH
  // /api/sahabat/rekening-bsi (self-service, isi sekali) — dua endpoint
  // beda tabel, jadi wajib dipanggil berurutan di sini.
  async function lanjutKePerjanjian() {
    if (!validStep()) return;
    setSavingRekening(true);
    try {
      if (!sudahKirim) {
        const res = await fetch('/api/daftar-sahabat', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ ...form, perekrut_id: perekrutIdTerkirim })
        });
        const d = await res.json();
        if (!res.ok) { alert(d.error); setSavingRekening(false); return; }
        setSudahKirim(true);
      }
      const resRek = await fetch('/api/sahabat/rekening-bsi', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'no_rekening_tabungan_umroh', no_rekening: norekUmroh.trim() }),
      });
      const dRek = await resRek.json();
      if (!resRek.ok) { alert(dRek.error); setSavingRekening(false); return; }
      router.push('/pks?jenis=sahabat_baitullah');
    } catch { alert('Terjadi kesalahan'); }
    setSavingRekening(false);
  }

  if (!mounted || !user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-[#0E2F6E] mb-1";

  return (
    <Layout title="🤝 Pendaftaran Sahabat Baitullah" showBack confirmLeave={isDirty && !sudahKirim}
      confirmMessage="Yakin ingin keluar? Data formulir yang sudah diisi akan hilang.">
      <div className="max-w-2xl mx-auto">

        <div className="flex items-center mb-6">
          {['Data Diri','Alamat','Perekrut','Rekening'].map((l,i) => (
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
                dibuat, gak boleh diubah sendiri lagi (cegah "cuci" identitas
                lewat akun yang udah terverifikasi). Koreksi cuma lewat admin. */}
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
              <div><label className={lbl}>Email</label>
                <div className={`${inp} bg-gray-50 text-gray-400`}>{form.email || '-'}</div></div>
            </div>
            <div><label className={lbl}>Agama</label>
              <div className={`${inp} bg-gray-50 text-gray-400`}>{user?.agama === 'non_islam' ? 'Non-Islam' : user?.agama === 'islam' ? 'Islam' : '-'}</div></div>
            <div className="text-[10px] text-gray-400 -mt-1">NIK, No. WhatsApp, Email, dan Agama adalah data verifikasi awal — cuma bisa dikoreksi lewat admin.</div>
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

            <div className="pt-2 border-t border-gray-100">
              <div className="font-bold text-[#0E2F6E]">🛂 Paspor (opsional)</div>
              <div className="text-[10px] text-gray-400 -mt-0.5 mb-1.5">Kalau udah punya paspor, boleh diisi sekalian — biar gak perlu diminta ulang pas beneran siap berangkat nanti.</div>
              <label className={lbl}>Nomor Paspor</label>
              <input value={form.no_paspor} onChange={e=>setF('no_paspor',e.target.value.toUpperCase())} className={inp}/>
            </div>

            {form.no_paspor.trim() && (<>
              <div><label className={lbl}>Tempat Keluar Paspor</label>
                <input value={form.tempat_keluar_paspor} onChange={e=>setF('tempat_keluar_paspor',e.target.value)} className={inp}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Masa Berlaku Dari</label>
                  <input type="date" value={form.masa_berlaku_paspor_dari} onChange={e=>setF('masa_berlaku_paspor_dari',e.target.value)} className={inp}/></div>
                <div><label className={lbl}>Masa Berlaku Sampai</label>
                  <input type="date" value={form.masa_berlaku_paspor_sampai} onChange={e=>setF('masa_berlaku_paspor_sampai',e.target.value)} className={inp}/></div>
              </div>
              <div>
                <label className={lbl}>Foto/Scan Paspor</label>
                {form.foto_paspor_path ? (
                  <div className="border-2 border-green-200 bg-green-50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-green-700">✅ Foto paspor terunggah</span>
                    <label className="text-xs font-bold text-[#1A4FA0] cursor-pointer">
                      Ganti
                      <input type="file" accept="image/jpeg,image/png" className="hidden"
                        onChange={e=>pilihFotoPaspor(e.target.files?.[0])}/>
                    </label>
                  </div>
                ) : (
                  <label className={`block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer ${uploadingPaspor ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-500 hover:border-[#1A4FA0]'}`}>
                    {uploadingPaspor ? 'Mengunggah...' : '📷 Klik untuk unggah foto paspor (JPG/PNG, maks 3MB)'}
                    <input type="file" accept="image/jpeg,image/png" className="hidden" disabled={uploadingPaspor}
                      onChange={e=>pilihFotoPaspor(e.target.files?.[0])}/>
                  </label>
                )}
              </div>
            </>)}
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
            <div className="font-bold text-[#0E2F6E]">🤝 Perekrut</div>
            <div className="pt-2">
              <label className={lbl}>Siapa yang merekrut Anda?</label>
              {/* Kode referral sudah wajib divalidasi & dikunci sejak
                  pendaftaran akun di /register (dikonfirmasi user
                  2026-09-03) — di sini murni tampilan read-only, gak ada
                  lagi jalur pilih/ganti manual. */}
              <div className="w-full px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-sm text-gray-600">
                {sahabatList.find(k=>String(k.id)===String(profil?.perekrut_id))?.name || '— Tidak ada —'}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Sudah dipilih waktu Anda mendaftar akun, tidak bisa diubah di sini.</div>
            </div>

            <div className="pt-2">
              <div className="font-bold text-[#0E2F6E]">🎯 Target Impian *</div>
              <div className="text-xs text-gray-400 -mt-1 mb-1">Bantu kami hitung progres tabungan Anda menuju keberangkatan.</div>
              <label className={lbl}>Tujuan / Paket Incaran</label>
              <select
                value={form.target_program_id}
                onChange={e => {
                  const prog = programEksklusif.find(p => String(p.id) === e.target.value);
                  setForm(p => ({
                    ...p,
                    target_program_id: e.target.value,
                    target_minat: prog?.name || '',
                    target_estimasi_harga: prog ? String(hargaTermurahProgram(prog)) : '',
                  }));
                }}
                className={inp}
              >
                <option value="">— Pilih Program —</option>
                {programEksklusif.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {programEksklusif.length === 0 && (
                <div className="text-[10px] text-gray-400 mt-1">Belum ada Program Eksklusif Sahabat Baitullah yang tersedia saat ini — hubungi admin.</div>
              )}
              <label className={lbl}>Estimasi Harga (Rp)</label>
              <div className={`${inp} bg-gray-50 text-gray-400`}>
                {form.target_estimasi_harga ? `Rp ${Number(form.target_estimasi_harga).toLocaleString('id-ID')}` : '-'}
              </div>
            </div>
          </>)}

          {step === 4 && (<>
            <div className="font-bold text-[#0E2F6E]">🏦 Rekening Tabungan Umroh (BSI Byond)</div>
            <div>
              <label className={lbl}>Apakah Anda sudah punya rekening Tabungan Umroh BSI Byond?</label>
              <div className="flex gap-2">
                <button type="button" onClick={()=>setPunyaRekening('sudah')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 ${punyaRekening==='sudah' ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200'}`}>
                  Sudah
                </button>
                <button type="button" onClick={()=>setPunyaRekening('belum')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 ${punyaRekening==='belum' ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200'}`}>
                  Belum
                </button>
              </div>
            </div>

            {punyaRekening === 'belum' && (
              <div className="bg-[#E8F0FB] rounded-lg p-3 text-xs text-[#1A4FA0] space-y-2">
                <div>Silakan buka rekening Tabungan Umroh BSI Byond terlebih dahulu lewat aplikasi Byond, lalu isi nomor rekeningnya di bawah.</div>
                <div className="flex gap-2">
                  <a href="https://apps.apple.com/id/app/byond-by-bsi/id6444697752" target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-center bg-white hover:bg-gray-50 text-[#1A4FA0] font-bold py-2 rounded-lg border border-[#1A4FA0]">🍎 iOS</a>
                  <a href="https://play.google.com/store/apps/details?id=co.id.bankbsi.superapp" target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-center bg-white hover:bg-gray-50 text-[#1A4FA0] font-bold py-2 rounded-lg border border-[#1A4FA0]">🤖 Android</a>
                </div>
                {/* Panduan step-by-step admin (opsional, dikonfirmasi user
                    2026-09-20) — 2 file terpisah, cuma muncul kalau admin
                    udah upload lewat /admin/pengaturan/dokumen. */}
                {(pengaturan?.panduan_buka_rekening_bsi_path || pengaturan?.panduan_buka_tabungan_umroh_path) && (
                  <div className="flex gap-2 pt-1">
                    {pengaturan?.panduan_buka_rekening_bsi_path && (
                      <a href={pengaturan.panduan_buka_rekening_bsi_path} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center text-xs font-bold text-[#1A4FA0] underline">📘 Panduan Buka Rekening BSI</a>
                    )}
                    {pengaturan?.panduan_buka_tabungan_umroh_path && (
                      <a href={pengaturan.panduan_buka_tabungan_umroh_path} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center text-xs font-bold text-[#1A4FA0] underline">📘 Panduan Buka Tabungan Umroh</a>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className={lbl}>Nomor Rekening Tabungan Umroh *</label>
              <input value={norekUmroh} onChange={e=>setNorekUmroh(e.target.value)} placeholder="Nomor rekening" className={inp}/>
            </div>
          </>)}

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
              <button onClick={lanjutKePerjanjian} disabled={savingRekening}
                className="flex-[2] bg-[#C9952A] hover:bg-yellow-600 text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-50">
                {savingRekening ? 'Menyimpan...' : 'Lanjut ke Perjanjian (SPK-AK) →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
