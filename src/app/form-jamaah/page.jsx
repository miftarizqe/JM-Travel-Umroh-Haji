'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import InputTanggal from '@/app/components/InputTanggal';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import { DOC_LIST, STATUS_DOKUMEN, statusDokumen, parseJamaahData } from '@/lib/dokumenPendukung';
import { HUBUNGAN_KONTAK_DARURAT, WA_MAKS, PASPOR_MAKS, hanyaAngka, bersihkanPaspor, bersihkanTempat, validasiIsianJamaah } from '@/lib/dataJamaah';
import { PENDIDIKAN_LIST } from '@/lib/pendidikan';
import { hitungUmur } from '@/lib/umur';

const draftKey = (bookingId) => `draft_form_jamaah_${bookingId}`;

const emptyJamaah = () => ({
  nama: '', nik: '', paspor: '', tl: '', ttl: '', exp_mulai: '', exp_paspor: '',
  tkp: '', jk: '', alamat: '', alamat_kirim: '', wa: '', email: '',
  pkj: '', ayah: '', ibu: '', pendidikan: '', penyakit: '', mahram: '', hub_mahram: 'Suami/Istri',
  wali_nama: '', wali_hub: '',
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

// Batas atas Tanggal Lahir buat yang wajib minimal 17 tahun — pola sama
// maksTglLahir17Tahun di /daftar-sahabat.
function maksTglLahir17Tahun() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 17);
  return d.toISOString().slice(0, 10);
}

