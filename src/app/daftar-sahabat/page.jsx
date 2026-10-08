'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser, useMounted } from '@/lib/useCurrentUser';
import { AddressFields, alamatLengkap } from '@/app/components/AddressFields';
import { hargaTermurahProgram } from '@/lib/harga';
import { hariIniWib, keTanggal } from '@/lib/jadwalTarget';
import { PENDIDIKAN_LIST } from '@/lib/pendidikan';
import { hitungUmur } from '@/lib/umur';

const emptyForm = () => ({
  nama:'', nik:'', tempat_lahir:'', tl:'', jk:'Laki-Laki', ibu:'', ayah:'', foto_ktp_path:'',
  jalan:'', norumah:'', rt:'', rw:'', kp:'', kel:'', kec:'', kota:'', provinsi:'', negara:'Indonesia',
  sama_ktp: true,
  jalan_dom:'', norumah_dom:'', rt_dom:'', rw_dom:'', kp_dom:'', kel_dom:'', kec_dom:'', kota_dom:'', provinsi_dom:'', negara_dom:'Indonesia',
  wa:'', email:'', pkj:'', pendidikan:'',
  target_program_id:'',
  // Paspor OPSIONAL (dikonfirmasi user 2026-09-20) — sekalian disimpen dari
  // awal kalau jamaah udah punya, biar gak perlu diminta ulang pas beneran
  // booking berangkat nanti.
  no_paspor:'', tempat_keluar_paspor:'', masa_berlaku_paspor_dari:'', masa_berlaku_paspor_sampai:'', foto_paspor_path:'',
  bank:'', norek:'', pemilik:'',
  perekrut_id:'',
  target_minat:'', target_estimasi_harga:'',
});

// Batas atas date picker Tanggal Lahir — pendaftar wajib minimal 17 tahun
// (dikonfirmasi user 2026-10-08), "max" di <input type=date> nyegah milih
// tanggal yang bikin kurang dari itu, validasi beneran tetap di validStep().
function maksTglLahir17Tahun() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 17);
  return d.toISOString().slice(0, 10);
}

