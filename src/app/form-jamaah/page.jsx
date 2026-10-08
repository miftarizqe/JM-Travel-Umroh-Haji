'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { DOC_LIST, STATUS_DOKUMEN, statusDokumen, parseJamaahData } from '@/lib/dokumenPendukung';
import { HUBUNGAN_KONTAK_DARURAT, WA_MAKS, PASPOR_MAKS, hanyaAngka, bersihkanPaspor, validasiIsianJamaah } from '@/lib/dataJamaah';
import { PENDIDIKAN_LIST } from '@/lib/pendidikan';
import { hitungUmur } from '@/lib/umur';

const draftKey = (bookingId) => `draft_form_jamaah_${bookingId}`;

const emptyJamaah = () => ({
  nama: '', nik: '', paspor: '', tl: '', ttl: '', exp_mulai: '', exp_paspor: '',
  tkp: '', jk: 'Laki-Laki', alamat: '', alamat_kirim: '', wa: '', email: '',
  pkj: '', ayah: '', pendidikan: '', penyakit: '', mahram: '', hub_mahram: 'Suami/Istri',
  kdnama: '', kdwa: '', kdhub: '',
  // Dokumen pendukung — OPSIONAL, gak wajib buat lanjut submit formulir.
  doc_paspor: '', doc_kk: '', doc_ktp: '', doc_vaksin: '', doc_foto: ''
});

// Dokumen pendukung jamaah — semuanya opsional. Daftar + status verifikasi
// admin ada di src/lib/dokumenPendukung.js.