// Kolom DATE dari /api/profil keserialisasi mysql2 jadi ISO UTC — tgl lahir
// 23 Jan (WIB, zona DB) datang sebagai "2007-01-22T17:00:00.000Z", jadi
// slice(0,10) mundur sehari. Geser ke WIB dulu (pola sama hariIniWib di
// src/lib/jadwalTarget.js) biar gak tergantung zona waktu browser.
function keTanggalInput(v) {
  if (!v) return '';
  const s = String(v);
  if (!s.includes('T')) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Isi field jamaah dari data pendaftaran Sahabat (users, via /api/profil) —
// cuma field yang MASIH KOSONG, isian yang udah ada tetap menang.
function isiDariProfil(j, p) {
  const kosong = (v) => !v || !String(v).trim();
  const isi = (val, dariProfil) => (kosong(val) ? (dariProfil || '') : val);
  const alamatProfil = p.alamat_domisili || p.alamat || '';
  return {
    ...j,
    nama: isi(j.nama, p.name),
    nik: isi(j.nik, p.nik),
    wa: isi(j.wa, p.wa),
    email: isi(j.email, p.email),
    tl: isi(j.tl, p.tempat_lahir),
    ttl: isi(j.ttl, keTanggalInput(p.tanggal_lahir)),
    jk: p.jenis_kelamin || j.jk,
    ayah: isi(j.ayah, p.nama_ayah),
    ibu: isi(j.ibu, p.nama_ibu),
    pendidikan: isi(j.pendidikan, p.pendidikan_terakhir),
    pkj: isi(j.pkj, p.pekerjaan),
    paspor: isi(j.paspor, p.no_paspor),
    tkp: isi(j.tkp, p.tempat_keluar_paspor),
    exp_mulai: isi(j.exp_mulai, keTanggalInput(p.masa_berlaku_paspor_dari)),
    exp_paspor: isi(j.exp_paspor, keTanggalInput(p.masa_berlaku_paspor_sampai)),
    alamat: isi(j.alamat, alamatProfil),
    alamat_kirim: isi(j.alamat_kirim, alamatProfil),
    // Scan KTP yang diunggah pas /daftar-sahabat (users.foto_ktp_path,
    // /api/dokumen/ktp/...) dipakai ulang buat dokumen KTP jamaah diri
    // sendiri (dikonfirmasi user 2026-10-19). Aman ditautkan: DELETE
    // /api/upload-dokumen-jamaah cuma mau hapus file di dokumen-jamaah/,
    // jadi Hapus/Ganti di formulir gak pernah ngehapus file pendaftaran.
    doc_ktp: isi(j.doc_ktp, p.foto_ktp_path),
  };
}

// Jamaah #1 yang dicentang "Ini saya sendiri" pas checkout -> field yang
// ASALNYA dari profil akun dikunci di formulir (dikonfirmasi user
// 2026-10-19) -- datanya punya akun, koreksinya lewat Profil, bukan diketik
// ulang beda di tiap booking. Cuma field yang di profilnya BENERAN keisi
// yang dikunci; yang kosong tetap bisa diisi manual di sini.
function nilaiKunciProfil(p) {
  const semua = {
    nama: p.name, nik: p.nik, jk: p.jenis_kelamin,
    tl: p.tempat_lahir, ttl: keTanggalInput(p.tanggal_lahir),
    wa: p.wa, email: p.email, alamat: p.alamat_domisili,
  };
  return Object.fromEntries(Object.entries(semua).filter(([, v]) => v && String(v).trim()));
}

export default function FormJamaahPage() {
  return (
    <Suspense fallback={<Layout title="📋 Formulir Jamaah" showBack><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
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
  const [pengaturan] = usePengaturan();
  const [booking, setBooking] = useState(null);
  // { field: true } -- field jamaah #1 yang dikunci krn asalnya dari profil
  // (lihat nilaiKunciProfil).
  const [kunciProfil, setKunciProfil] = useState({});
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
  // Isian yang gagal validasi pas Lanjut/Kirim — { key: pesan }, ditandai
  // merah langsung di field-nya (dikonfirmasi user 2026-10-15), bukan cuma
  // alert satu-satu yang hilang begitu ditutup.
  const [errors, setErrors] = useState({});
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
    if (!user || !bookingId) return;
    // Effect ini bisa jalan ulang (user ke-refresh dari cek sesi, StrictMode
    // dev) — hasil fetch yang udah basi dibuang biar gak nimpa list yang
    // lebih baru / munculin prompt draft palsu di kunjungan pertama.
    let batal = false;

    (async () => {
      const d = await fetch(`/api/bookings?booking_id=${bookingId}`).then(r => r.json()).catch(() => ({}));
      const found = (d.bookings || [])[0];
      if (batal || !found) return;

      const list = Array.from({ length: found.jumlah_jamaah }, () => emptyJamaah());
      // Kalau yang isi = jamaah pemilik booking, prefill dari akunnya.
      // Kalau perwakilan/admin yang mendaftarkan, mulai kosong.
      // Sahabat Baitullah checkout mandiri IKUT (dikonfirmasi user
      // 2026-10-11) — Muslim SELALU checkout buat diri sendiri
      // (dikunci server, lihat checkout-mandiri/route.js), jadi nama/
      // nik/wa/email yang keisi di akunnya emang data jamaah ini
      // juga. Non-Muslim DIKECUALIKAN -- mereka checkout buat ORANG
      // LAIN (gak bisa umroh sendiri), data akun BUKAN data jamaah.
      //
      // Sahabat checkout program REGULER bisa buat diri sendiri ATAU
      // orang lain (dikonfirmasi user 2026-10-12) — prefill dari akun
      // CUMA kalau jamaah #1 ditandai untuk_diri_sendiri pas checkout
      // (opsi "Diri Sendiri"), biar data akun gak kebawa ke formulir
      // orang lain. Checkout mandiri program eksklusif akun Muslim
      // tetap selalu diri sendiri.
      const dataLama = parseJamaahData(found.jamaah_data);
      // Checkbox "Ini saya sendiri" di checkout berlaku SEMUA role
      // (dikonfirmasi user 2026-10-16), bukan cuma Sahabat.
      const diriSendiri = found.user_id === user.id && dataLama[0]?.untuk_diri_sendiri === true;
      const isSahabatDiriSendiri = user.role === 'sahabat_baitullah' && (
        dataLama[0]?.untuk_diri_sendiri === true
        || (found.prog_publish_type === 'sahabat_baitullah' && user.agama !== 'non_islam')
      );
      const isPemilik = found.user_id === user.id && (user.role === 'jamaah' || isSahabatDiriSendiri || diriSendiri);

      // Prefill TAMBAHAN khusus Sahabat Baitullah diri sendiri (dikonfirmasi
      // user 2026-10-11 & 2026-10-15) — tempat/tanggal lahir, ortu,
      // pendidikan, pekerjaan, alamat & detail paspor udah pernah diisi SEKALI
      // pas /daftar-sahabat (ke-sync ke users), gak perlu diketik ulang.
      // Diambil BARENG booking (bukan effect terpisah yang nyusul) biar gak
      // balapan sama pembentukan list/draft di bawah — dulu bisa ketimpa
      // list kosong begitu effect ini jalan ulang.
      let profil = null;
      if (isPemilik && (user.role === 'sahabat_baitullah' || diriSendiri)) {
        const p = await fetch(`/api/profil?user_id=${user.id}`).then(r => r.json()).catch(() => ({}));
        if (batal) return;
        profil = p.user || null;
      }

      if (isPemilik) {
        list[0] = {
          ...list[0],
          nama: profil?.name || user.name || '',
          nik: profil?.nik || user.nik || '',
          wa: profil?.wa || user.wa || '',
          email: profil?.email || user.email || '',
        };
      }
      // Kalau sudah pernah diisi sebelumnya, muat data lama
      // jamaah_data dari API berupa string JSON (kolom LONGTEXT) — wajib
      // di-parse, kalau enggak data lama gak pernah kemuat (form kosong).
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

      // Data pendaftaran Sahabat cuma ngisi field yang MASIH KOSONG — isian
      // lama (jamaah_data/draft) tetap menang, gak ketimpa.
      if (profil) finalList = [isiDariProfil(finalList[0], profil), ...finalList.slice(1)];
      // Field profil yang dikunci DIPAKSA sama persis nilai profil (bukan
      // cuma ngisi yang kosong) -- draft/jamaah_data lama yang beda gak boleh
      // nyangkut di field yang gak bisa diedit.
      let kunci = {};
      if (diriSendiri && profil) {
        const nilai = nilaiKunciProfil(profil);
        finalList = [{ ...finalList[0], ...nilai }, ...finalList.slice(1)];
        kunci = Object.fromEntries(Object.keys(nilai).map(k => [k, true]));
      }
      setKunciProfil(kunci);

      setBooking(found);
      setJamaahList(finalList);
      setCurrentJ(finalCurrentJ);
    })();

    return () => { batal = true; };
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
  // Program impian (eksklusif Sahabat Baitullah) yang diisi buat DIRI
  // SENDIRI wajib minimal 17 tahun — sama syarat daftar Sahabat-nya
  // (dikonfirmasi user 2026-10-15). Non-Muslim yang daftarin orang lain
  // (untuk_diri_sendiri gak ada) TETAP boleh anak, lihat tanpa_nik di
  // /api/sahabat/checkout-mandiri.
  const wajib17Tahun = booking?.prog_publish_type === 'sahabat_baitullah' && j.untuk_diri_sendiri === true;
  const maksTglLahir = wajib17Tahun ? maksTglLahir17Tahun() : undefined;

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
      const data = { ...riwayat.data };
      if (currentJ === 0) for (const k of Object.keys(kunciProfil)) delete data[k];
      next[currentJ] = { ...next[currentJ], ...data };
      return next;
    });
    // Ganti jadi pengingat yang tetap nempel (bukan langsung ilang) — biar
    // walaupun sudah keisi otomatis, tetap diminta cek ulang field yang
    // gampang berubah (WA, alamat, pekerjaan, penyakit, kontak darurat) sebelum submit.
    setRiwayatDipakai(riwayat.sumber);
    setRiwayat(null);
  }

  function setField(key, val) {
    setErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
    const e = {};
    const kosong = (v) => !v || !String(v).trim();
    const tandai = (key, pesan) => { if (!e[key]) e[key] = pesan; };

    // Field WAJIB (KECUALI: penyakit, pekerjaan, email)
    const wajib = [
      ['nama', 'Nama Sesuai Paspor'],
      ['paspor', 'No. Paspor'],
      ['exp_mulai', 'Tanggal Mulai'],
      ['exp_paspor', 'Tanggal Berakhir'],
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
      if (kosong(d[key])) tandai(key, `${label} wajib diisi`);
    }

    // Masa berlaku paspor: berakhir harus setelah mulai
    if (d.exp_mulai && d.exp_paspor && new Date(d.exp_paspor) <= new Date(d.exp_mulai)) {
      tandai('exp_paspor', 'Tanggal berakhir harus setelah tanggal mulai');
    }

    // Format per field — validasiIsianJamaah cuma ngecek field yang ada,
    // jadi dipanggil per field biar tahu field mana yang salah.
    for (const key of ['paspor', 'tkp', 'wa', 'kdwa', 'kdhub']) {
      if (kosong(d[key])) continue;
      const err = validasiIsianJamaah({ [key]: d[key] });
      if (err) tandai(key, err.replace(/^Jamaah: /, '').replace(/\.$/, ''));
    }

    const umurJ = hitungUmur(d.ttl);
    if (d.ttl && booking?.prog_publish_type === 'sahabat_baitullah' && d.untuk_diri_sendiri === true && (umurJ ?? 0) < 17) {
      tandai('ttl', 'Peserta Program Sahabat Baitullah wajib minimal berusia 17 tahun');
    }
    if (umurJ !== null && umurJ > 17) {
      if (kosong(d.nik)) tandai('nik', 'No. KTP (NIK) wajib diisi untuk jamaah usia di atas 17 tahun');
      else if (!/^\d{16}$/.test(String(d.nik).trim())) tandai('nik', 'No. KTP (NIK) harus 16 digit angka');
    }
    // Nama Ayah/Ibu Kandung & Pendidikan Terakhir — wajib buat Siskopatuh,
    // KECUALI jamaah di bawah 17 tahun (dikonfirmasi user 2026-10-08, Nama
    // Ibu Kandung nyusul ditambahin 2026-10-13 -- sebelumnya kelewat, cuma
    // Ayah yang kebawa walau sama-sama dibutuhin Siskopatuh).
    if (umurJ === null || umurJ >= 17) {
      if (kosong(d.ayah)) tandai('ayah', 'Nama Ayah Kandung wajib diisi');
      if (kosong(d.ibu)) tandai('ibu', 'Nama Ibu Kandung wajib diisi');
      if (kosong(d.pendidikan)) tandai('pendidikan', 'Pendidikan Terakhir wajib diisi');
    }
    // Wali/Penanggung Jawab — WAJIB buat jamaah DI BAWAH 17 tahun
    // (dikonfirmasi user 2026-10-13): anak/infant gak ikut tanda tangan
    // Perjanjian Jamaah sendiri, nama wali inilah yang dicetak sebagai
    // penanda tangan mewakili dia di /admin/cetak-perjanjian.
    if (umurJ !== null && umurJ < 17) {
      if (kosong(d.wali_nama)) tandai('wali_nama', 'Nama Wali/Penanggung Jawab wajib diisi');
      if (kosong(d.wali_hub)) tandai('wali_hub', 'Hubungan Wali wajib diisi');
    }

    for (let i = 0; i < jamaahList.length; i++) {
      if (i === currentJ) continue;
      const o = jamaahList[i];
      if (d.nik && o.nik && d.nik.trim() === o.nik.trim()) {
        tandai('nik', `No. KTP sama dengan Jamaah ${i + 1} — setiap jamaah harus punya KTP berbeda`);
      }
      if (d.paspor && o.paspor && d.paspor.trim().toLowerCase() === o.paspor.trim().toLowerCase()) {
        tandai('paspor', `No. Paspor sama dengan Jamaah ${i + 1} — setiap jamaah harus punya paspor berbeda`);
      }
      if (d.wa && o.wa && d.wa.trim() === o.wa.trim()) {
        tandai('wa', `No. WhatsApp sama dengan Jamaah ${i + 1} — gunakan nomor berbeda`);
      }
    }

    setErrors(e);
    if (Object.keys(e).length === 0) return true;
    // Gulir ke field merah PERTAMA (urutan tampil di layar, bukan urutan
    // pengecekan di atas) biar langsung keliatan.
    requestAnimationFrame(() => {
      const el = [...document.querySelectorAll('[data-field]')].find(x => e[x.dataset.field]);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector('input:not([disabled]), select')?.focus({ preventScroll: true });
    });
    return false;
  }

  // Banner "data sebelumnya" direset tiap pindah jamaah — jangan sampai data
  // orang lain nyangkut buat jamaah lain di booking yang sama.
  function pindahJamaah(next) {
    setCurrentJ(next);
    setErrors({});
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

  // Lunas -> formulir cuma bisa dilihat (dikonfirmasi user 2026-10-12),
  // admin tetap bisa koreksi. TAPI cuma kalau formulirnya emang UDAH
  // LENGKAP duluan -- booking yang lunas lewat jalur Invoice-paid-override
  // admin (gak lewat gerbang form) sebelum formulir sempat diisi TETAP
  // boleh diisi jamaah (ditemukan user 2026-10-14, "dia gabisa ubah apa2
  // lagi" — sebelumnya terkunci unconditional cuma dari pelunasan_status,
  // gak ngecek form udah lengkap apa belum). Server SAMA PERSIS kondisinya
  // (PATCH /api/bookings/[id]) — jangan hitung ulang beda logic.
  const formSudahLengkap = (booking.form_filled || 0) >= (booking.form_total || 0);
  const terkunci = booking.pelunasan_status === 'paid' && formSudahLengkap && !['admin', 'super_admin'].includes(user.role);

  const isFirst = currentJ === 0;
  const isLast = currentJ === jamaahList.length - 1;

  const inp = "w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-sm font-semibold text-[#0E2F6E] mb-1.5";
  const inpErr = "w-full px-4 py-3 rounded-xl border-2 border-red-400 bg-red-50 focus:border-red-500 focus:outline-none text-sm";
  const c = (key) => (errors[key] ? inpErr : inp);
  const inpKunci = "w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none text-sm";
  const dikunci = (key) => currentJ === 0 && !!kunciProfil[key];
  const ck = (key) => (dikunci(key) ? inpKunci : c(key));
  const err = (key) => errors[key] && <div className="text-xs text-red-500 mt-1">⚠ {errors[key]}</div>;
  const jumlahError = Object.keys(errors).length;

  return (
    <Layout title="📋 Formulir Jamaah" showBack>
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

        {terkunci && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700">
            🔒 Booking sudah <b>lunas</b> — data jamaah & dokumen hanya bisa dilihat, tidak bisa diubah lagi. Hubungi admin JM Travel jika ada yang perlu dikoreksi.
          </div>
        )}

        <div className="space-y-4">
        <fieldset disabled={terkunci} className="space-y-4 min-w-0 border-0 p-0 m-0">

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
            {currentJ === 0 && Object.keys(kunciProfil).length > 0 && (
              <div className="bg-[#FEF3DC] rounded-lg px-3 py-2 text-xs text-[#8a6516]">
                🔒 Jamaah ini Anda sendiri — data yang diambil dari profil akun (abu-abu) tidak bisa diubah di sini. Kalau ada yang salah, perbarui lewat menu <b>Profil</b>.
              </div>
            )}

            <div data-field="nama">
              <label className={lbl}>Nama Sesuai Paspor *</label>
              <input value={j.nama} readOnly={dikunci('nama')} onChange={e => setField('nama', e.target.value)} className={ck('nama')}/>
              {err('nama')}
            </div>

            <div data-field="paspor">
              <label className={lbl}>No. Paspor *</label>
              <input value={j.paspor} maxLength={PASPOR_MAKS} placeholder="Contoh: C1234567" onChange={e => {
                const v = bersihkanPaspor(e.target.value);
                setField('paspor', v);
                // NIK tetap yang utama — paspor cuma dipakai buat cari riwayat
                // kalau sudah pasti gak ada NIK (usia <=17 th, blm punya KTP).
                // Kalau orangnya dewasa, tunggu NIK-nya diisi (lihat field NIK).
                if (umur !== null && umur <= 17 && v.trim().length >= 6) cariRiwayat('paspor', v.trim());
              }} className={c('paspor')}/>
              {err('paspor')}
            </div>

            <div>
              <label className={lbl}>Masa Berlaku Paspor *</label>
              <div className="grid grid-cols-2 gap-3">
                <div data-field="exp_mulai">
                  <div className="text-xs text-gray-400 mb-1">Tanggal Mulai</div>
                  <InputTanggal value={j.exp_mulai} onChange={e => { if (e.target.value) setField('exp_mulai', e.target.value); }} className={c('exp_mulai')}/>
                  {err('exp_mulai')}
                </div>
                <div data-field="exp_paspor">
                  <div className="text-xs text-gray-400 mb-1">Tanggal Berakhir</div>
                  <InputTanggal value={j.exp_paspor} onChange={e => { if (e.target.value) setField('exp_paspor', e.target.value); }} className={c('exp_paspor')}/>
                  {err('exp_paspor')}
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

            <div data-field="tkp">
              <label className={lbl}>Tempat Keluarkan Paspor *</label>
              <input value={j.tkp} onChange={e => setField('tkp', bersihkanTempat(e.target.value))} placeholder="Contoh: Jakarta Selatan" className={c('tkp')}/>
              {err('tkp')}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div data-field="tl">
                <label className={lbl}>Tempat Lahir *</label>
                <input value={j.tl} readOnly={dikunci('tl')} onChange={e => setField('tl', e.target.value)} className={ck('tl')}/>
                {err('tl')}
              </div>
              <div data-field="ttl">
                <label className={lbl}>Tanggal Lahir *{wajib17Tahun && <span className="text-gray-400 font-normal"> (minimal 17 tahun)</span>}</label>
                <InputTanggal max={maksTglLahir} value={j.ttl} disabled={dikunci('ttl')} onChange={e => {
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
                }} className={ck('ttl')}/>
                {err('ttl')}
              </div>
            </div>

            <div data-field="nik">
              <label className={lbl}>No. KTP (NIK) {nikAktif ? '*' : ''}</label>
              <input
                value={j.nik}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '');
                  setField('nik', v);
                  if (v.length === 16) cariRiwayat('nik', v);
                }}
                disabled={!nikAktif || dikunci('nik')}
                maxLength={16}
                inputMode="numeric"
                placeholder={nikAktif ? '16 digit sesuai KTP' : 'Isi tanggal lahir dulu (aktif jika usia > 17 th)'}
                className={`w-full px-4 py-3 rounded-xl border-2 text-sm focus:outline-none transition-colors ${
                  (!nikAktif || dikunci('nik')) ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : errors.nik ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-gray-200 focus:border-[#1A4FA0]'
                }`}/>
              {err('nik')}
              {umur !== null && (
                <div className={`text-xs mt-1 ${nikAktif ? 'text-green-600' : 'text-gray-400'}`}>
                  {nikAktif
                    ? `✅ Usia ${umur} tahun — KTP wajib diisi`
                    : `ℹ️ Usia ${umur} tahun — KTP tidak diperlukan (di bawah/sama dengan 17 th)`}
                </div>
              )}
            </div>

            <div data-field="jk">
              <label className={lbl}>Jenis Kelamin *</label>
              <select value={j.jk} disabled={dikunci('jk')} onChange={e => setField('jk', e.target.value)} className={ck('jk')}>
                <option value="">— Pilih —</option>
                <option>Laki-Laki</option>
                <option>Perempuan</option>
              </select>
              {err('jk')}
            </div>

            {(() => {
              // Alamat kirim: pilih "Sama dengan Domisili" (form kedua
              // disembunyikan, nilainya ikut domisili otomatis) atau "Alamat
              // Berbeda" (baru munculin input) — dikonfirmasi user 2026-10-12.
              // Pilihan disimpan di alamat_kirim_beda; data lama tanpa flag
              // dianggap berbeda kalau isinya memang beda dari domisili.
              const kirimBeda = j.alamat_kirim_beda ?? (!!(j.alamat_kirim || '').trim() && (j.alamat_kirim || '').trim() !== (j.alamat || '').trim());
              return (
                <>
                  <div data-field="alamat">
                    <label className={lbl}>Alamat Domisili *</label>
                    <input value={j.alamat} readOnly={dikunci('alamat')} onChange={e => {
                      setField('alamat', e.target.value);
                      if (!kirimBeda) setField('alamat_kirim', e.target.value);
                    }} className={ck('alamat')}/>
                    {err('alamat')}
                  </div>

                  <div data-field="alamat_kirim">
                    <label className={lbl}>📦 Alamat Kirim Perlengkapan *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { beda: false, label: '🏠 Sama dengan Alamat Domisili' },
                        { beda: true, label: '📍 Alamat Berbeda' },
                      ].map(o => (
                        <button key={String(o.beda)} type="button"
                          onClick={() => {
                            setField('alamat_kirim_beda', o.beda);
                            if (!o.beda) setField('alamat_kirim', j.alamat || '');
                          }}
                          className={`text-xs font-semibold rounded-xl px-3 py-2.5 border-2 transition-colors ${
                            kirimBeda === o.beda ? 'border-[#1A4FA0] bg-[#E8F0FB] text-[#1A4FA0]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {kirimBeda && (
                      <input value={j.alamat_kirim} onChange={e => setField('alamat_kirim', e.target.value)}
                        placeholder="Alamat lengkap tujuan pengiriman perlengkapan" className={`${c('alamat_kirim')} mt-2`}/>
                    )}
                    {err('alamat_kirim')}
                    <div className="text-[10px] text-gray-400 mt-1">Alamat tujuan pengiriman koper, ihrom/mukena, dan perlengkapan lainnya.</div>
                  </div>
                </>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div data-field="wa">
                <label className={lbl}>No. WhatsApp *</label>
                <input value={j.wa} readOnly={dikunci('wa')} onChange={e => setField('wa', hanyaAngka(e.target.value))}
                  inputMode="numeric" maxLength={WA_MAKS} placeholder="08xxxxxxxxxx" className={ck('wa')}/>
                {err('wa')}
              </div>
              <div>
                <label className={lbl}>Email (opsional)</label>
                <input value={j.email} readOnly={dikunci('email')} onChange={e => setField('email', e.target.value)} className={dikunci('email') ? inpKunci : inp}/>
              </div>
            </div>

            {/* Keterangan "di bawah 17 tahun" ditulis SEKALI di sini, bukan di
                tiap label — label beda panjang ke-wrap beda baris & bikin
                input sebelahan gak sejajar. */}
            {!wajibAyahPendidikan && (
              <div className="text-xs text-gray-500 pb-2">Nama ayah/ibu kandung &amp; pendidikan terakhir opsional untuk jamaah di bawah 17 tahun.</div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div data-field="ayah" className="flex flex-col">
                <label className={`${lbl} flex-1`}>Nama Ayah Kandung {wajibAyahPendidikan ? '*' : <span className="text-gray-400 font-normal">(opsional)</span>}</label>
                <input value={j.ayah} onChange={e => setField('ayah', e.target.value)} className={c('ayah')}/>
                {err('ayah')}
              </div>
              <div data-field="ibu" className="flex flex-col">
                <label className={`${lbl} flex-1`}>Nama Ibu Kandung {wajibAyahPendidikan ? '*' : <span className="text-gray-400 font-normal">(opsional)</span>}</label>
                <input value={j.ibu} onChange={e => setField('ibu', e.target.value)} className={c('ibu')}/>
                {err('ibu')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div data-field="pendidikan" className="flex flex-col">
                <label className={`${lbl} flex-1`}>Pendidikan Terakhir {wajibAyahPendidikan ? '*' : <span className="text-gray-400 font-normal">(opsional)</span>}</label>
                <select value={j.pendidikan} onChange={e => setField('pendidikan', e.target.value)} className={c('pendidikan')}>
                  <option value="">— Pilih —</option>
                  {PENDIDIKAN_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {err('pendidikan')}
              </div>
              <div className="flex flex-col">
                <label className={`${lbl} flex-1`}>Pekerjaan (opsional)</label>
                <input value={j.pkj} onChange={e => setField('pkj', e.target.value)} className={inp}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Riwayat Penyakit (opsional)</label>
                <input value={j.penyakit} onChange={e => setField('penyakit', e.target.value)} className={inp}/>
              </div>
            </div>

            {/* Wali/Penanggung Jawab — cuma buat jamaah DI BAWAH 17 tahun
                (dikonfirmasi user 2026-10-13). Anak/infant gak tanda tangan
                Perjanjian Jamaah sendiri, nama ini yang dicetak sebagai
                penanda tangan mewakili dia di lembar perjanjian. */}
            {!wajibAyahPendidikan && (
              <div className="grid grid-cols-2 gap-3">
                <div data-field="wali_nama">
                  <label className={lbl}>Nama Wali/Penanggung Jawab *</label>
                  <input value={j.wali_nama} onChange={e => setField('wali_nama', e.target.value)} className={c('wali_nama')}/>
                  {err('wali_nama')}
                </div>
                <div data-field="wali_hub">
                  <label className={lbl}>Hubungan Wali *</label>
                  <input value={j.wali_hub} onChange={e => setField('wali_hub', e.target.value)}
                    placeholder="mis. Orang Tua, Kakak" className={c('wali_hub')}/>
                  {err('wali_hub')}
                </div>
                <div className="col-span-2 text-[10px] text-gray-400 -mt-2">
                  Karena jamaah ini di bawah 17 tahun, Perjanjian Jamaah akan ditandatangani oleh wali ini, bukan jamaah sendiri.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div data-field="mahram">
                <label className={lbl}>Nama Mahram *</label>
                <input value={j.mahram} onChange={e => setField('mahram', e.target.value)} className={c('mahram')}/>
                {err('mahram')}
              </div>
              <div data-field="hub_mahram">
                <label className={lbl}>Hubungan Mahram *</label>
                <select value={j.hub_mahram} onChange={e => setField('hub_mahram', e.target.value)} className={c('hub_mahram')}>
                  <option>Orang Tua</option>
                  <option>Anak</option>
                  <option>Suami/Istri</option>
                  <option>Saudara Kandung</option>
                </select>
                {err('hub_mahram')}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3">
            <div className="font-bold text-[#0E2F6E]">🆘 Kontak Darurat</div>
            <div className="grid grid-cols-2 gap-3">
              <div data-field="kdnama">
                <label className={lbl}>Nama *</label>
                <input value={j.kdnama} onChange={e => setField('kdnama', e.target.value)} className={c('kdnama')}/>
                {err('kdnama')}
              </div>
              <div data-field="kdwa">
                <label className={lbl}>No. WA *</label>
                <input value={j.kdwa} onChange={e => setField('kdwa', hanyaAngka(e.target.value))}
                  inputMode="numeric" maxLength={WA_MAKS} placeholder="08xxxxxxxxxx" className={c('kdwa')}/>
                {err('kdwa')}
              </div>
            </div>
            <div data-field="kdhub">
              <label className={lbl}>Hubungan *</label>
              <select value={j.kdhub} onChange={e => setField('kdhub', e.target.value)} className={c('kdhub')}>
                <option value="">-- Pilih Hubungan --</option>
                {hubunganList.map(h => <option key={h} value={h}>{h}</option>)}
                {/* Isian lama (teks bebas, mis. dari riwayat booking sebelumnya)
                    tetap kelihatan biar jamaah sadar harus pilih ulang. */}
                {j.kdhub && !hubunganList.includes(j.kdhub) && <option value={j.kdhub}>{j.kdhub} (pilih ulang)</option>}
              </select>
              {err('kdhub')}
            </div>
          </div>

          {/* Dokumen pendukung — OPSIONAL, gak menghalangi submit formulir.
              Boleh juga dikirim belakangan via WA kalau lebih gampang. */}
          <div ref={dokumenRef} className="bg-white rounded-xl border border-[#e0e8f0] p-5 space-y-3 scroll-mt-20">
            <div>
              <div className="font-bold text-[#0E2F6E]">📎 Dokumen Pendukung</div>
              <div className="text-xs text-gray-400 mt-0.5">Opsional — boleh diunggah di sini sekarang, atau dikirim menyusul via WhatsApp admin.{' '}
                {waLink(pengaturan.wa_kantor) && (
                  <a href={waLink(pengaturan.wa_kantor, `Halo JM Travel, saya ingin mengirim dokumen pendukung untuk booking ${booking.id} (${j.nama || `Jamaah ${currentJ + 1}`}).`)}
                    target="_blank" rel="noopener noreferrer" className="font-bold text-[#1A4FA0] underline hover:text-[#0E2F6E]">
                    Klik di sini untuk menghubungi admin
                  </a>
                )}
              </div>
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
                          {doc.key === 'doc_ktp' && String(j.doc_ktp).startsWith('/api/dokumen/ktp/') && (
                            <div className="text-[10px] text-gray-500">Diambil dari KTP pendaftaran akun Anda</div>
                          )}
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
                    {/* Lihat File sebaris sama Ganti/Hapus (dikonfirmasi user
                        2026-10-19), dulu link teks di bawah nama dokumen. */}
                    {j[doc.key] && (
                      <a href={j[doc.key]} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold text-[#1A4FA0] bg-white border border-[#1A4FA0] hover:bg-[#E8F0FB] px-3 py-1.5 rounded-full whitespace-nowrap">
                        Lihat File
                      </a>
                    )}
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

        </fieldset>

          {isLast && !terkunci && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#1A4FA0] flex-shrink-0"/>
              <span className="text-sm text-gray-500 leading-relaxed">
                Saya menyatakan bahwa data yang saya isi adalah benar dan saya menyetujui seluruh peraturan yang berlaku dari JM Travel.
              </span>
            </label>
          )}

          {jumlahError > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
              ⚠ Ada {jumlahError} isian yang belum diisi atau belum benar — sudah ditandai merah di atas.
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={prevJamaah}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
              ← {currentJ > 0 ? 'Jamaah ' + currentJ : 'Kembali'}
            </button>
            {isLast && terkunci ? null : isLast ? (
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