export default function DaftarSahabatPage() {
  const maksTanggalLahir17Tahun = maksTglLahir17Tahun();
  const router = useRouter();
  const [user] = useCurrentUser();
  const mounted = useMounted();
  const [programEksklusif, setProgramEksklusif] = useState([]);
  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    nama: user?.name || '', nik: user?.nik || '', wa: user?.wa || '', email: user?.email || '',
  }));
  const [step, setStep] = useState(1); // 1=data diri, 2=alamat, 3=perekrut+target (TERAKHIR — rekening tabungan umroh BUKAN bagian wizard ini lagi, lihat komentar di lanjutKeStatus)
  const [sudahKirim, setSudahKirim] = useState(false);
  const [uploadingKtp, setUploadingKtp] = useState(false);
  const [uploadingPaspor, setUploadingPaspor] = useState(false);
  const [profil, setProfil] = useState(null);
  const [savingKirim, setSavingKirim] = useState(false);

  const isDirty = step > 1 || !!form.tl || !!form.ibu.trim();
  useUnsavedGuard(isDirty);

  const setF = (k,v) => setForm(p => ({...p, [k]: v}));

  useEffect(() => {
    if (!user) return;
    fetch(`/api/profil?user_id=${user.id}`).then(r => r.json()).then(d => { if (d.user) setProfil(d.user); }).catch(()=>{});
    // Target Impian (step 3) dipilih dari Program Eksklusif yang admin
    // tandai khusus Sahabat Baitullah (publish_type='sahabat_baitullah',
    // dikonfirmasi user 2026-09-20) — bukan lagi teks bebas. /api/programs
    // buat role ini juga ngembaliin publish_type='public' & 'private'
    // whitelist, jadi difilter lagi di sini biar cuma yang eksklusif aja
    // yang muncul di dropdown ini.
    fetch('/api/programs').then(r => r.json()).then(d => {
      // Program yang jadwal keberangkatannya sudah lewat tidak bisa jadi target
      // (catatan SYSTEM UJROH E3) — server juga menolak.
      const hariIni = hariIniWib();
      setProgramEksklusif((d.programs || []).filter(p => p.publish_type === 'sahabat_baitullah'
        && (!keTanggal(p.tanggal_berangkat) || keTanggal(p.tanggal_berangkat) >= hariIni)));
    }).catch(()=>{});
    // Sudah pernah isi data diri? Wizard ini gak ada lagi yang perlu
    // dikerjakan (rekening tabungan umroh BUKAN bagian wizard ini —
    // dikonfirmasi user 2026-09-20, urutan sekarang: data diri -> SPK-AK ->
    // bukti TF -> rekening tabungan umroh -> CIF & blokir, lihat
    // /status-pendaftaran-sahabat) — lompat ke halaman status buat
    // lanjutin step berikutnya.
    fetch('/api/status-pendaftaran-sahabat').then(r => r.json()).then(d => {
      if (d.prasyarat?.data_diri_terkirim) {
        setSudahKirim(true);
        router.push('/status-pendaftaran-sahabat');
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
      if ((hitungUmur(form.tl) ?? 0) < 17) return alert('Pendaftar Sahabat Baitullah wajib minimal berusia 17 tahun!') || false;
      if (!form.ibu.trim()) return alert('Nama ibu kandung wajib diisi!') || false;
      if (!form.ayah.trim()) return alert('Nama ayah kandung wajib diisi!') || false;
      if (!form.wa.trim()) return alert('No. WhatsApp wajib diisi!') || false;
      if (!form.pendidikan) return alert('Pendidikan terakhir wajib diisi!') || false;
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
      // Program yang harga paketnya belum diisi admin bikin target Rp 0 —
      // nanti nominal blokir rekening ikut 0 & jamaah mentok di step blokir.
      if (!(Number(form.target_estimasi_harga) > 0))
        return alert('Harga program ini belum tersedia. Pilih program lain atau hubungi admin JM Travel.') || false;
    }
    return true;
  }

  // Data diri (step 1-3) disimpan lewat POST /api/daftar-sahabat, LALU ke
  // halaman status buat lanjutin sisa funnel (dikonfirmasi user 2026-09-27 —
  // urutan final: data diri -> bukti TF -> SPK-AK -> rekening tabungan umroh
  // -> CIF & blokir -> aktivasi admin, TANPA gate admin di tengah lagi).
  // Bukti TF sengaja didahulukan dari SPK-AK (dibalik dari urutan lama)
  // biar materai gak kebakar duluan buat orang yang ujung-ujungnya gak
  // pernah transfer.
  async function lanjutKeStatus() {
    if (!validStep()) return;
    setSavingKirim(true);
    try {
      if (!sudahKirim) {
        const res = await fetch('/api/daftar-sahabat', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ ...form, perekrut_id: perekrutIdTerkirim })
        });
        const d = await res.json();
        if (!res.ok) { alert(d.error); setSavingKirim(false); return; }
        setSudahKirim(true);
      }
      router.push('/status-pendaftaran-sahabat');
    } catch { alert('Terjadi kesalahan'); }
    setSavingKirim(false);
  }

  if (!mounted || !user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-[#0E2F6E] mb-1";

  return (
    <Layout title="🤝 Pendaftaran Sahabat Baitullah" showBack confirmLeave={isDirty && !sudahKirim}
      confirmMessage="Yakin ingin keluar? Data formulir yang sudah diisi akan hilang.">
      <div className="max-w-2xl mx-auto">

        <div className="flex items-center mb-6">
          {['Data Diri','Alamat','Target Impian'].map((l,i) => (
            <div key={l} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i+1 < step ? 'bg-[#C9952A] text-white' : i+1 === step ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {i+1 < step ? '✓' : i+1}
                </div>
                <div className={`text-[9px] mt-1 ${i+1===step?'text-[#1A4FA0] font-bold':'text-gray-400'}`}>{l}</div>
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i+1<step?'bg-[#C9952A]':'bg-gray-200'}`}></div>}
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
              <div><label className={lbl}>Tanggal Lahir * <span className="text-gray-400 font-normal">(minimal 17 tahun)</span></label>
                <input type="date" max={maksTanggalLahir17Tahun} value={form.tl} onChange={e=>{ if (e.target.value) setF('tl',e.target.value); }} className={inp}/></div>
              <div><label className={lbl}>Jenis Kelamin *</label>
                <select value={form.jk} onChange={e=>setF('jk',e.target.value)} className={inp}>
                  <option>Laki-Laki</option><option>Perempuan</option></select></div>
            </div>
            <div><label className={lbl}>Nama Ibu Kandung *</label>
              <input value={form.ibu} onChange={e=>setF('ibu',e.target.value)} className={inp}/></div>
            <div><label className={lbl}>Nama Ayah Kandung *</label>
              <input value={form.ayah} onChange={e=>setF('ayah',e.target.value)} className={inp}/></div>
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
            <div><label className={lbl}>Pendidikan Terakhir *</label>
              <select value={form.pendidikan} onChange={e=>setF('pendidikan',e.target.value)} className={inp}>
                <option value="">— Pilih —</option>
                {PENDIDIKAN_LIST.map(p => <option key={p} value={p}>{p}</option>)}
              </select></div>

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
            {/* "Siapa yang merekrut Anda" DICABUT dari sini (dikonfirmasi
                user 2026-10-03) — kode/nama perekrut udah dikunci sejak
                registrasi akun, gak perlu ditampilin ulang di step ini. */}
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
                {Number(form.target_estimasi_harga) > 0 ? `Rp ${Number(form.target_estimasi_harga).toLocaleString('id-ID')}` : '-'}
              </div>
              {form.target_program_id && !(Number(form.target_estimasi_harga) > 0) && (
                <div className="text-[10px] text-red-500 mt-1">Harga program ini belum diisi admin — pilih program lain atau hubungi admin JM Travel.</div>
              )}
            </div>
          </>)}

          <div className="flex gap-2 pt-2">
            {step > 1 && (
              <button onClick={()=>setStep(step-1)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-full text-sm">
                ← Kembali
              </button>
            )}
            {step < 3 ? (
              <button onClick={()=>{ if(validStep()) setStep(step+1); }}
                className="flex-[2] bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full text-sm">
                Lanjut →
              </button>
            ) : (
              <button onClick={lanjutKeStatus} disabled={savingKirim}
                className="flex-[2] bg-[#C9952A] hover:bg-yellow-600 text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-50">
                {savingKirim ? 'Menyimpan...' : 'Simpan & Lanjutkan →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
