'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const draftKey = (bookingId) => `draft_form_jamaah_${bookingId}`;

const emptyJamaah = () => ({
  nama: '', nik: '', paspor: '', tl: '', ttl: '', exp_mulai: '', exp_paspor: '',
  tkp: '', jk: 'Laki-Laki', alamat: '', wa: '', email: '',
  pkj: '', penyakit: '', mahram: '', hub_mahram: 'Suami/Istri',
  kdnama: '', kdwa: '', kdhub: '',
  // Dokumen pendukung — OPSIONAL, gak wajib buat lanjut submit formulir.
  doc_paspor: '', doc_kk: '', doc_ktp: '', doc_vaksin: '', doc_foto: ''
});

// Dokumen pendukung jamaah — semuanya opsional (lihat DOC_TIPE di bawah).
const DOC_LIST = [
  { key: 'doc_paspor', jenis: 'paspor', label: 'Scan Paspor' },
  { key: 'doc_kk', jenis: 'kk', label: 'Kartu Keluarga' },
  { key: 'doc_ktp', jenis: 'ktp', label: 'KTP' },
  { key: 'doc_vaksin', jenis: 'vaksin', label: 'Bukti Vaksin Meningitis & Polio' },
  { key: 'doc_foto', jenis: 'foto', label: 'Pas Foto' },
];

function hitungUmur(tgl) {
  if (!tgl) return null;
  const lahir = new Date(tgl);
  if (isNaN(lahir)) return null;
  const now = new Date();
  let umur = now.getFullYear() - lahir.getFullYear();
  const m = now.getMonth() - lahir.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < lahir.getDate())) umur--;
  return umur;
}

