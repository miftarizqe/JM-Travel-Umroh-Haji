'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import PasswordInput from '@/app/components/PasswordInput';
import PasswordStrengthMeter from '@/app/components/PasswordStrengthMeter';
import { tangkapRefPerwakilan, ambilRefPerwakilan, ambilRefAgenId } from '@/lib/referralCapture';
import { PERWAKILAN_COMING_SOON } from '@/lib/fiturSementara';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import TombolGoogle, { useErrorGoogle } from '@/app/components/TombolGoogle';
import RecaptchaCheckbox from '@/app/components/RecaptchaCheckbox';

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
  // 'sahabat' = alias lama dari link rekrut di Beranda Sahabat (sebelum
  // 2026-09-28 link-nya ?role=sahabat) — dinormalkan biar link yang terlanjur
  // dibagikan tetap ngunci tipe akun & perekrut, sama kayak link admin.
  const roleParam = searchParams.get('role');
  const roleAwal = roleParam === 'sahabat' ? 'sahabat_baitullah' : roleParam;
  // Perwakilan sementara di-pause (dikonfirmasi user 2026-09-27) — link lama
  // yang bawa ?role=perwakilan gak lagi auto-lock, balik ke kartu pilihan
  // biasa (yang di situ juga udah nampilin "Segera Hadir", disabled).
  const roleValidDariUrl = (roleAwal === 'perwakilan' && !PERWAKILAN_COMING_SOON) || roleAwal === 'sahabat_baitullah';
  // Link referral agen (/a/[kode]) — jamaah yang datang lewat link ini
  // dikunci LANGSUNG ke tipe akun Jamaah (dikonfirmasi user 2026-10-20),
  // gak perlu lihat/pilih step "Tipe Akun" sama sekali (apalagi ketawarin
  // kartu Perwakilan) — satu-satunya alasan mereka ke sini emang buat
  // daftar jamaah. Dicek via localStorage (ref_agen, lihat
  // referralCapture.js), BUKAN query URL — link agen gak bawa ?role=,
  // cuma /a/[kode] yang nyimpen tag lalu redirect ke beranda. Kalah
  // prioritas dari roleValidDariUrl (kasus ?role=perwakilan/sahabat lebih
  // eksplisit/sengaja, meski kombinasinya jarang kejadian bareng).
  const [viaAgenLink] = useState(() => !roleValidDariUrl && !!ambilRefAgenId());
  const roleAwalEfektif = roleValidDariUrl ? roleAwal : (viaAgenLink ? 'jamaah' : roleAwal);
  const roleValid = roleValidDariUrl || viaAgenLink;
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
  const [pengaturan] = usePengaturan();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name:'', nik:'', wa:'', email:'', password:'', confirmPassword:'',
    // Agama (Islam/Non-Islam) — dikonfirmasi user 2026-09-20, berlaku SEMUA
    // role, dipakai buat nentuin dokumen perjanjian mana yang dipakai kalau
    // akhirnya daftar Sahabat Baitullah (referral non-Muslim).
    agama:'',
    role: roleValid ? roleAwalEfektif : '',
    perekrut_id:'', kode_undangan:'', kode_referral_perwakilan:'',
  });
  // Kalau role udah kebawa dari popup kemitraan, step 2 gak perlu nampilin
  // kartu pilihan lagi (kesannya disuruh milih ulang) — cukup ringkasan
  // konfirmasi. "Ubah" bisa buka lagi kartu pilihannya kalau salah pilih.
  const [tampilkanPilihan, setTampilkanPilihan] = useState(!roleValid);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const selesaiRef = useRef(false);
  const [perwList, setPerwList] = useState([]);
  const [refNotFound, setRefNotFound] = useState(false);
  // Info perekrut yang udah TERKUNCI dari link invite (kode_invite_perwakilan/
  // kode_invite_sahabat) — disimpan LANGSUNG dari respons verify-invite
  // (bukan dicocokkan lagi ke perwList/sahabatList), karena pengundangnya
  // bisa jadi admin/super_admin (fitur link referral admin, 2026-09-19) yang
  // gak akan pernah muncul di perwList/sahabatList (list itu cuma isi
  // role='perwakilan'/'sahabat_baitullah'). Kalau ini keisi, box "terkunci"
  // langsung tampil, gak ada lagi kotak minta isi kode manual.
  const [perekrutTerkunciPerwakilan, setPerekrutTerkunciPerwakilan] = useState(null);
  const [perekrutTerkunciSahabat, setPerekrutTerkunciSahabat] = useState(null);
  // Referral permanen buat registrasi role='jamaah' — TERPISAH dari
  // form.perekrut_id (yang khusus rantai perwakilan-rekrut-perwakilan/
  // sahabat-rekrut-sahabat). Independen dari roleAwal/form.role biar gak
  // ilang kalau user klik "Ubah" ganti pilihan role di step 2.
  const [refPerwakilanJamaahId, setRefPerwakilanJamaahId] = useState(null);
  const [refSahabatJamaahId, setRefSahabatJamaahId] = useState(null);
  const [setujuDataPribadi, setSetujuDataPribadi] = useState(false);
  // Nama (disamarkan server) pemilik refSahabatJamaahId — daftar anggota
  // Sahabat gak di-fetch lagi (ditutup 2026-09-28), jadi namanya disimpan
  // langsung dari respons /api/referral-list/cek-sahabat.
  const [refSahabatJamaahNama, setRefSahabatJamaahNama] = useState('');
  // Kode referral perwakilan yang diketik manual (bukan dari link) —
  // dikonfirmasi user 2026-09-03: kartu "Perwakilan" tetap selalu
  // ditawarkan, tapi WAJIB isi kode referral valid (bukan pilih nama dari
  // dropdown) sebagai bukti orangnya beneran kenal/direkomendasikan
  // perwakilan aktif — gak ada lagi jalur "daftar mandiri".
  const [kodeReferralPerwakilan, setKodeReferralPerwakilan] = useState('');
  // Hasil cek terakhir disimpan BARENG kodenya ({ kode, valid }) — status
  // invalid/checking diturunkan dari situ, bukan di-set sinkron di effect
  // (react-hooks/set-state-in-effect). valid=null = cek gagal (network).
  const [cekKodePerwakilan, setCekKodePerwakilan] = useState({ kode: '', valid: null });
  const kodePerwakilanTrim = kodeReferralPerwakilan.trim();
  const kodeReferralChecking = !!kodePerwakilanTrim && cekKodePerwakilan.kode !== kodePerwakilanTrim;
  const kodeReferralInvalid = !!kodePerwakilanTrim && !kodeReferralChecking && cekKodePerwakilan.valid === false;
  // Eligible daftar Perwakilan TANPA kode referral kalau NIK yang diketik
  // tercatat pernah beneran berangkat umroh bersama JM Travel (dikonfirmasi
  // user 2026-09-06) — dicek publik (belum ada akun), cuma balikin boolean,
  // gak expose detail booking siapa pun.
  // Sama kayak cekKodePerwakilan: hasil disimpan bareng NIK yang dicek.
  const [cekRiwayat, setCekRiwayat] = useState({ nik: '', pernahUmroh: false, nama: null });
  const nikTrim = form.nik.trim();
  const nikLengkap = nikTrim.length === 16;
  const pernahUmroh = nikLengkap && cekRiwayat.nik === nikTrim && cekRiwayat.pernahUmroh;
  // Nama tersamar ("A***d B******n") pas NIK ketemu riwayat umroh — buat
  // popup cek NIK self-verify (dikonfirmasi user 2026-10-17, lihat
  // samarkanNama() di src/lib/riwayatUmroh.js).
  const pernahUmrohNama = pernahUmroh ? cekRiwayat.nama : null;
  const pernahUmrohChecking = nikLengkap && cekRiwayat.nik !== nikTrim;
  useEffect(() => {
    if (!nikLengkap) return;
    const timer = setTimeout(() => {
      fetch(`/api/cek-riwayat-umroh?nik=${encodeURIComponent(nikTrim)}`)
        .then(r => r.json())
        .then(d => setCekRiwayat({ nik: nikTrim, pernahUmroh: !!d.pernahUmroh, nama: d.nama_masked || null }))
        .catch(() => setCekRiwayat({ nik: nikTrim, pernahUmroh: false, nama: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [nikTrim, nikLengkap]);
  // Sama persis pola kode referral Perwakilan di atas, tapi buat gerbang
  // rekrut-sahabat-baru (dikonfirmasi user 2026-09-03: "gada lg bs milih
  // siapa yg rekrut" — dropdown bebas diganti kode invite acak, mirror
  // kode_invite_perwakilan). kodeInviteSahabatDariLink nandain kartu
  // Sahabat Baitullah harus tetap kebuka/kepilih kalau link-nya pakai kode
  // invite valid (BEDA dari refSahabatJamaahId yang match kode_unik biasa
  // buat referral JAMAAH, bukan buat jadi anggota sahabat baru).
  const [kodeReferralSahabat, setKodeReferralSahabat] = useState('');
  const [cekKodeSahabat, setCekKodeSahabat] = useState({ kode: '', valid: null });
  const kodeSahabatTrim = kodeReferralSahabat.trim();
  const kodeReferralSahabatChecking = !!kodeSahabatTrim && cekKodeSahabat.kode !== kodeSahabatTrim;
  const kodeReferralSahabatInvalid = !!kodeSahabatTrim && !kodeReferralSahabatChecking && cekKodeSahabat.valid === false;
  const [kodeInviteSahabatDariLink, setKodeInviteSahabatDariLink] = useState(false);
  // Dua jalur daftar (dikonfirmasi user 2026-10-23, revisi dari "HANYA
  // Google" pagi harinya): "Daftar dengan Google" — /api/auth/google/callback
  // balik ke sini dengan ?google=1, nama & email diisi dari Google (email
  // dikunci server) — ATAU form manual tanpa SSO (daftarManual), email
  // diketik sendiri, buat bikinin akun orang lain pakai email orang itu.
  // Password tetap wajib di dua jalur (login & konfirmasi bayar dari saldo).
  const [googleDaftar, setGoogleDaftar] = useState(null);
  const [daftarManual, setDaftarManual] = useState(false);
  // Token "Saya bukan robot" — cuma jalur form manual (Google udah nyaring
  // bot). Widget gak dirender kalau NEXT_PUBLIC_RECAPTCHA_SITE_KEY kosong,
  // server juga ngelewatin verifikasi kalau RECAPTCHA_SECRET_KEY kosong.
  const [captchaToken, setCaptchaToken] = useState('');
  // Token reCAPTCHA sekali pakai — kalau submit ditolak (mis. NIK dobel),
  // widget di-remount lewat key biar user bisa centang ulang.
  const [captchaKey, setCaptchaKey] = useState(0);
  const errorGoogle = useErrorGoogle(searchParams);
  const pakaiGoogle = searchParams.get('google') === '1';
  const [memuatGoogle, setMemuatGoogle] = useState(pakaiGoogle);
  const [googleKedaluwarsa, setGoogleKedaluwarsa] = useState(false);
  useEffect(() => {
    if (!pakaiGoogle) return;
    fetch('/api/auth/google/daftar', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d.aktif) { setGoogleKedaluwarsa(true); return; }
        setGoogleDaftar({ email: d.email, name: d.name });
        setForm(f => ({ ...f, email: d.email, name: f.name || d.name || '' }));
      })
      .catch(() => setGoogleKedaluwarsa(true))
      .finally(() => setMemuatGoogle(false));
  }, [pakaiGoogle]);
  // Balik ke URL /register yang sama (role/ref dari link undangan tetap kebawa).
  const kembaliGoogle = (() => {
    const q = new URLSearchParams(searchParams.toString());
    q.delete('google'); q.delete('google_error');
    const qs = q.toString();
    return qs ? `/register?${qs}` : '/register';
  })();
  async function batalGoogle() {
    await fetch('/api/auth/google/daftar', { method: 'DELETE' }).catch(() => {});
    lepasGuard();
    window.location.replace(kembaliGoogle);
  }

  const isDirty = step > 1 || !!(form.name || form.nik || form.wa || form.email || form.password);
  const lepasGuard = useUnsavedGuard(isDirty);

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
        // Fallback: jamaah yang landing lewat link referral perwakilan di
        // /program/[id]?ref=... (bukan langsung ke /register?ref=...) —
        // kodenya udah ke-capture ke localStorage (tangkapRefPerwakilan di
        // halaman lain), dipakai kalau ?ref= di URL ini gak match.
        const matchJamaah = (refCode && list.find(p => p.kode_unik === refCode))
          || list.find(p => p.kode_unik === ambilRefPerwakilan());
        if (matchJamaah) setRefPerwakilanJamaahId(matchJamaah.id);
      })
      .catch(() => {});
    // Referral permanen jamaah dari link sahabat (kode_unik) — dicek
    // TERLEPAS dari roleAwal, biar tetap kepakai walau user akhirnya daftar
    // sebagai Jamaah. Nutup celah lama (form.perekrut_id nyasar ke
    // users.perekrut_id pas user klik "Ubah" pilih Jamaah) dengan nyimpen ke
    // state terpisah. Cek 1 kode ke server (nama disamarkan) — daftar anggota
    // Sahabat gak di-list ke publik lagi (2026-09-28). Keputusan valid/gak-nya
    // role=sahabat_baitullah dari URL tetap cuma di effect verify-invite di
    // bawah (bug race condition 2026-09-27).
    if (refCode) {
      fetch('/api/referral-list/cek-sahabat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode: refCode }),
      })
        .then(r => r.json())
        .then(d => { if (d.valid) { setRefSahabatJamaahId(d.id); setRefSahabatJamaahNama(d.nama); } })
        .catch(() => {});
    }
  }, [refCode]);

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
        if (d.valid) {
          setForm(f => ({ ...f, perekrut_id: d.id, kode_referral_perwakilan: refCode }));
          setPerekrutTerkunciPerwakilan({ id: d.id, name: d.name, kode_unik: d.kode_unik });
        } else setRefNotFound(true);
      })
      .catch(() => {});
  }, [refCode, roleAwal]);

  // ?role=sahabat&ref=<kode> dari link sahabat — SATU-SATUNYA effect yang
  // boleh mutusin valid/gak-nya role=sahabat_baitullah dari URL (bug race
  // condition ditemukan & diperbaiki 2026-09-27, lihat komentar panjang di
  // effect /api/referral-list di atas). Dicoba BERURUTAN, bukan balapan:
  // 1) coba sebagai kode_invite_sahabat (link "rekrut anggota baru"), kalau
  //    valid langsung kunci. 2) kalau bukan/invalid, fallback coba sebagai
  //    kode_unik biasa (link pribadi sahabat yang dipakai apa adanya buat
  //    rekrut, dikonfirmasi user 2026-09-03 dua sumber ini sama-sama sah).
  // 3) kalau dua-duanya gagal, baru balik ke kartu pilihan biasa.
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
          // Yang dikirim ke server KODE undangannya — server sendiri yang
          // menentukan perekrut (2026-10-01). perekrut_id cuma buat tampilan.
          setForm(f => ({ ...f, role: 'sahabat_baitullah', perekrut_id: d.id, kode_undangan: refCode }));
          setPerekrutTerkunciSahabat({ id: d.id, name: d.name, kode_unik: d.kode_unik });
          return;
        }
        // Kode akun (SBJM...) BUKAN lagi jalan masuk pendaftaran Sahabat —
        // hanya kode undangan (dikonfirmasi user 2026-10-01: pendaftaran
        // hanya via invitation link). Link kode akun tetap berlaku sebagai
        // referral jamaah biasa (lihat refSahabatJamaahId di atas).
        setRefNotFound(true);
        setTampilkanPilihan(true);
        setForm(f => (f.role === 'sahabat_baitullah' ? { ...f, role: '' } : f));
      })
      .catch(() => {});
  }, [refCode, roleAwal]);

  // Verifikasi kode referral perwakilan yang DIKETIK MANUAL (bukan dari
  // link) — didebounce 400ms, ke server yang sama persis dgn di atas.
  // Sengaja gak ada matching client-side ke perwList sama sekali (itu cuma
  // punya kode_unik, bukan kode invite) — satu-satunya sumber kebenaran
  // adalah endpoint verify-invite.
  useEffect(() => {
    const kode = kodePerwakilanTrim;
    if (!kode) return;
    const timer = setTimeout(() => {
      fetch('/api/referral-list/verify-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) setForm(f => ({ ...f, perekrut_id: d.id, kode_referral_perwakilan: kode }));
          setCekKodePerwakilan({ kode, valid: !!d.valid });
        })
        .catch(() => setCekKodePerwakilan({ kode, valid: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [kodePerwakilanTrim]);

  // Verifikasi kode referral sahabat yang DIKETIK MANUAL — mirror persis
  // yang perwakilan di atas.
  useEffect(() => {
    const kode = kodeSahabatTrim;
    if (!kode) return;
    const timer = setTimeout(() => {
      fetch('/api/referral-list/verify-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode, tipe: 'sahabat_baitullah' }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) {
            setForm(f => ({ ...f, perekrut_id: d.id, kode_undangan: kode }));
            setPerekrutTerkunciSahabat({ id: d.id, name: d.name, kode_unik: d.kode_unik });
          }
          setCekKodeSahabat({ kode, valid: !!d.valid });
        })
        .catch(() => setCekKodeSahabat({ kode, valid: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [kodeSahabatTrim]);

  // step 1 sekarang "Tipe Akun" (dibalik, dikonfirmasi user 2026-10-17) —
  // validasi role-spesifik (kode referral/eligibility) pindah ke sini,
  // bukan lagi dicek pas submit akhir.
  function nextStep() {
    setError('');
    if (step === 1) {
      if (!form.role) { setError('Pilih tipe akun'); return; }
      // Perwakilan wajib kode referral valid (dikonfirmasi user 2026-09-03)
      // KECUALI (dikonfirmasi user 2026-09-06) NIK-nya tercatat udah pernah
      // berangkat umroh bersama JM Travel — otomatis eligible tanpa kode
      // referral, tapi kode yang udah keisi (link/manual) tetap dipakai.
      if (form.role === 'perwakilan') {
        if (form.nik.trim().length !== 16) { setError('Masukkan NIK 16 digit Anda terlebih dahulu.'); return; }
        if (!form.perekrut_id && !pernahUmroh) {
          setError('Masukkan kode referral perwakilan yang valid untuk melanjutkan.'); return;
        }
      }
      if (form.role === 'sahabat_baitullah') {
        if (!setujuDataPribadi) { setError('Centang persetujuan data pribadi terlebih dahulu.'); return; }
        if (!form.kode_undangan) { setError('Masukkan kode referral Sahabat Baitullah yang valid untuk melanjutkan.'); return; }
      }
      setStep(2);
    }
  }

  // step 2 sekarang "Data Diri" — validasi field akun + submit
  // beneran, dipindah dari nextStep() lama (dikonfirmasi user 2026-10-17).
  async function handleRegister() {
    if (!form.name || !form.nik || !form.wa || !form.email || !form.agama || !form.password || !form.confirmPassword) {
      setError('Semua field wajib diisi'); return;
    }
    if (form.nik.length !== 16) { setError('NIK harus 16 digit'); return; }
    if (form.password.length < 8) { setError('Password min. 8 karakter'); return; }
    if (form.password !== form.confirmPassword) { setError('Password tidak cocok'); return; }
    if (!googleDaftar && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !captchaToken) {
      setError('Mohon centang verifikasi "Saya bukan robot" terlebih dahulu.'); return;
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
            ref_sahabat_jamaah_id: refSahabatJamaahId || undefined,
            // Agen (link /a/[kode], dikonfirmasi user 2026-10-20) — id-nya
            // udah ada langsung di localStorage (ambilRefAgenId), gak
            // perlu lookup/verifikasi tambahan kayak kode Perwakilan/
            // Sahabat (itu string kode_unik yang butuh dicocokin ke akun,
            // ini udah id akun hasil capture di /a/[kode]).
            ref_agen_jamaah_id: ambilRefAgenId() || undefined }
        : form.role === 'sahabat_baitullah'
          // Sahabat: kirim KODE undangan saja, perekrut ditentukan server.
          ? { ...form, perekrut_id: undefined, setuju_data_pribadi: setujuDataPribadi }
          : form;
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleDaftar ? payload : { ...payload, captchaToken })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Pendaftaran gagal.');
        if (!googleDaftar) { setCaptchaToken(''); setCaptchaKey(k => k + 1); }
        return;
      }

      // Server langsung login-in (cookie sesi httpOnly di-set di respons
      // register) — FE cuma simpan data user.
      localStorage.setItem('user', JSON.stringify(data.user));

      // OTP dihapus (2026-09-23) — langsung ke upload-foto (langkah wajib
      // berikutnya yang dulu dituju /verifikasi setelah kode benar).
      // Navigasi penuh, bukan router.push — alasan sama kayak login/page.jsx
      // (Client Cache bisa nyimpen redirect proxy lama ke /login).
      // Akun udah kebuat — matiin guard "Leave site?" dulu. Kalau gak, user
      // yang klik "Cancel" bakal ketahan di form & submit ulang → error
      // "NIK/email/no. telepon sudah terdaftar" padahal akunnya baru.
      lepasGuard();
      selesaiRef.current = true;
      window.location.assign(redirect ? `/upload-foto?redirect=${encodeURIComponent(redirect)}` : '/upload-foto');
    } catch {
      setError('Terjadi kesalahan, coba lagi.');
    } finally {
      // Jangan aktifin tombol lagi kalau udah sukses & lagi pindah halaman,
      // biar gak bisa dobel-submit.
      if (!selesaiRef.current) setLoading(false);
    }
  }

  // Urutan step DIBALIK (dikonfirmasi user 2026-10-17): pilih tipe akun
  // DULU, baru isi data diri — biar gak capek-capek isi nama/WA/email/
  // password dulu baru ketauan di step berikutnya butuh kode referral yang
  // gak punya. Cek NIK + eligibility Perwakilan (dulu modal overlay
  // terpisah) sekarang jadi bagian ALAMI dari step pilih tipe akun, gak
  // peduli role-nya kebawa dari link (roleAwal) atau dipilih manual dari
  // kartu — satu alur yang sama buat dua-duanya.
  const steps = ['Tipe Akun', 'Data Diri'];

  return (
    <div className="min-h-screen bg-[#eef1f8] flex items-center justify-center px-4 py-8 font-sans">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8 cursor-pointer" onClick={() => keluar('/')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/jm-travel-logo.png" alt="JM Travel" className="h-24 mx-auto object-contain" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {memuatGoogle ? (
            <div className="text-center text-sm text-gray-400 py-8">Memuat data akun Google...</div>
          ) : !googleDaftar && !daftarManual ? (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold text-[#0E2F6E]">Daftar Akun JM Travel</h2>
                <p className="text-sm text-gray-400 mt-1">Daftar pakai akun Google, atau isi form dengan email biasa.</p>
              </div>
              {(errorGoogle || googleKedaluwarsa) && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                  ⚠️ {errorGoogle || 'Sesi daftar Google sudah berakhir. Silakan klik "Daftar dengan Google" lagi.'}
                </div>
              )}
              <TombolGoogle label="Daftar dengan Google" kembali={kembaliGoogle} />
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <div className="flex-1 h-px bg-gray-200" />atau<div className="flex-1 h-px bg-gray-200" />
              </div>
              <button type="button" onClick={() => setDaftarManual(true)}
                className="w-full border-2 border-[#1A4FA0] text-[#1A4FA0] hover:bg-[#E8F0FB] font-bold py-3 rounded-full transition-colors text-sm">
                Daftar dengan Email (isi form)
              </button>
              <p className="text-center text-sm text-gray-400">
                Sudah punya akun?{' '}
                <span className="text-[#1A4FA0] font-semibold cursor-pointer hover:underline" onClick={() => router.push(loginUrl)}>Masuk</span>
              </p>
            </div>
          ) : (<>
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

          {/* STEP 2 - DATA DIRI (dibalik 2026-10-17, dulu step 1) */}
          {step === 2 && (
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
                  : refSahabatJamaahNama;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700">
                    📌 Kalau Anda daftar sebagai <b>Jamaah</b>, akun ini akan terhubung permanen dengan {refPerwakilanJamaahId ? 'Perwakilan' : 'anggota Sahabat Baitullah'} <b>{nama || '-'}</b> — tidak bisa diubah lagi setelah akun dibuat.
                  </div>
                );
              })()}
              {[
                {id:'name', label:'Nama Lengkap *', placeholder:'Nama sesuai KTP'},
                {id:'nik', label:'No. KTP (NIK 16 digit) *', placeholder:'16 digit angka', maxLength:16, numeric:true},
                {id:'wa', label:'No. WhatsApp *', placeholder:'08xxxxxxxxxx', maxLength:13, numeric:true},
                {id:'email', label:'Email *', placeholder:'email@domain.com'},
              ].map(f => {
                // NIK Perwakilan udah dikunci & dicek di step 1 (Tipe Akun,
                // dikonfirmasi user 2026-10-17) — read-only di sini, "Ubah"
                // balik ke step 1 buat ganti.
                if (f.id === 'email' && googleDaftar) {
                  return (
                    <div key={f.id}>
                      <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">{f.label}</label>
                      <div className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm text-gray-600">
                        {googleDaftar.email} <span className="text-xs text-gray-400">(dari Google)</span>
                      </div>
                    </div>
                  );
                }
                if (f.id === 'nik' && form.role === 'perwakilan') {
                  return (
                    <div key={f.id}>
                      <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">{f.label}</label>
                      <div className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm text-gray-600 flex items-center justify-between">
                        <span>{form.nik}</span>
                        <button type="button" onClick={() => setStep(1)}
                          className="text-xs font-bold text-[#1A4FA0] hover:underline">Ubah</button>
                      </div>
                    </div>
                  );
                }
                return (
                <div key={f.id}>
                  <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">{f.label}</label>
                  <input
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    inputMode={f.numeric ? 'numeric' : undefined}
                    value={form[f.id]}
                    onChange={e => {
                      // NIK & No. WhatsApp: angka doang, non-digit dibuang di
                      // FE (dikonfirmasi user via Farrosy 2026-09-27) — jangan
                      // cuma andalkan maxLength, itu gak nyaring huruf.
                      const v = f.numeric ? e.target.value.replace(/\D/g, '') : e.target.value;
                      setForm({...form, [f.id]: v});
                    }}
                  />
                </div>
                );
              })}
              <div>
                <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">Agama *</label>
                <select
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors bg-white"
                  value={form.agama}
                  onChange={e => setForm({...form, agama: e.target.value})}
                >
                  <option value="">— Pilih —</option>
                  <option value="islam">Islam</option>
                  <option value="non_islam">Non-Islam</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">Password *</label>
                {googleDaftar && (
                  <p className="text-xs text-gray-400 mb-1.5">Tetap wajib dibuat — dipakai untuk konfirmasi pembayaran. Untuk masuk, Anda bisa pakai Google.</p>
                )}
                <PasswordInput
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                  placeholder="Min. 8 karakter"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                />
                <PasswordStrengthMeter password={form.password} />
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
              {!googleDaftar && <RecaptchaCheckbox key={captchaKey} onChange={setCaptchaToken} />}
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
              <p className="text-center text-sm text-gray-400">
                Sudah punya akun?{' '}
                <span className="text-[#1A4FA0] font-semibold cursor-pointer hover:underline" onClick={() => keluar(loginUrl)}>Masuk</span>
              </p>
              <p className="text-center text-xs text-gray-400">
                Lupa password?{' '}
                <a href={waLink(pengaturan.wa_kantor, 'Assalamu\'alaikum JM Travel, saya lupa password akun saya. Mohon bantuannya untuk reset password.') || '#'}
                  target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-semibold hover:underline">
                  Hubungi Admin →
                </a>
              </p>
            </div>
          )}

          {/* STEP 1 - TIPE AKUN (dibalik 2026-10-17, dulu step 2) */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[#0E2F6E]">
                  {tampilkanPilihan ? 'Pilih Tipe Akun' : 'Konfirmasi Tipe Akun'}
                </h2>
                <p className="text-sm text-gray-400">
                  {tampilkanPilihan ? 'Satu langkah lagi — pilih peran Anda.' : 'Sesuai pilihan Anda sebelumnya.'}
                </p>
              </div>

              {googleDaftar ? (
                <div className="bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-2.5 text-xs text-[#1A4FA0] flex items-center justify-between gap-2">
                  <span>✓ Mendaftar dengan akun Google <b>{googleDaftar.email}</b></span>
                  <button type="button" onClick={batalGoogle} className="font-bold hover:underline flex-shrink-0">Ganti akun</button>
                </div>
              ) : (
                <div className="bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-2.5 text-xs text-[#1A4FA0] flex items-center justify-between gap-2">
                  <span>✓ Mendaftar dengan email (tanpa Google)</span>
                  <button type="button" onClick={() => setDaftarManual(false)} className="font-bold hover:underline flex-shrink-0">Pakai Google</button>
                </div>
              )}

              {!tampilkanPilihan ? (
                // Role udah kebawa dari link/popup kemitraan — SENGAJA gak ada
                // tombol "Ubah" (dikonfirmasi user 2026-09-03): begitu datang
                // lewat link referral, tipe akun & kode referralnya permanen,
                // gak bisa diubah di sini. Kalau mau daftar tipe lain (mis.
                // jamaah biasa), tinggal keluar dari link ini & buka /register
                // polos — bukan ubah-ubah pilihan di form yang sama.
                <div className="flex items-center gap-3 bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-3">
                  <div className="text-2xl">{form.role === 'sahabat_baitullah' ? '🤝' : form.role === 'perwakilan' ? '🏢' : '🕌'}</div>
                  <div className="font-bold text-[#0E2F6E] text-sm">
                    {form.role === 'sahabat_baitullah' ? 'Jamaah Sahabat Baitullah' : form.role === 'perwakilan' ? 'Perwakilan Resmi' : 'Jamaah'}
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
                    // Sementara di-pause (dikonfirmasi user 2026-09-27) — cuma
                    // program Sahabat Baitullah dulu yang launch. Kartu tetap
                    // kelihatan (orang tau programnya ada) tapi disabled +
                    // "Segera Hadir", lihat render di bawah (r.disabled).
                    {value:'perwakilan', icon:'🏢', title:'Perwakilan', desc:'Kelola program di wilayah Anda', disabled: PERWAKILAN_COMING_SOON},
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
                      onClick={() => !r.disabled && setForm({...form, role: r.value})}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                        r.disabled
                          ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                          : form.role === r.value
                            ? 'border-[#1A4FA0] bg-[#E8F0FB] cursor-pointer'
                            : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                      }`}>
                      <div className="text-2xl">{r.icon}</div>
                      <div>
                        <div className="font-bold text-[#0E2F6E] text-sm">{r.title}</div>
                        <div className="text-xs text-gray-400">{r.desc}</div>
                      </div>
                      {r.disabled ? (
                        <div className="ml-auto text-[10px] font-bold text-[#C9952A] bg-[#FEF3DC] px-2 py-1 rounded-full whitespace-nowrap">Segera Hadir</div>
                      ) : form.role === r.value && <div className="ml-auto text-[#1A4FA0] font-bold">✓</div>}
                    </div>
                  ))}
                </div>
              )}

              {form.role === 'perwakilan' && (() => {
                const terkunci = perekrutTerkunciPerwakilan || perwList.find(p => p.id === form.perekrut_id);
                return (
                  <div className="space-y-3">
                    {/* Cek NIK di depan (dikonfirmasi user 2026-10-17) — sebelum
                        minta kode referral, cek dulu apakah NIK-nya tercatat
                        pernah berangkat umroh bersama JM Travel (otomatis
                        eligible tanpa kode). Berlaku sama persis baik role-nya
                        kebawa dari link/landing page MAUPUN dipilih manual dari
                        kartu di atas. NIK TETAP diminta walau referral udah
                        terkunci dari link (perlu buat akun), cuma feedback
                        eligibility-nya aja yang gak relevan lagi di situ. */}
                    <div>
                      <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">No. KTP (NIK 16 digit) *</label>
                      <input
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm transition-colors"
                        placeholder="16 digit angka"
                        maxLength={16}
                        inputMode="numeric"
                        value={form.nik}
                        onChange={e => setForm({ ...form, nik: e.target.value.replace(/\D/g, '') })}
                      />
                      {!perekrutTerkunciPerwakilan && form.nik.trim().length === 16 && (
                        pernahUmrohChecking ? (
                          <div className="text-[10px] text-gray-400 mt-1">Mengecek riwayat umroh...</div>
                        ) : pernahUmroh ? (
                          <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 mt-2">
                            <div className="font-bold mb-0.5">✅ Ditemukan: {pernahUmrohNama}</div>
                            Anda tercatat pernah berangkat umroh bersama JM Travel — eligible daftar Perwakilan tanpa kode referral.
                          </div>
                        ) : (
                          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mt-2">
                            Anda belum pernah umroh bersama JM Travel. Isi kode referral di bawah, atau{' '}
                            <a href={waLink(pengaturan.wa_kantor, 'Assalamu\'alaikum JM Travel, saya ingin daftar sebagai Perwakilan tapi belum punya kode referral.') || '#'}
                              target="_blank" rel="noopener noreferrer" className="font-bold underline">
                              hubungi admin JM Travel
                            </a>.
                          </div>
                        )
                      )}
                    </div>
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
                        <div className="text-sm font-bold text-[#0E2F6E]">{terkunci.name}{(terkunci.kode_unik || refCode || kodeReferralPerwakilan) && ` (${terkunci.kode_unik || refCode || kodeReferralPerwakilan})`}</div>
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
                const terkunci = perekrutTerkunciSahabat;
                return (
                  <div>
                    <label className="block text-sm font-semibold text-[#0E2F6E] mb-1.5">
                      Kode Referral Sahabat Baitullah <span className="text-red-500">*</span>
                    </label>
                    {terkunci ? (
                      <div className="bg-[#E8F0FB] border border-[#1A4FA0]/20 rounded-xl px-4 py-3">
                        <div className="text-sm font-bold text-[#0E2F6E]">{terkunci.name}{(terkunci.kode_unik || refCode || kodeReferralSahabat) && ` (${terkunci.kode_unik || refCode || kodeReferralSahabat})`}</div>
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

              {form.role === 'sahabat_baitullah' && (
                // Persetujuan data pribadi (dikonfirmasi user 2026-10-02) —
                // wajib, dicek ulang di server (/api/auth/register).
                <label className="flex items-start gap-2 p-3 rounded-xl border-2 border-gray-200 cursor-pointer">
                  <input type="checkbox" checked={setujuDataPribadi} onChange={e => setSetujuDataPribadi(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#1A4FA0] flex-shrink-0" />
                  <span className="text-xs text-gray-600 leading-relaxed">
                    Saya setuju <b>nama</b>, <b>no. telepon</b> (hanya untuk pengajak langsung saya), dan <b>progres tabungan umroh</b> saya dapat dilihat oleh pengajak (upline) saya di Program Sahabat Baitullah.
                  </span>
                </label>
              )}

              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">⚠️ {error}</div>}
              <button onClick={nextStep}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
                Lanjut →
              </button>
            </div>
          )}
          </>)}
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