// Ambang 6 bulan — aturan umum imigrasi/maskapai (paspor wajib berlaku
// minimal 6 bulan dari keberangkatan), dipakai sebagai pengingat generik di
// sini (dikonfirmasi user 2026-09-29, berlaku SEMUA jamaah lewat form
// bersama ini, bukan cuma Sahabat Baitullah — form-jamaah memang sudah
// dipakai semua role). Gak menghalangi submit (paspor tetap opsional di
// formulir ini, konsisten sama kebijakan yang sudah ada), cuma pengingat
// visual buat jamaah cek ulang & unggah scan terbaru kalau memang berubah.
const AMBANG_KADALUARSA_HARI = 180;
function statusMasaBerlakuPaspor(expPaspor) {
  if (!expPaspor) return null;
  const sisaHari = Math.floor((new Date(expPaspor) - new Date()) / 86400000);
  if (sisaHari < 0) return 'expired';
  if (sisaHari <= AMBANG_KADALUARSA_HARI) return 'segera';
  return null;
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
  // ?ke=dokumen dari tombol "Unggah Dokumen" di dashboard jamaah — gulir
  // langsung ke bagian Dokumen Pendukung begitu form selesai dimuat (sekali).
  const keDokumen = searchParams.get('ke') === 'dokumen';
  const dokumenRef = useRef(null);
  const sudahGulir = useRef(false);

  const [user] = useCurrentUser();
  const [booking, setBooking] = useState(null);
  const [jamaahList, setJamaahList] = useState([]);
  const [currentJ, setCurrentJ] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // Pilihan dropdown Hubungan kontak darurat — dari endpoint master, fallback
  // ke daftar bawaan yang sama kalau fetch gagal.
  const [hubunganList, setHubunganList] = useState(HUBUNGAN_KONTAK_DARURAT);
  useEffect(() => {
    fetch('/api/master/hubungan-kontak-darurat').then(r => r.json())
      .then(d => { if (Array.isArray(d.hubungan) && d.hubungan.length) setHubunganList(d.hubungan); })
      .catch(() => {});
  }, []);
  const [riwayat, setRiwayat] = useState(null); // { data, sumber } dari /api/form-jamaah/cari-riwayat
  const [riwayatDiabaikan, setRiwayatDiabaikan] = useState(false);
  const [riwayatDipakai, setRiwayatDipakai] = useState(null); // sumber riwayat yang barusan dipakai — pengingat buat cek ulang
  const [uploadingDoc, setUploadingDoc] = useState(null); // key dokumen yang lagi diunggah (buat spinner tombolnya aja)
  // Tautan dokumen yang dilepas (Hapus) atau ditimpa (Ganti) — file fisiknya
  // baru dihapus SETELAH formulir berhasil disimpan (DELETE
  // /api/upload-dokumen-jamaah), biar booking gak pernah nunjuk file yang udah hilang.
  const dokumenDilepas = useRef(new Set());
  // jamaah_data versi server — status verifikasi (doc_status) cuma valid buat
  // path yang SAMA dengan yang tersimpan; upload baru = belum dikirim.
  const [tersimpan, setTersimpan] = useState([]);
  useEffect(() => {
    if (!keDokumen || sudahGulir.current || !dokumenRef.current || jamaahList.length === 0) return;
    sudahGulir.current = true;
    dokumenRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [keDokumen, jamaahList.length]);

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
            // jamaah_data dari API berupa string JSON (kolom LONGTEXT) — wajib
            // di-parse, kalau enggak data lama gak pernah kemuat (form kosong).
            const dataLama = parseJamaahData(found.jamaah_data);
            if (dataLama.length > 0) {
              dataLama.forEach((jd, i) => { if (i < list.length) list[i] = { ...list[i], ...jd }; });
              setTersimpan(dataLama);
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
                  // doc_status di draft bisa basi (admin verifikasi setelah
                  // draft dibuat) — selalu pakai yang dari server.
                  finalList = draft.jamaahList.map((dj, i) => ({ ...dj, doc_status: list[i]?.doc_status }));
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
  // Ayah/Pendidikan pakai ambang beda dari NIK (dikonfirmasi user
  // 2026-10-08: "di bawah 17 tahun" optional, jadi >=17 wajib — bukan >17
  // kayak NIK).
  const wajibAyahPendidikan = umur === null || umur >= 17;
  const statusPaspor = statusMasaBerlakuPaspor(j.exp_paspor);

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
      if (res.ok) {
        const lama = jamaahList[currentJ]?.[docKey];
        if (lama) dokumenDilepas.current.add(lama);
        setField(docKey, d.path);
      }
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
      ['alamat_kirim', 'Alamat Kirim Perlengkapan'],
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

    const errFormat = validasiIsianJamaah(d);
    if (errFormat) { alert(errFormat.replace(/^Jamaah: /, '')); return false; }

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
    // Nama Ayah Kandung & Pendidikan Terakhir — wajib buat Siskopatuh,
    // KECUALI jamaah di bawah 17 tahun (dikonfirmasi user 2026-10-08).
    if (umurJ === null || umurJ >= 17) {
      if (!d.ayah || !String(d.ayah).trim()) {
        alert('Nama Ayah Kandung wajib diisi!'); return false;
      }
      if (!d.pendidikan || !String(d.pendidikan).trim()) {
        alert('Pendidikan Terakhir wajib diisi!'); return false;
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
        // Best-effort: gagal hapus file lama gak boleh ganggu formulir yang
        // udah tersimpan. Server sendiri nolak kalau file masih dipakai booking lain.
        const masihDipakai = new Set(jamaahList.flatMap(x => DOC_LIST.map(dc => x[dc.key]).filter(Boolean)));
        await Promise.allSettled([...dokumenDilepas.current].filter(pth => !masihDipakai.has(pth)).map(pth =>
          fetch('/api/upload-dokumen-jamaah', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: pth }),
          })
        ));
        dokumenDilepas.current.clear();
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
              <input value={j.paspor} maxLength={PASPOR_MAKS} placeholder="Contoh: C1234567" onChange={e => {
                const v = bersihkanPaspor(e.target.value);
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
                  <input type="date" value={j.exp_mulai} onChange={e => { if (e.target.value) setField('exp_mulai', e.target.value); }} className={inp}/>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Tanggal Berakhir</div>
                  <input type="date" value={j.exp_paspor} onChange={e => { if (e.target.value) setField('exp_paspor', e.target.value); }} className={inp}/>
                </div>
              </div>
              {statusPaspor && (
                <div className={`mt-2 rounded-lg p-3 text-xs ${statusPaspor === 'expired' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                  {statusPaspor === 'expired'
                    ? '⚠️ Paspor ini sudah kadaluarsa. Mohon perbarui tanggal di atas dan unggah scan paspor terbaru di bagian Dokumen Pendukung di bawah.'
                    : '⚠️ Paspor ini akan kadaluarsa dalam waktu dekat (kurang dari 6 bulan) — umumnya wajib berlaku minimal 6 bulan dari keberangkatan. Kalau sudah perpanjang, perbarui tanggal di atas dan unggah scan terbaru. Kalau belum ada perubahan, data ini tetap bisa dipakai dulu.'}
                </div>
              )}
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
                  if (!v) return; // input tanggal browser bisa sempat kirim event kosong pas segmen lagi diketik — jangan sampai numpuk hapus NIK/ttl yang sudah keisi (lihat setField di atas)
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

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={lbl} style={{ marginBottom: 0 }}>📦 Alamat Kirim Perlengkapan *</label>
                <button type="button" onClick={() => setField('alamat_kirim', j.alamat)}
                  className="text-[10px] font-bold text-[#1A4FA0] underline whitespace-nowrap">
                  Sama dengan Alamat Domisili
                </button>
              </div>
              <input value={j.alamat_kirim} onChange={e => setField('alamat_kirim', e.target.value)} className={inp}/>
              <div className="text-[10px] text-gray-400 mt-1">Alamat tujuan pengiriman koper, ihrom/mukena, dan perlengkapan lainnya.</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>No. WhatsApp *</label>
                <input value={j.wa} onChange={e => setField('wa', hanyaAngka(e.target.value))}
                  inputMode="numeric" maxLength={WA_MAKS} placeholder="08xxxxxxxxxx" className={inp}/>
              </div>
              <div>
                <label className={lbl}>Email (opsional)</label>
                <input value={j.email} onChange={e => setField('email', e.target.value)} className={inp}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Nama Ayah Kandung {wajibAyahPendidikan ? '*' : <span className="text-gray-400 font-normal">(opsional, jamaah di bawah 17 tahun)</span>}</label>
                <input value={j.ayah} onChange={e => setField('ayah', e.target.value)} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Pendidikan Terakhir {wajibAyahPendidikan ? '*' : <span className="text-gray-400 font-normal">(opsional, jamaah di bawah 17 tahun)</span>}</label>
                <select value={j.pendidikan} onChange={e => setField('pendidikan', e.target.value)} className={inp}>
                  <option value="">— Pilih —</option>
                  {PENDIDIKAN_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
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
                <input value={j.kdwa} onChange={e => setField('kdwa', hanyaAngka(e.target.value))}
                  inputMode="numeric" maxLength={WA_MAKS} placeholder="08xxxxxxxxxx" className={inp}/>
              </div>
            </div>
            <div>
              <label className={lbl}>Hubungan *</label>
              <select value={j.kdhub} onChange={e => setField('kdhub', e.target.value)} className={inp}>
                <option value="">-- Pilih Hubungan --</option>
                {hubunganList.map(h => <option key={h} value={h}>{h}</option>)}
                {/* Isian lama (teks bebas, mis. dari riwayat booking sebelumnya)
                    tetap kelihatan biar jamaah sadar harus pilih ulang. */}
                {j.kdhub && !hubunganList.includes(j.kdhub) && <option value={j.kdhub}>{j.kdhub} (pilih ulang)</option>}
              </select>
            </div>
          </div>

          {/* Dokumen pendukung — OPSIONAL, gak menghalangi submit formulir.
              Boleh juga dikirim belakangan via WA kalau lebih gampang. */}
          <div ref={dokumenRef} className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3 scroll-mt-20">
            <div>
              <div className="font-bold text-[#0E2F6E]">📎 Dokumen Pendukung</div>
              <div className="text-xs text-gray-400 mt-0.5">Opsional — boleh diunggah di sini sekarang, atau dikirim menyusul via WhatsApp admin.</div>
            </div>
            <div className="space-y-2">
              {DOC_LIST.map(doc => {
                const perluUpdatePaspor = doc.key === 'doc_paspor' && statusPaspor;
                return (
                <div key={doc.key} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${perluUpdatePaspor ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-700">{doc.label}</div>
                    {perluUpdatePaspor ? (
                      <div className="text-xs text-yellow-700">⚠️ Perlu diperbarui (masa berlaku hampir/sudah habis)</div>
                    ) : j[doc.key] ? (() => {
                      const belumDikirim = j[doc.key] !== tersimpan[currentJ]?.[doc.key];
                      const st = belumDikirim ? null : statusDokumen(j, doc.key);
                      const info = st && STATUS_DOKUMEN[st.status];
                      return (
                        <div className="space-y-0.5">
                          <a href={j[doc.key]} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1A4FA0] font-semibold hover:underline">Lihat file</a>
                          {belumDikirim ? (
                            <div className="text-[10px] text-gray-500">📤 Baru — terkirim saat klik Kirim Formulir</div>
                          ) : info && (
                            <div><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.cls}`}>{info.ikon} {info.label}</span></div>
                          )}
                          {st?.status === 'ditolak' && st.alasan && (
                            <div className="text-[10px] text-red-600">Alasan: {st.alasan} — silakan Ganti dengan file yang benar.</div>
                          )}
                        </div>
                      );
                    })() : (
                      <div className="text-xs text-gray-400">Belum diunggah</div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <label className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-2 rounded-full cursor-pointer whitespace-nowrap">
                      {uploadingDoc === doc.key ? 'Mengunggah...' : j[doc.key] ? 'Ganti' : 'Unggah'}
                      {/* value dikosongkan tiap klik biar file yang sama bisa dipilih lagi setelah dihapus */}
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploadingDoc === doc.key}
                        onClick={e => { e.target.value = ''; }}
                        onChange={e => uploadDoc(doc.key, doc.jenis, e.target.files?.[0])}/>
                    </label>
                    {/* Hapus = lepas tautan dokumen dari formulir (dikonfirmasi user
                        2026-10-01); file fisiknya dihapus server setelah "Kirim
                        Formulir" berhasil (lihat dokumenDilepas). */}
                    {j[doc.key] && uploadingDoc !== doc.key && (
                      <button type="button"
                        onClick={() => {
                          if (!confirm(`Hapus ${doc.label} dari formulir ini?`)) return;
                          dokumenDilepas.current.add(j[doc.key]);
                          setField(doc.key, '');
                        }}
                        className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-full whitespace-nowrap">
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
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