export default function FormJamaahPage() {
  return (
    <Suspense fallback={<Layout title="📋 Formulir Jamaah"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <FormJamaahPageInner />
    </Suspense>
  );
}

function FormJamaahPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  const [user] = useCurrentUser();
  const [booking, setBooking] = useState(null);
  const [jamaahList, setJamaahList] = useState([]);
  const [currentJ, setCurrentJ] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [riwayat, setRiwayat] = useState(null); // { data, sumber } dari /api/form-jamaah/cari-riwayat
  const [riwayatDiabaikan, setRiwayatDiabaikan] = useState(false);
  const [riwayatDipakai, setRiwayatDipakai] = useState(null); // sumber riwayat yang barusan dipakai — pengingat buat cek ulang
  const [uploadingDoc, setUploadingDoc] = useState(null); // key dokumen yang lagi diunggah (buat spinner tombolnya aja)

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain); middleware
    // sudah menjamin route ini butuh sesi valid.
    if (!user) return;

    if (bookingId) {
      fetch(`/api/bookings?booking_id=${bookingId}`)
        .then(r => r.json())
        .then(d => {
          const found = (d.bookings || [])[0];
          if (found) {
            setBooking(found);
            const list = Array.from({ length: found.jumlah_jamaah }, () => emptyJamaah());
            // Kalau yang isi = jamaah pemilik booking, prefill dari akunnya.
            // Kalau perwakilan/admin yang mendaftarkan, mulai kosong.
            const isPemilik = found.user_id === user.id && user.role === 'jamaah';
            if (isPemilik) {
              list[0] = {
                ...list[0],
                nama: user.name || '',
                nik: user.nik || '',
                wa: user.wa || '',
                email: user.email || '',
              };
            }
            // Kalau sudah pernah diisi sebelumnya, muat data lama
            if (Array.isArray(found.jamaah_data) && found.jamaah_data.length > 0) {
              found.jamaah_data.forEach((jd, i) => { if (i < list.length) list[i] = { ...list[i], ...jd }; });
            }

            // Draft otomatis (localStorage) — jaga-jaga kalau sebelumnya
            // keluar sebelum sempat klik "Kirim Semua Formulir", karena
            // data baru benar-benar tersimpan ke server pas submit akhir.
            let finalList = list;
            let finalCurrentJ = 0;
            try {
              const draftRaw = localStorage.getItem(draftKey(bookingId));
              if (draftRaw) {
                const draft = JSON.parse(draftRaw);
                if (draft?.jamaahList?.length === list.length &&
                    confirm('Ditemukan draft formulir yang belum terkirim di perangkat ini. Lanjutkan mengedit draft tersebut?')) {
                  finalList = draft.jamaahList;
                  finalCurrentJ = draft.currentJ || 0;
                } else {
                  localStorage.removeItem(draftKey(bookingId));
                }
              }
            } catch {}

            setJamaahList(finalList);
            setCurrentJ(finalCurrentJ);
          }
        });
    }
  }, [user, bookingId]);

  // Simpan draft ke localStorage tiap ada perubahan — antisipasi keluar
  // sebelum submit akhir (yang baru itu momen data beneran tersimpan).
  useEffect(() => {
    if (!bookingId || jamaahList.length === 0) return;
    try {
      localStorage.setItem(draftKey(bookingId), JSON.stringify({ jamaahList, currentJ }));
    } catch {}
  }, [bookingId, jamaahList, currentJ]);

  const j = jamaahList[currentJ] || emptyJamaah();
  const umur = hitungUmur(j.ttl);
  const nikAktif = umur !== null && umur > 17;

  // Exact-match doang (dipicu pas paspor/NIK selesai diisi) — bukan search
  // bebas, biar gak ada cara ngintip data orang cuma dari coba-coba nomor.
  async function cariRiwayat(field, value) {
    if (!value) return;
    try {
      const qs = field === 'nik' ? `nik=${encodeURIComponent(value)}` : `paspor=${encodeURIComponent(value)}`;
      const res = await fetch(`/api/form-jamaah/cari-riwayat?${qs}`);
      const d = await res.json();
      if (d.found) {
        setRiwayat(d);
        setRiwayatDiabaikan(false);
      }
    } catch {}
  }

  function gunakanRiwayat() {
    if (!riwayat) return;
    setJamaahList(prev => {
      const next = [...prev];
      next[currentJ] = { ...next[currentJ], ...riwayat.data };
      return next;
    });
    // Ganti jadi pengingat yang tetap nempel (bukan langsung ilang) — biar
    // walaupun sudah keisi otomatis, tetap diminta cek ulang field yang
    // gampang berubah (WA, alamat, pekerjaan, penyakit, kontak darurat) sebelum submit.
    setRiwayatDipakai(riwayat.sumber);
    setRiwayat(null);
  }

  function setField(key, val) {
    setJamaahList(prev => {
      const next = [...prev];
      next[currentJ] = { ...next[currentJ], [key]: val };
      if (key === 'ttl') {
        const umr = hitungUmur(val);
        if (umr === null || umr <= 17) next[currentJ].nik = '';
      }
      return next;
    });
  }

  // Upload dokumen pendukung (opsional) — path-nya digabung ke jamaah yang
  // lagi diisi (currentJ), ikut ke-submit bareng field lain pas "Kirim Formulir".
  async function uploadDoc(docKey, jenis, file) {
    if (!file) return;
    setUploadingDoc(docKey);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('jenis', jenis);
      const res = await fetch('/api/upload-dokumen-jamaah', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setField(docKey, d.path);
      else alert(d.error || 'Gagal mengunggah dokumen');
    } catch { alert('Terjadi kesalahan saat mengunggah dokumen'); }
    setUploadingDoc(null);
  }

  function validateCurrent() {
    const d = jamaahList[currentJ];
    // Field WAJIB (KECUALI: penyakit, pekerjaan, email)
    const wajib = [
      ['nama', 'Nama Sesuai Paspor'],
      ['paspor', 'No. Paspor'],
      ['exp_mulai', 'Masa Berlaku Paspor (Tanggal Mulai)'],
      ['exp_paspor', 'Masa Berlaku Paspor (Tanggal Berakhir)'],
      ['tkp', 'Tempat Keluarkan Paspor'],
      ['tl', 'Tempat Lahir'],
      ['ttl', 'Tanggal Lahir'],
      ['jk', 'Jenis Kelamin'],
      ['alamat', 'Alamat Domisili'],
      ['wa', 'No. WhatsApp'],
      ['mahram', 'Nama Mahram'],
      ['hub_mahram', 'Hubungan Mahram'],
      ['kdnama', 'Nama Kontak Darurat'],
      ['kdwa', 'No. WhatsApp Kontak Darurat'],
      ['kdhub', 'Hubungan Kontak Darurat'],
    ];
    for (const [key, label] of wajib) {
      if (!d[key] || !String(d[key]).trim()) {
        alert(`${label} wajib diisi!`); return false;
      }
    }

    // Masa berlaku paspor: berakhir harus setelah mulai
    if (new Date(d.exp_paspor) <= new Date(d.exp_mulai)) {
      alert('Tanggal berakhir paspor harus setelah tanggal mulai!');
      return false;
    }

    const umurJ = hitungUmur(d.ttl);
    if (umurJ !== null && umurJ > 17) {
      if (!d.nik || !String(d.nik).trim()) {
        alert('No. KTP (NIK) wajib diisi untuk jamaah usia di atas 17 tahun!');
        return false;
      }
      if (!/^\d{16}$/.test(String(d.nik).trim())) {
        alert('No. KTP (NIK) harus 16 digit angka!');
        return false;
      }
    }

    for (let i = 0; i < jamaahList.length; i++) {
      if (i === currentJ) continue;
      const o = jamaahList[i];
      if (d.nik && o.nik && d.nik.trim() === o.nik.trim()) {
        alert(`No. KTP sama dengan Jamaah ${i + 1}. Setiap jamaah harus punya KTP berbeda.`); return false;
      }
      if (d.paspor && o.paspor && d.paspor.trim().toLowerCase() === o.paspor.trim().toLowerCase()) {
        alert(`No. Paspor sama dengan Jamaah ${i + 1}. Setiap jamaah harus punya paspor berbeda.`); return false;
      }
      if (d.wa && o.wa && d.wa.trim() === o.wa.trim()) {
        alert(`No. WhatsApp sama dengan Jamaah ${i + 1}. Gunakan nomor berbeda.`); return false;
      }
    }

    return true;
  }

  // Banner "data sebelumnya" direset tiap pindah jamaah — jangan sampai data
  // orang lain nyangkut buat jamaah lain di booking yang sama.
  function pindahJamaah(next) {
    setCurrentJ(next);
    setRiwayat(null);
    setRiwayatDiabaikan(false);
    setRiwayatDipakai(null);
  }

  function nextJamaah() {
    if (!validateCurrent()) return;
    if (currentJ < jamaahList.length - 1) pindahJamaah(currentJ + 1);
  }

  function prevJamaah() {
    if (currentJ > 0) pindahJamaah(currentJ - 1);
    else router.back();
  }

  async function submitForm() {
    if (!validateCurrent()) return;
    if (!agreed) { alert('Centang persetujuan terlebih dahulu!'); return; }
    setLoading(true);

    // Sumber info & referral SUDAH dicatat saat booking dibuat
    // (checkout / order-jamaah) — tidak ditanya ulang atau dikirim di sini,
    // supaya PATCH ini tidak menimpanya.
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_filled: jamaahList.length,
          jamaah_data: jamaahList,
        })
      });
      if (res.ok) {
        try { localStorage.removeItem(draftKey(bookingId)); } catch {}
        alert('Formulir jamaah berhasil dikirim!');
        const tujuan = {
          admin: '/admin',
          perwakilan: '/dashboard/perwakilan',
          jamaah: '/dashboard/jamaah',
        };
        router.push(tujuan[user?.role] || '/dashboard/jamaah');
      } else {
        alert('Gagal menyimpan formulir');
      }
    } catch (e) {
      alert('Terjadi kesalahan');
    }
    setLoading(false);
  }

  const sumberLabel = {
    instagram: 'Instagram (Live / Konten)', tiktok: 'TikTok (Live / Konten)',
    perwakilan: 'Perwakilan JM Travel',
    teman: 'Rekomendasi Teman / Keluarga', website: 'Website JM Travel',
    langsung_kantor: 'Langsung ke Kantor', lainnya: 'Lainnya',
  }[booking?.sumber_info] || booking?.sumber_info;

  if (!user || !booking) return (
    <Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat data booking...</div></Layout>
  );

  const isFirst = currentJ === 0;
  const isLast = currentJ === jamaahList.length - 1;

  const inp = "w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-sm font-semibold text-[#0E2F6E] mb-1.5";

  return (
    <Layout title="📋 Formulir Jamaah">
      <div className="max-w-2xl mx-auto">

        <div className="bg-[#E8F0FB] rounded-xl p-4 mb-6 text-sm">
          <div className="font-bold text-[#0E2F6E]">{booking.id} · {booking.prog_name}</div>
          <div className="text-gray-500 mt-0.5">{booking.paket} · {booking.kamar} · {booking.jumlah_jamaah} jamaah</div>
          {Array.isArray(booking.opsi_tambahan_data) && booking.opsi_tambahan_data.length > 0 && (
            <div className="text-xs text-[#1A4FA0] mt-1">
              🧳 Opsi Tambahan: {booking.opsi_tambahan_data.map(o => o.nama).join(', ')} (+Rp {Number(booking.opsi_tambahan_total || 0).toLocaleString('id-ID')})
            </div>
          )}
          <div className="text-gray-500 mt-1">Total Harga: <span className="font-bold text-[#0E2F6E]">Rp {Number(booking.total_harga || 0).toLocaleString('id-ID')}</span></div>
        </div>

        {jamaahList.length > 1 && (
          <div className="flex items-center mb-6 overflow-x-auto pb-1">
            {jamaahList.map((_, i) => (
              <div key={i} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < currentJ ? 'bg-[#C9952A] text-white' :
                    i === currentJ ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-400'
                  }`}>{i < currentJ ? '✓' : i + 1}</div>
                  <div className={`text-[10px] mt-1 ${i === currentJ ? 'text-[#1A4FA0] font-semibold' : 'text-gray-400'}`}>Jamaah {i + 1}</div>
                </div>
                {i < jamaahList.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 mb-3 ${i < currentJ ? 'bg-[#C9952A]' : 'bg-gray-200'}`}></div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4">

          {isFirst && booking.sumber_info && (
            <div className="bg-[#E8F0FB] rounded-xl p-4 text-xs text-[#1A4FA0]">
              📣 Sumber info sudah tercatat saat booking: <span className="font-bold">{sumberLabel}</span>
              {booking.referral_kode ? ` (${booking.referral_kode})` : ''}
            </div>
          )}

          {riwayat && !riwayatDiabaikan && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-yellow-800">📋 Data sebelumnya ditemukan</div>
                <div className="text-yellow-700 text-xs mt-1">
                  {riwayat.data.nama || 'Jamaah ini'} pernah isi formulir di booking {riwayat.sumber.booking_id} ({riwayat.sumber.prog_name}). Pakai data itu supaya tidak perlu ketik ulang? Yang berubah (WA, alamat, dll) bisa langsung diedit setelah dipakai.
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={gunakanRiwayat} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap">Gunakan</button>
                <button onClick={() => setRiwayatDiabaikan(true)} className="bg-white border border-gray-300 text-gray-500 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap">Abaikan</button>
              </div>
            </div>
          )}

          {/* Tetap nempel walau udah diisi otomatis — jangan sampai langsung
              disubmit tanpa dicek, krn WA/alamat/pekerjaan/penyakit/kontak
              darurat itu jenis data yang gampang berubah antar keberangkatan. */}
          {riwayatDipakai && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-blue-800">✅ Data lama sudah diisi otomatis</div>
                <div className="text-blue-700 text-xs mt-1">
                  Dari booking {riwayatDipakai.booking_id} ({riwayatDipakai.prog_name}). Tolong cek ulang dulu sebelum lanjut — terutama <b>WA, alamat, pekerjaan, riwayat penyakit,</b> dan <b>kontak darurat</b>, siapa tahu ada yang sudah berubah.
                </div>
              </div>
              <button onClick={() => setRiwayatDipakai(null)} className="bg-white border border-blue-300 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0">Sudah dicek</button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">
            <div className="font-bold text-[#0E2F6E]">👤 Data Pribadi — Jamaah {currentJ + 1}</div>

            <div>
              <label className={lbl}>Nama Sesuai Paspor *</label>
              <input value={j.nama} onChange={e => setField('nama', e.target.value)} className={inp}/>
            </div>

            <div>
              <label className={lbl}>No. Paspor *</label>
              <input value={j.paspor} onChange={e => {
                const v = e.target.value;
                setField('paspor', v);
                // NIK tetap yang utama — paspor cuma dipakai buat cari riwayat
                // kalau sudah pasti gak ada NIK (usia <=17 th, blm punya KTP).
                // Kalau orangnya dewasa, tunggu NIK-nya diisi (lihat field NIK).
                if (umur !== null && umur <= 17 && v.trim().length >= 6) cariRiwayat('paspor', v.trim());
              }} className={inp}/>
            </div>

            <div>
              <label className={lbl}>Masa Berlaku Paspor *</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Tanggal Mulai</div>
                  <input type="date" value={j.exp_mulai} onChange={e => setField('exp_mulai', e.target.value)} className={inp}/>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Tanggal Berakhir</div>
                  <input type="date" value={j.exp_paspor} onChange={e => setField('exp_paspor', e.target.value)} className={inp}/>
                </div>
              </div>
            </div>

            <div>
              <label className={lbl}>Tempat Keluarkan Paspor *</label>
              <input value={j.tkp} onChange={e => setField('tkp', e.target.value)} className={inp}/>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Tempat Lahir *</label>
                <input value={j.tl} onChange={e => setField('tl', e.target.value)} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Tanggal Lahir *</label>
                <input type="date" value={j.ttl} onChange={e => {
                  const v = e.target.value;
                  setField('ttl', v);
                  // Paspor biasanya sudah diisi duluan (field-nya di atas) —
                  // begitu ketahuan umurnya <=17 th (gak bakal punya NIK),
                  // langsung cocokkan paspornya yang udah ada ke riwayat.
                  const umr = hitungUmur(v);
                  if (umr !== null && umr <= 17 && j.paspor && j.paspor.trim().length >= 6) {
                    cariRiwayat('paspor', j.paspor.trim());
                  }
                }} className={inp}/>
              </div>
            </div>

            <div>
              <label className={lbl}>No. KTP (NIK) {nikAktif ? '*' : ''}</label>
              <input
                value={j.nik}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '');
                  setField('nik', v);
                  if (v.length === 16) cariRiwayat('nik', v);
                }}
                disabled={!nikAktif}
                maxLength={16}
                inputMode="numeric"
                placeholder={nikAktif ? '16 digit sesuai KTP' : 'Isi tanggal lahir dulu (aktif jika usia > 17 th)'}
                className={`w-full px-4 py-3 rounded-xl border-2 text-sm focus:outline-none transition-colors ${
                  nikAktif ? 'border-gray-200 focus:border-[#1A4FA0]' : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                }`}/>
              {umur !== null && (
                <div className={`text-xs mt-1 ${nikAktif ? 'text-green-600' : 'text-gray-400'}`}>
                  {nikAktif
                    ? `✅ Usia ${umur} tahun — KTP wajib diisi`
                    : `ℹ️ Usia ${umur} tahun — KTP tidak diperlukan (di bawah/sama dengan 17 th)`}
                </div>
              )}
            </div>

            <div>
              <label className={lbl}>Jenis Kelamin *</label>
              <select value={j.jk} onChange={e => setField('jk', e.target.value)} className={inp}>
                <option>Laki-Laki</option>
                <option>Perempuan</option>
              </select>
            </div>

            <div>
              <label className={lbl}>Alamat Domisili *</label>
              <input value={j.alamat} onChange={e => setField('alamat', e.target.value)} className={inp}/>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>No. WhatsApp *</label>
                <input value={j.wa} onChange={e => setField('wa', e.target.value)} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Email (opsional)</label>
                <input value={j.email} onChange={e => setField('email', e.target.value)} className={inp}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Pekerjaan (opsional)</label>
                <input value={j.pkj} onChange={e => setField('pkj', e.target.value)} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Riwayat Penyakit (opsional)</label>
                <input value={j.penyakit} onChange={e => setField('penyakit', e.target.value)} className={inp}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Nama Mahram *</label>
                <input value={j.mahram} onChange={e => setField('mahram', e.target.value)} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Hubungan Mahram *</label>
                <select value={j.hub_mahram} onChange={e => setField('hub_mahram', e.target.value)} className={inp}>
                  <option>Orang Tua</option>
                  <option>Anak</option>
                  <option>Suami/Istri</option>
                  <option>Saudara Kandung</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">
            <div className="font-bold text-[#0E2F6E]">🆘 Kontak Darurat</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Nama *</label>
                <input value={j.kdnama} onChange={e => setField('kdnama', e.target.value)} className={inp}/>
              </div>
              <div>
                <label className={lbl}>No. WA *</label>
                <input value={j.kdwa} onChange={e => setField('kdwa', e.target.value)} className={inp}/>
              </div>
            </div>
            <div>
              <label className={lbl}>Hubungan *</label>
              <input value={j.kdhub} onChange={e => setField('kdhub', e.target.value)} className={inp}/>
            </div>
          </div>

          {/* Dokumen pendukung — OPSIONAL, gak menghalangi submit formulir.
              Boleh juga dikirim belakangan via WA kalau lebih gampang. */}
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">
            <div>
              <div className="font-bold text-[#0E2F6E]">📎 Dokumen Pendukung</div>
              <div className="text-xs text-gray-400 mt-0.5">Opsional — boleh diunggah di sini sekarang, atau dikirim menyusul via WhatsApp admin.</div>
            </div>
            <div className="space-y-2">
              {DOC_LIST.map(doc => (
                <div key={doc.key} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-700">{doc.label}</div>
                    {j[doc.key] ? (
                      <a href={j[doc.key]} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 font-semibold hover:underline">✅ Terunggah — lihat file</a>
                    ) : (
                      <div className="text-xs text-gray-400">Belum diunggah</div>
                    )}
                  </div>
                  <label className="shrink-0 text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-2 rounded-full cursor-pointer whitespace-nowrap">
                    {uploadingDoc === doc.key ? 'Mengunggah...' : j[doc.key] ? 'Ganti' : 'Unggah'}
                    <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploadingDoc === doc.key}
                      onChange={e => uploadDoc(doc.key, doc.jenis, e.target.files?.[0])}/>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {isLast && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#1A4FA0] flex-shrink-0"/>
              <span className="text-sm text-gray-500 leading-relaxed">
                Saya menyatakan bahwa data yang saya isi adalah benar dan saya menyetujui seluruh peraturan yang berlaku dari JM Travel.
              </span>
            </label>
          )}

          <div className="flex gap-3">
            <button onClick={prevJamaah}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
              ← {currentJ > 0 ? 'Jamaah ' + currentJ : 'Kembali'}
            </button>
            {isLast ? (
              <button onClick={submitForm} disabled={loading}
                className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-50">
                {loading ? 'Menyimpan...' : '📤 Kirim Semua Formulir'}
              </button>
            ) : (
              <button onClick={nextJamaah}
                className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors">
                Jamaah {currentJ + 2} →
              </button>
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
}
