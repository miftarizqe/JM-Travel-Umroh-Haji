'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBukti from '@/app/components/UploadBukti';
import CartPaketKamar, { jamaahKosong, kamarKeyOf, masalahJamaah, labelPaketKamar, hargaItem } from '@/app/components/CartPaketKamar';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser, segarkanStatusUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import { useMetodePembayaran } from '@/lib/useMetodePembayaran';
import { trackLead } from '@/lib/analytics';
import { ambilRefPerwakilan, ambilRefAgenId } from '@/lib/referralCapture';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <CheckoutPageInner />
    </Suspense>
  );
}

function CheckoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const progId = searchParams.get('prog_id');

  const [user] = useCurrentUser();
  // Status/verifikasi akun TERKINI dari server buat gerbang di bawah — cache
  // login di localStorage bisa basi kalau admin verifikasi sesudah login.
  const [statusTerkini, setStatusTerkini] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    segarkanStatusUser(user).then(setStatusTerkini);
  }, [user]);
  const [pengaturan] = usePengaturan();
  const [metodePembayaran] = useMetodePembayaran();
  const [prog, setProg] = useState(null);
  const [progTidakTersedia, setProgTidakTersedia] = useState(false);
  const [step, setStep] = useState(1);
  // Keranjang = daftar JAMAAH (1 kartu = 1 jamaah, paket/kamar sendiri-
  // sendiri, dikonfirmasi user 2026-10-16) — bukan lagi "item" qty-N berbagi
  // 1 paket. Diseed 1 kartu kosong begitu `prog` kemuat (lihat effect di
  // bawah), bukan di initial state (komboDefault butuh `prog` buat nentuin
  // paket/kamar default yang beneran ada harganya).
  const [cart, setCart] = useState([]);
  useEffect(() => {
    if (!prog || cart.length > 0) return;
    setCart([jamaahKosong(prog)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prog]);
  // Validasi + cek NIK dobel sebelum lanjut ke step bayar — dulu ada di
  // dalam tambahkan() punya CartPaketKamar, sekarang kartu jamaah gak ada
  // tombol "tambahkan" lagi (langsung nempel di keranjang), jadi dicek
  // sekali di sini pas user mau lanjut.
  const [cekNikBusy, setCekNikBusy] = useState(false);
  // uid kartu jamaah yang kebuka (accordion CartPaketKamar, 2+ jamaah).
  const [jamaahTerbuka, setJamaahTerbuka] = useState(null);
  // Kartu yang datanya kurang bisa lagi ketutup (accordion) -> bukain &
  // scroll ke kartunya dulu, baru alert, biar user tau jamaah mana yang kurang.
  function tunjukkanJamaah(idx, pesan) {
    const c = cart[idx];
    if (!c) { alert(pesan); return; }
    setJamaahTerbuka(c.uid);
    setTimeout(() => {
      document.getElementById(`jamaah-${c.uid}`)?.scrollIntoView({ block: 'start' });
      alert(`Jamaah ${idx + 1}${c.nama.trim() ? ` (${c.nama.trim()})` : ''}: ${pesan}`);
    }, 0);
  }
  async function lanjutKePembayaran() {
    if (cart.length === 0) return;
    for (let i = 0; i < cart.length; i++) {
      const masalah = masalahJamaah(cart[i], prog, cart);
      if (masalah) { tunjukkanJamaah(i, masalah); return; }
    }
    const niks = cart.filter(c => !c.tanpaNik).map(c => c.nik.trim());
    const dobelLokal = niks.find((n, i) => niks.indexOf(n) !== i);
    if (dobelLokal) {
      const idxDobel = cart.findLastIndex(c => !c.tanpaNik && c.nik.trim() === dobelLokal);
      tunjukkanJamaah(idxDobel, `NIK ${dobelLokal} dimasukkan lebih dari sekali. Satu orang cuma bisa didaftarkan sekali di program ini.`);
      return;
    }
    if (niks.length > 0) {
      setCekNikBusy(true);
      try {
        const d = await fetch('/api/bookings/cek-nik', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prog_id: prog?.id, niks }),
        }).then(r => r.json());
        if (d.terpakai) {
          tunjukkanJamaah(cart.findIndex(c => !c.tanpaNik && c.nik.trim() === d.terpakai),
            `NIK ${d.terpakai} sudah terdaftar di program ini. Satu orang tidak bisa didaftarkan dua kali di program yang sama.`);
          return;
        }
      } catch {
        alert('Gagal mengecek data NIK, coba lagi.');
        return;
      } finally {
        setCekNikBusy(false);
      }
    }
    setStep(3);
  }
  // Dari CartPaketKamar — dipakai isi voucher_kode pas submit & nampilin
  // info sisa pelunasan di step 3 (komponennya sendiri sudah unmount di situ).
  const [summary, setSummary] = useState({ totalHarga: 0, totalDp: 0, voucherKode: null, voucherDiskon: 0, totalHargaSetelahDiskon: 0, sisaPelunasan: 0 });
  // Sumber informasi (siapa yang mengajak) — WAJIB di checkout,
  // karena inilah yang menentukan siapa penerima komisi. Perwakilan/Sahabat
  // Baitullah yang checkout untuk diri sendiri (mis. Closing Langsung)
  // TIDAK perlu ditanya sumber info — closing otomatis ke akun mereka
  // sendiri (dikonfirmasi user 2026-09-27, mirror perilaku /order-jamaah
  // yang sekarang dilebur ke sini). Diisi via lazy initializer dari `user`
  // (sudah resolve duluan lewat useCurrentUser di atas), bukan efek — biar
  // gak kena flag react-hooks/set-state-in-effect.
  const AUTO_LOCK_SUMBER_ROLES = ['perwakilan', 'sahabat_baitullah'];
  const [sumber, setSumber] = useState(() => AUTO_LOCK_SUMBER_ROLES.includes(user?.role) ? user.role : '');
  const [referralKode, setReferralKode] = useState(() => AUTO_LOCK_SUMBER_ROLES.includes(user?.role) ? (user.kode_unik || '') : '');
  // Page load penuh (mis. habis login, navigasinya sekarang window.location)
  // -> `user` baru kebaca SESUDAH hydration (lihat useCurrentUser.js), jadi
  // lazy initializer di atas kebagian `undefined`. Isi sekali begitu user
  // ada, tanpa nimpa pilihan yang udah diisi.
  useEffect(() => {
    if (!AUTO_LOCK_SUMBER_ROLES.includes(user?.role)) return;
    setSumber(s => s || user.role);
    setReferralKode(k => k || user.kode_unik || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);
  // Referral perwakilan PERMANEN (dikunci sejak registrasi) — kalau jamaah
  // punya ini, dropdown "Sumber Informasi" diganti banner read-only di
  // bawah, murni kosmetik karena server (buatSatuBooking) SUDAH memaksa
  // pakai nilai ini apapun yang dikirim client.
  const [permanentReferrer, setPermanentReferrer] = useState(null);
  // Jamaah ketik kode_unik Perwakilan/Agen/Sahabat yang mengajak, SATU kode
  // diverifikasi ke server (POST /api/referral-list/cek-<role>, nama
  // disamarkan) — BUKAN dropdown nge-list semua nama (dikonfirmasi user
  // 2026-10-19, nyamain ke pola Sahabat Baitullah yang udah ditutup duluan
  // 2026-09-28 — checkout sebelumnya kelewat masih expose GET
  // /api/referral-list & ?role=agen yang balikin nama lengkap SEMUA
  // perwakilan/agen ke siapa pun tanpa login).
  const [perwakilanTerverifikasi, setPerwakilanTerverifikasi] = useState(null);
  const [cekPerwakilanStatus, setCekPerwakilanStatus] = useState('');
  // referral_agen_id biasanya tag invisible dari localStorage (klik link
  // /a/[kode]) — tapi itu ilang kalau beda device/browser/cache kehapus.
  // Fallback manual ini JAGA-JAGA biar jamaah tetap bisa ngasih kredit ke
  // agen yang ngajak walau tag-nya udah gak ada, TANPA perlu ngunci
  // permanen ke akun (dikonfirmasi user, beda dari referral perwakilan).
  const [agenTerverifikasi, setAgenTerverifikasi] = useState(null);
  const [cekAgenStatus, setCekAgenStatus] = useState('');
  // "Closing langsung" sahabat — jamaah booking langsung (bukan nabung),
  // atribusi ke anggota sahabat yang bantu, pola identik sumber='perwakilan'
  // di atas. MURNI tag (referral_sahabat_id) buat admin proses split
  // rekening pribadi secara manual — TIDAK ikut logic komisi/voucher apa pun.
  const [sahabatTerverifikasi, setSahabatTerverifikasi] = useState(null);
  const [cekSahabatStatus, setCekSahabatStatus] = useState('');
  const [buktiPath, setBuktiPath] = useState(null);
  // Sahabat Baitullah checkout program REGULER SEMPAT wajib baca & setujui
  // Surat Perjanjian Jamaah SEBELUM bayar DP (dikonfirmasi user 2026-10-11)
  // -- DICABUT (dikonfirmasi user 2026-10-15): mekanisme itu numpang di
  // prop `perjanjian` CartPaketKamar (udah gak ada sama sekali di keranjang
  // versi sekarang, 1-kartu-1-jamaah), efek sampingnya keranjang KEBATAS
  // maks 1 item -- gak bisa checkout buat Diri Sendiri + Orang Lain
  // sekaligus (beda paket pun gak bisa). Sahabat sekarang ikut alur
  // STANDAR sama persis jamaah biasa: bebas nambah berapa pun kartu
  // jamaah/paket ke keranjang, DP, BARU Isi Formulir Jamaah, BARU Baca &
  // Setujui Perjanjian (1x per booking lewat /pks?jenis=jamaah, SAMA
  // mekanismenya kayak jamaah lain -- isi pasalnya pun SAMA PERSIS,
  // dikonfirmasi user, "perjanjian program umroh semuanya sama apapun
  // jenis programnya"). Dokumen Perjanjian Jamaah yang dicetak admin
  // (/admin/cetak-perjanjian) UDAH otomatis keluar satu-satu per jamaah
  // sesuai isian formulir masing-masing, gak perlu perubahan apa pun di
  // situ.
  const [buktiNama, setBuktiNama] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bookingIds, setBookingIds] = useState([]);
  const [timer, setTimer] = useState(3599);
  // Konsen eksplisit pemotongan saldo (dikonfirmasi user 2026-10-11) —
  // checkout-mandiri motong saldo tabungan LANGSUNG begitu submit (lihat
  // lib/saldoSahabat.js), bukan sekadar "niat" — jadi butuh centang
  // persetujuan dulu, sama pola kayak checkbox "Saya setuju identitas saya
  // diserahkan ke Bank BSI" di status-pendaftaran-sahabat. Dasar hukumnya
  // SK-CIF & Surat Pemblokiran yang sudah ditandatangani pas jadi anggota
  // (otorisasi UMUM), checkbox ini otorisasi SPESIFIK buat nominal & booking
  // ini doang.
  const [setujuPotongSaldo, setSetujuPotongSaldo] = useState(false);

  // Checkout mandiri Program Sahabat Baitullah (Jamaah Sahabat Baitullah
  // checkout buat DIRI SENDIRI) — alur beda total dari checkout biasa: gak
  // ada DP, dibayar dari saldo tabungan + sisa pribadi (dikonfirmasi user
  // 2026-08-29). Ditangani sebagai cabang terpisah di bawah, BUKAN nyampur
  // ke step 1-4 di atas yang isinya keranjang multi-item.
  const [paketMandiri, setPaketMandiri] = useState('eksekutif');
  const [kamarMandiri, setKamarMandiri] = useState('Triple (3/Kamar)');
  const [namaMandiri, setNamaMandiri] = useState('');
  const [waMandiri, setWaMandiri] = useState('');
  const [jkMandiri, setJkMandiri] = useState('');
  const [alamatMandiri, setAlamatMandiri] = useState('');
  const [nikMandiri, setNikMandiri] = useState('');
  const [tanpaNikMandiri, setTanpaNikMandiri] = useState(false);
  const [cekLanjutMandiri, setCekLanjutMandiri] = useState(false);
  // Modal "Pastikan data sudah benar" sebelum masuk step Pembayaran
  // (dikonfirmasi user 2026-10-15).
  const [konfirmasiDataMandiri, setKonfirmasiDataMandiri] = useState(false);
  const [voucherMandiri, setVoucherMandiri] = useState(null);
  const [saldoInfo, setSaldoInfo] = useState(null);
  const [hasilMandiri, setHasilMandiri] = useState(null);
  const [noRekeningUmrohMandiri, setNoRekeningUmrohMandiri] = useState('');
  // Saldo kurang -> pilih cara nutup kekurangannya (dikonfirmasi user
  // 2026-10-16): 'transfer_langsung' (saldo dipakai semua, sisanya transfer
  // ke rekening JM Travel + upload bukti, checkout jalan sekarang) atau
  // 'setor_mandiri' (nabung dulu ke rekening tabungan umroh sendiri,
  // checkout lagi setelah saldo cukup).
  const [metodeKurangMandiri, setMetodeKurangMandiri] = useState('');
  const [buktiMandiri, setBuktiMandiri] = useState(null);

  const isMandiriSahabat = user?.role === 'sahabat_baitullah' && prog?.publish_type === 'sahabat_baitullah';
  // Program eksklusif cuma boleh didaftarkan buat diri sendiri — KECUALI
  // akun non-Muslim (gak bisa umroh sendiri, memberangkatkan orang lain
  // pakai akunnya, lihat migration 192_referral-nonis-sahabat), dikonfirmasi
  // user 2026-10-06. Server-side yang beneran menegakkan (checkout-mandiri
  // route memaksa nama dari profil akun apapun yang dikirim client) — kunci
  // di UI ini cuma biar gak membingungkan (keliatan bisa diedit padahal
  // ditolak server).
  const namaMandiriTerkunci = isMandiriSahabat && user?.agama !== 'non_islam';

  // Udah masuk isi paket/bayar tapi belum kelar (step sukses: 3 buat
  // checkout mandiri Sahabat Baitullah, 4 buat checkout biasa).
  const isDirty = step > 1 && step < (isMandiriSahabat ? 3 : 4);
  useUnsavedGuard(isDirty);

  // Verifikasi kode Sahabat/Perwakilan/Agen yang diketik jamaah (didebounce
  // 400ms, 1 kode ke server — BUKAN cari di daftar lengkap yang di-fetch
  // duluan, lihat catatan di atas). Akun Sahabat sendiri gak lewat sini —
  // referralKode-nya kode milik sendiri & referral_sahabat_id dipaksa
  // user.id pas submit. Perwakilan checkout sendiri juga gak lewat sini
  // (ketutup banner read-only duluan, lihat render di bawah).
  useEffect(() => {
    if (user?.role === 'sahabat_baitullah' || sumber !== 'sahabat_baitullah') return;
    const kode = referralKode.trim();
    setSahabatTerverifikasi(null);
    if (!kode) { setCekSahabatStatus(''); return; }
    setCekSahabatStatus('cek');
    const timer = setTimeout(() => {
      fetch('/api/referral-list/cek-sahabat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) { setSahabatTerverifikasi(d); setCekSahabatStatus(''); }
          else setCekSahabatStatus('invalid');
        })
        .catch(() => setCekSahabatStatus('invalid'));
    }, 400);
    return () => clearTimeout(timer);
  }, [referralKode, sumber, user?.role]);

  useEffect(() => {
    if (sumber !== 'perwakilan' || user?.role === 'perwakilan' || permanentReferrer) return;
    const kode = referralKode.trim();
    setPerwakilanTerverifikasi(null);
    if (!kode) { setCekPerwakilanStatus(''); return; }
    setCekPerwakilanStatus('cek');
    const timer = setTimeout(() => {
      fetch('/api/referral-list/cek-perwakilan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) { setPerwakilanTerverifikasi(d); setCekPerwakilanStatus(''); }
          else setCekPerwakilanStatus('invalid');
        })
        .catch(() => setCekPerwakilanStatus('invalid'));
    }, 400);
    return () => clearTimeout(timer);
  }, [referralKode, sumber, user?.role, permanentReferrer]);

  useEffect(() => {
    if (sumber !== 'agen') return;
    const kode = referralKode.trim();
    setAgenTerverifikasi(null);
    if (!kode) { setCekAgenStatus(''); return; }
    setCekAgenStatus('cek');
    const timer = setTimeout(() => {
      fetch('/api/referral-list/cek-agen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.valid) { setAgenTerverifikasi(d); setCekAgenStatus(''); }
          else setCekAgenStatus('invalid');
        })
        .catch(() => setCekAgenStatus('invalid'));
    }, 400);
    return () => clearTimeout(timer);
  }, [referralKode, sumber]);

  useEffect(() => {
    if (!user) return;

    // Ref perwakilan yang ketangkep dari link publik (program/[id],
    // programs, register) — auto-isi "Sumber Informasi" kalau jamaah belum
    // milih apa-apa manual, biar gak perlu ketik ulang kodenya (dikonfirmasi
    // user 2026-09-02). Perwakilan checkout sendiri (sumber sudah ke-set
    // dari lazy initializer di atas) TIDAK ditimpa — cek `sumber` masih
    // kosong dulu. Validitas kodenya diverifikasi oleh effect cek-perwakilan
    // di atas (debounce jalan otomatis begitu referralKode ke-set) — gak
    // perlu fetch daftar lengkap duluan buat cocokin (dikonfirmasi user
    // 2026-10-19, itu penyebab GET /api/referral-list expose semua nama
    // perwakilan ke publik).
    const ref = ambilRefPerwakilan();
    if (ref && !sumber) { setSumber('perwakilan'); setReferralKode(ref); }
    if (progId) {
      fetch('/api/programs')
        .then(r => r.json())
        .then(d => {
          const found = d.programs.find(p => p.id === progId);
          if (found) setProg(found);
          // Program gak ada di daftar (mis. udah lewat tanggal berangkat /
          // nonaktif) — jangan nyangkut di "Memuat program..." selamanya.
          else setProgTidakTersedia(true);
        });
    }
  }, [user, progId]);

  useEffect(() => {
    if (user?.role !== 'jamaah') return;
    fetch(`/api/profil?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.user?.perekrut_perwakilan_jamaah_id) {
          setPermanentReferrer({
            id: d.user.perekrut_perwakilan_jamaah_id,
            name: d.user.perekrut_perwakilan_jamaah_nama,
            kode_unik: d.user.perekrut_perwakilan_jamaah_kode,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  // Profil akun buat checkbox "Ini saya sendiri" di kartu jamaah #1 (step
  // Pilih Paket) — berlaku SEMUA role yang checkout (dikonfirmasi user
  // 2026-10-16, sebelumnya cuma Sahabat Baitullah), KECUALI admin/super_admin
  // (mereka booking BUAT ORANG LAIN, data identitas akun admin gak relevan
  // jadi jamaah).
  const [dataDiriSahabat, setDataDiriSahabat] = useState(null);
  useEffect(() => {
    if (!user?.id || user.role === 'admin' || user.role === 'super_admin') return;
    fetch(`/api/profil?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => setDataDiriSahabat({
        nama: d.user?.name || '',
        wa: d.user?.wa || '',
        jk: d.user?.jenis_kelamin || '',
        // Sama kayak checkout mandiri di bawah — alamat sahabat kesimpen di
        // alamat_domisili/alamat, bukan alamat_kirim.
        alamat: d.user?.alamat_kirim || d.user?.alamat_domisili || d.user?.alamat || '',
        nik: d.user?.nik || '',
        // Alamat Domisili TERSTRUKTUR (jalan/no rumah/RT-RW/dst) -- dipakai
        // checkbox "Salin dari Alamat Domisili" di kartu jamaah #1
        // (dikonfirmasi user 2026-10-19 -- domisili dipilih, BUKAN KTP,
        // karena domisili = tempat tinggal SEKARANG, lebih nyambung buat
        // alamat kirim paket). Kolom terstruktur ini baru ada sejak
        // migration 239 -- akun yang daftar SEBELUM itu & domisilinya beda
        // dari KTP gak kebawa (gak sempat kesimpen terstruktur, cuma
        // ke-backfill utk yang sama_ktp). null kalau belum ada -- checkbox
        // disembunyikan di kartu.
        domisili: d.user?.alamat_domisili_jalan ? {
          jalan: d.user.alamat_domisili_jalan, norumah: d.user.alamat_domisili_no_rumah || '',
          rt: d.user.alamat_domisili_rt || '', rw: d.user.alamat_domisili_rw || '',
          kel: d.user.alamat_domisili_kelurahan || '', kec: d.user.alamat_domisili_kecamatan || '',
          kota: d.user.alamat_domisili_kota || '', provinsi: d.user.alamat_domisili_provinsi || '',
          kp: d.user.alamat_domisili_kode_pos || '', negara: d.user.alamat_domisili_negara || 'Indonesia',
        } : null,
      }))
      .catch(() => setDataDiriSahabat({ nama: user.name || '', wa: '', jk: '', alamat: '', nik: '', domisili: null }));
  }, [user]);

  // Blokir checkbox "Ini saya sendiri" dari awal kalau NIK akun ini udah
  // kedaftar di booking aktif lain di program yang sama (dikonfirmasi user
  // 2026-10-16: "jegat dari awal", bukan nunggu kena alert pas submit).
  // Cek pakai endpoint yang sama dengan validasi final (/api/bookings/cek-nik),
  // jadi hasilnya konsisten sama yang bakal kejadian kalau tetap dipaksa submit.
  const [diriSendiriBookingId, setDiriSendiriBookingId] = useState(null);
  useEffect(() => {
    const nik = dataDiriSahabat?.nik?.trim();
    if (!progId || !nik) { setDiriSendiriBookingId(null); return; }
    fetch('/api/bookings/cek-nik', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prog_id: progId, niks: [nik] }),
    }).then(r => r.json())
      .then(d => setDiriSendiriBookingId(d.terpakai ? (d.booking_id || 'lain') : null))
      .catch(() => setDiriSendiriBookingId(null));
  }, [progId, dataDiriSahabat?.nik]);

  useEffect(() => {
    if (step !== 3) return;
    const interval = setInterval(() => {
      setTimer(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  useEffect(() => {
    if (!isMandiriSahabat) return;
    fetch(`/api/profil?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        setNoRekeningUmrohMandiri(d.user?.no_rekening_tabungan_umroh || '');
        // Autofill data diri CUMA kalau checkout buat diri sendiri (akun
        // Muslim) — akun non-Muslim selalu daftarin ORANG LAIN, isi manual
        // (dikonfirmasi user 2026-10-12).
        if (user.agama === 'non_islam') return;
        setNamaMandiri(d.user?.name || '');
        setWaMandiri(d.user?.wa || '');
        setJkMandiri(d.user?.jenis_kelamin || '');
        setNikMandiri(d.user?.nik || '');
        // alamat_kirim kosong buat Sahabat Baitullah -- daftar-sahabat gak
        // pernah nyimpen ke kolom itu (cuma dipakai form-jamaah/perwakilan),
        // alamat sahabat kesimpen di alamat_domisili/alamat (dikonfirmasi
        // user 2026-10-08, autofill sebelumnya selalu kosong akibat ini).
        setAlamatMandiri(d.user?.alamat_kirim || d.user?.alamat_domisili || d.user?.alamat || '');
      })
      .catch(() => {});
    fetch(`/api/sahabat/dashboard?sahabat_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        setSaldoInfo(d.ringkasan || null);
        if (d.voucher && !d.voucher.used) setVoucherMandiri(d.voucher);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMandiriSahabat]);

  // Bayar DP dari saldo tabungan umroh buat program REGULER DICABUT
  // (dikonfirmasi user 2026-10-15, lihat submitBooking) — useEffect fetch
  // saldoInfo khusus flow ini ikut dihapus. saldoInfo TETAP ada (dipakai
  // flow isMandiriSahabat/program EKSKLUSIF, effect terpisah di atas, gak
  // disentuh) jadi state-nya gak dihapus, cuma 1 dari 2 sumber datanya.
  const [passwordDpSaldo, setPasswordDpSaldo] = useState('');

  // Booking akun ini di program eksklusif yang sama (dikonfirmasi user
  // 2026-10-12) — cegah dari FE: masih ada yang belum lunas, ATAU orang yang
  // sama (nama) udah terdaftar. Server (checkout-mandiri) tetap ngecek ulang.
  const [bookingSamaProgram, setBookingSamaProgram] = useState([]);
  useEffect(() => {
    if (!isMandiriSahabat || !user?.id) return;
    fetch(`/api/bookings?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => setBookingSamaProgram((d.bookings || []).filter(b =>
        b.prog_id === progId && ['active', 'menunggu_batal'].includes(b.status) && b.user_id === user.id)))
      .catch(() => {});
  }, [isMandiriSahabat, user?.id, progId]);
  const normNama = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const bookingBelumLunasMandiri = bookingSamaProgram.find(b => b.pelunasan_status !== 'paid');
  const bookingNamaSamaMandiri = namaMandiri.trim() ? bookingSamaProgram.find(b => {
    const jd = typeof b.jamaah_data === 'string' ? (() => { try { return JSON.parse(b.jamaah_data); } catch { return []; } })() : b.jamaah_data;
    return Array.isArray(jd) && jd.some(j => j?.status_jamaah !== 'dibatalkan' && normNama(j?.nama) === normNama(namaMandiri));
  }) : null;
  // Diri sendiri (akun Muslim): kebaca dari booking milik sendiri yang
  // jamaahnya akun ini — blokir langsung. Orang lain (non-Muslim): kunci
  // utamanya NIK (dicek pas klik Lanjut), nama cuma peringatan.
  const blokirMandiri = bookingBelumLunasMandiri
    ? `Booking Anda sebelumnya di program ini (${bookingBelumLunasMandiri.id}) belum lunas. Checkout lagi baru bisa setelah booking tersebut lunas atau dibatalkan.`
    : (namaMandiriTerkunci && bookingNamaSamaMandiri)
      ? `Anda sudah terdaftar di program ini (booking ${bookingNamaSamaMandiri.id}). Satu orang tidak bisa didaftarkan dua kali di program yang sama.`
      : null;

  // Reminder non-blocking (dikonfirmasi user 2026-10-13): kalau akun ini
  // punya booking LAIN (program sama ATAU beda) yang DP-nya belum
  // dikonfirmasi admin, diingatkan di sini sebelum lanjut checkout baru —
  // supaya gak lupa follow-up pembayaran lama. Beda dari blokirMandiri di
  // atas (itu blocking, khusus checkout mandiri Program Eksklusif Sahabat
  // Baitullah) — ini cuma reminder, gak menghalangi checkout jalan terus.
  const [bookingDpPending, setBookingDpPending] = useState([]);
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/bookings?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => setBookingDpPending((d.bookings || []).filter(b =>
        b.dp_status === 'pending' && ['active', 'menunggu_batal'].includes(b.status))))
      .catch(() => {});
  }, [user?.id]);

  async function lanjutMandiri() {
    if (hargaMandiri <= 0) { alert('Kombinasi paket & kamar ini belum tersedia harganya. Pilih kombinasi lain.'); return; }
    if (!namaMandiri || !waMandiri || !jkMandiri || !alamatMandiri) { alert('Lengkapi data diri terlebih dahulu!'); return; }
    if (blokirMandiri) { alert(blokirMandiri); return; }
    const nik = nikMandiri.trim();
    if (!(tanpaNikMandiri && !namaMandiriTerkunci) && !/^\d{16}$/.test(nik)) {
      alert(namaMandiriTerkunci ? 'NIK di profil akun Anda belum ada / tidak valid. Hubungi admin untuk melengkapinya.' : 'NIK jamaah wajib 16 digit (atau centang "Belum punya KTP" untuk anak di bawah 17 tahun).');
      return;
    }
    if (!namaMandiriTerkunci && bookingNamaSamaMandiri &&
        !confirm(`Nama "${namaMandiri.trim()}" sudah terdaftar di booking ${bookingNamaSamaMandiri.id} pada program ini. Apakah ini orang yang BERBEDA?`)) return;
    if (nik) {
      setCekLanjutMandiri(true);
      try {
        const d = await fetch('/api/bookings/cek-nik', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prog_id: progId, niks: [nik] }),
        }).then(r => r.json());
        if (d.terpakai) {
          alert(`NIK ${d.terpakai} sudah terdaftar di program ini${d.booking_id ? ` (booking ${d.booking_id})` : ''}. Satu orang tidak bisa didaftarkan dua kali di program yang sama.`);
          return;
        }
      } catch { alert('Gagal mengecek NIK, coba lagi.'); return; }
      finally { setCekLanjutMandiri(false); }
    }
    setKonfirmasiDataMandiri(true);
  }

  const hargaMandiri = prog ? Number(prog[`harga_${paketMandiri}_${kamarKeyOf(kamarMandiri)}`] || 0) : 0;
  const voucherDiskonMandiri = voucherMandiri ? Math.min(Number(voucherMandiri.potongan || 0), hargaMandiri) : 0;
  const totalMandiri = Math.max(0, hargaMandiri - voucherDiskonMandiri);
  const saldoTersediaMandiri = Math.max(0, Number(saldoInfo?.saldo_tabungan_umroh || 0));
  // Saldo dipakai duluan; kalau kurang, sisanya lewat Transfer Langsung atau
  // Setor Mandiri (lihat metodeKurangMandiri). Angka di sini cuma TAMPILAN,
  // server (checkout-mandiri) tetap hitung & validasi ulang.
  const saldoCukupMandiri = saldoTersediaMandiri >= totalMandiri;
  const saldoDipakaiMandiri = saldoCukupMandiri ? totalMandiri : saldoTersediaMandiri;
  const kuranganMandiri = Math.max(0, totalMandiri - saldoTersediaMandiri);
  const transferLangsungMandiri = !saldoCukupMandiri && metodeKurangMandiri === 'transfer_langsung';
  const bisaSubmitMandiri = saldoCukupMandiri || (transferLangsungMandiri && !!buktiMandiri?.path);

  async function submitMandiri() {
    if (!bisaSubmitMandiri) { alert('Saldo belum cukup — pilih Transfer Langsung & unggah bukti transfer, atau Setor Mandiri dulu.'); return; }
    if (!setujuPotongSaldo) { alert('Centang dulu persetujuan pemotongan saldo di atas.'); return; }
    if (!passwordDpSaldo) { alert('Masukkan password akun Anda untuk konfirmasi.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/sahabat/checkout-mandiri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prog_id: progId,
          paket: paketMandiri, kamar: kamarMandiri,
          nama: namaMandiri, wa: waMandiri, jk: jkMandiri, alamat: alamatMandiri,
          nik: tanpaNikMandiri && !namaMandiriTerkunci ? '' : nikMandiri.trim(),
          tanpa_nik: tanpaNikMandiri && !namaMandiriTerkunci,
          voucher_kode: voucherMandiri?.kode || null,
          password: passwordDpSaldo,
          metode: transferLangsungMandiri ? 'transfer_langsung' : null,
          bukti_path: transferLangsungMandiri ? buktiMandiri?.path : null,
          bukti_nama: transferLangsungMandiri ? buktiMandiri?.nama : null,
        })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); setLoading(false); return; }
      setHasilMandiri(data);
      setPasswordDpSaldo('');
      setBookingIds([data.booking_id]);
      setStep(3);
    } catch (e) {
      alert('Terjadi kesalahan'); setLoading(false);
    }
  }

  async function submitBooking() {
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          prog_id: progId,
          // 1 kartu = 1 jamaah sekarang (dikonfirmasi user 2026-10-16) --
          // tiap field dibungkus array panjang-1, formatnya tetap sama
          // persis yang diterima /api/bookings/batch (gak ada perubahan
          // backend sama sekali).
          items: cart.map(c => ({
            paket: c.paket, kamar: c.kamar, jumlah_jamaah: 1,
            namas: [c.nama], was: [c.wa], jks: [c.jk], alamats: [c.alamat],
            niks: [c.tanpaNik ? '' : c.nik], untuk_diri_sendiri: !!c.diriSendiri,
            harga_custom_per_jamaah: c.hargaCustom || null,
            customHotel: c.customHotel || null,
            opsi_tambahan_ids: (c.opsiTambahan || []).map(o => o.id),
          })),
          kode_unik_dp: 0,
          // Checkout program REGULER selalu transfer manual (dikonfirmasi
          // user 2026-10-15, dicabut: bayar DP dari saldo tabungan umroh —
          // itu duit khusus target program eksklusif, bukan metode bayar
          // buat program lain). Checkout mandiri program EKSKLUSIF (beda
          // flow, submitMandiri di bawah) sama sekali gak disentuh.
          bukti_path: buktiPath,
          bukti_nama: buktiNama,
          voucher_kode: summary.voucherKode,
          // Referral: menentukan siapa penerima komisi. Untuk jamaah dengan
          // referral permanen, nilai ini murni ADVISORY — server
          // (buatSatuBooking) SELALU memaksa pakai users.perekrut_perwakilan_jamaah_id,
          // apapun yang dikirim di sini, jadi gak bisa dimanipulasi dari client.
          sumber_info: sumber,
          referral_kode: referralKode,
          referral_perw_id: user.role === 'perwakilan' ? user.id
            : permanentReferrer ? permanentReferrer.id
            : sumber === 'perwakilan' ? (perwakilanTerverifikasi?.id || null) : null,
          referral_sahabat_id: user.role === 'sahabat_baitullah' ? user.id
            : sumber === 'sahabat_baitullah' ? (sahabatTerverifikasi?.id || null) : null,
          // Link referral agen (dikonfirmasi user 2026-10-17) — awalnya
          // murni tag invisible dari localStorage (/a/[kode]). Sekarang
          // ADA fallback manual juga (dikonfirmasi user 2026-10-19, lihat
          // kolom "Kode Referral Agen" di atas) — buat jamaah yang checkout
          // ULANG tanpa lewat link lagi (tag localStorage ilang, beda
          // device/browser, dst), pilihan manual MENANG dari tag
          // localStorage kalau dua-duanya ada.
          referral_agen_id: sumber === 'agen' && agenTerverifikasi
            ? agenTerverifikasi.id
            : (ambilRefAgenId() || undefined),
          // Dulu cuma dikirim /order-jamaah (sekarang dilebur ke sini,
          // dikonfirmasi user 2026-09-27) — tanpa ini, booking yang
          // diorderkan perwakilan/sahabat/admin lewat checkout salah
          // tercatat "jamaah" di kolom "Dipesan Oleh (Role)" laporan admin.
          ordered_by: user.id,
          ordered_by_role: user.role,
        })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); setLoading(false); return; }
      setBookingIds(data.bookings.map(b => b.booking_id));
      trackLead({ value: summary.totalDp, currency: 'IDR', sumber_info: sumber });
      setStep(4);
    } catch (e) {
      alert('Terjadi kesalahan'); setLoading(false);
    }
  }

  const timerFmt = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  const totalDP = (prog?.dp || 0) * cart.length;

  // Setelah submit (step 4) yang aktif "Verifikasi Admin" — DP belum
  // beneran beres sampai admin konfirmasi (maks 1×24 jam), "Selesai" baru
  // tercapai sesudahnya (dikonfirmasi user 2026-10-12).
  const steps = ['Detail', 'Pilih Paket', 'Bayar DP', 'Verifikasi Admin', 'Selesai'];

  if (progTidakTersedia) return (
    <Layout title="🛒 Checkout" backHref="/programs">
      <div className="max-w-md mx-auto bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <div className="text-3xl mb-2">🕌</div>
        <h3 className="font-bold text-[#0E2F6E] mb-1">Program Tidak Tersedia</h3>
        <p className="text-sm text-gray-500">Program ini sudah berangkat / selesai atau tidak lagi dibuka untuk pendaftaran.</p>
      </div>
    </Layout>
  );
  if (!user || !prog) return (
    <Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat program...</div></Layout>
  );

  // Perwakilan/sahabat yang belum di-ACC admin belum boleh checkout —
  // blokir di awal, jangan biarkan isi form dulu baru gagal di submit akhir
  // (cekPemesanBolehOrder di server nolak hal yang sama, ini cuma UX lebih
  // awal / jaring pengaman kalau halaman ini diakses langsung lewat URL,
  // bukan lewat tombol "Daftar Program Ini Sekarang" yang udah ngeblok
  // duluan).
  //
  // Verifikasi akun jamaah (terverifikasi) SENGAJA TIDAK lagi ngeblok di
  // sini (dikonfirmasi user 2026-10-14, dicabut — sebelumnya jamaah yang
  // mau langsung bayar DP kena blokir nunggu admin verifikasi dulu, bikin
  // lead dingin & kehilangan minat). Samain sama server di cekPemesanBolehOrder.
  if (!statusTerkini) return (
    <Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat program...</div></Layout>
  );
  if (['perwakilan', 'sahabat_baitullah'].includes(user?.role) && statusTerkini.status !== 'active') {
    return (
      <Layout title="🛒 Checkout" backHref="/programs">
        <div className="max-w-md mx-auto bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">⏳</div>
          <h3 className="font-bold text-yellow-800 mb-1">Akun Anda Belum Dikonfirmasi Admin</h3>
          <p className="text-sm text-yellow-700">
            Akun {user.role} Anda masih menunggu ACC admin. Anda belum bisa checkout sampai akun ini aktif.
          </p>
        </div>
      </Layout>
    );
  }

  // Checkout Mandiri Program Sahabat Baitullah — alur terpisah total dari
  // checkout biasa di bawah: 1 orang (diri sendiri), gak ada tahap DP,
  // dibayar dari saldo tabungan (wajib dipakai duluan) + sisa pribadi kalau
  // saldo belum cukup (dikonfirmasi user 2026-08-29).
  if (isMandiriSahabat) {
    const stepsMandiri = ['Pilih Paket', 'Pembayaran', 'Selesai'];
    const paketOpsi = [
      { key: 'deluxe', label: '⭐⭐⭐ Deluxe' },
      { key: 'eksekutif', label: '⭐⭐⭐⭐ Eksekutif' },
      { key: 'signature', label: '⭐⭐⭐⭐⭐ Signature' },
    ];
    const kamarOpsi = ['Quad (4/Kamar)', 'Triple (3/Kamar)', 'Double (2/Kamar)'];

    return (
      <Layout title="🛒 Checkout — Program Sahabat Baitullah" backHref="/programs" confirmLeave={isDirty}
        confirmMessage="Yakin ingin keluar? Data booking yang sedang diisi akan hilang.">
        <div className="max-w-2xl mx-auto">

          <div className="flex items-center mb-8">
            {stepsMandiri.map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i + 1 < step ? 'bg-[#C9952A] text-white' :
                    i + 1 === step ? 'bg-[#1A4FA0] text-white' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {i + 1 < step ? '✓' : i + 1}
                  </div>
                  <div className={`text-[10px] mt-1 text-center ${i + 1 === step ? 'text-[#1A4FA0] font-semibold' : 'text-gray-400'}`}>{s}</div>
                </div>
                {i < stepsMandiri.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-4 ${i + 1 < step ? 'bg-[#C9952A]' : 'bg-gray-200'}`}></div>
                )}
              </div>
            ))}
          </div>

          {/* STEP 1 — Pilih paket & data diri (checkout buat DIRI SENDIRI) */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6">
                <div className="text-xs opacity-75 mb-1">{prog.type} · {prog.durasi} Hari</div>
                <div className="text-xl font-bold mb-1">{prog.name}</div>
                <div className="text-sm opacity-85">{prog.highlight}</div>
              </div>

              <div className="bg-purple-50 border-2 border-[#C9952A] rounded-xl p-4 text-sm text-purple-700">
                🌟 Checkout Program Sahabat Baitullah untuk diri sendiri — pembayaran otomatis diambil dari saldo tabungan umroh Anda.
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#0E2F6E] text-sm">Pilih Paket</div>
                <div className="grid grid-cols-1 gap-2">
                  {paketOpsi.map(pk => {
                    const harga = Number(prog[`harga_${pk.key}_${kamarKeyOf(kamarMandiri)}`] || 0);
                    const tersedia = harga > 0;
                    return (
                      <div key={pk.key}
                        onClick={() => tersedia && setPaketMandiri(pk.key)}
                        className={`rounded-xl p-3 border-2 flex items-center justify-between ${
                          !tersedia ? 'border-gray-100 opacity-40 cursor-not-allowed' :
                          paketMandiri === pk.key ? 'border-[#1A4FA0] bg-[#E8F0FB] cursor-pointer' : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                        }`}>
                        <div className="text-sm font-semibold text-[#0E2F6E]">{pk.label}</div>
                        <div className="text-sm font-bold text-[#0E2F6E]">{tersedia ? `Rp ${harga.toLocaleString('id-ID')}` : 'Belum tersedia'}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="font-bold text-[#0E2F6E] text-sm pt-1">Pilih Tipe Kamar</div>
                <div className="grid grid-cols-3 gap-2">
                  {kamarOpsi.map(k => (
                    <div key={k} onClick={() => setKamarMandiri(k)}
                      className={`text-center text-xs font-semibold rounded-lg p-2 border-2 cursor-pointer ${
                        kamarMandiri === k ? 'border-[#1A4FA0] bg-[#E8F0FB] text-[#1A4FA0]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {k}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#0E2F6E] text-sm">{namaMandiriTerkunci ? 'Data Diri' : 'Data Jamaah yang Didaftarkan'}</div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nama Lengkap *</label>
                  <input value={namaMandiri} onChange={e => setNamaMandiri(e.target.value)} disabled={namaMandiriTerkunci}
                    className={`w-full px-3 py-2 rounded-lg border-2 text-sm ${namaMandiriTerkunci
                      ? 'border-gray-100 bg-gray-50 text-gray-500 cursor-not-allowed'
                      : 'border-gray-200 focus:border-[#1A4FA0] focus:outline-none'}`} />
                  {namaMandiriTerkunci && (
                    <div className="text-[10px] text-gray-400 mt-1">Program Eksklusif Sahabat Baitullah cuma bisa didaftarkan untuk diri sendiri.</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">No. WhatsApp *</label>
                  <input value={waMandiri} onChange={e => setWaMandiri(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric" maxLength={13}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">NIK (No. KTP) {tanpaNikMandiri ? '' : '*'}</label>
                  <input value={nikMandiri} onChange={e => setNikMandiri(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    disabled={namaMandiriTerkunci || tanpaNikMandiri} inputMode="numeric" maxLength={16}
                    placeholder={tanpaNikMandiri ? 'Belum punya KTP' : '16 digit sesuai KTP'}
                    className={`w-full px-3 py-2 rounded-lg border-2 text-sm ${namaMandiriTerkunci || tanpaNikMandiri
                      ? 'border-gray-100 bg-gray-50 text-gray-500 cursor-not-allowed'
                      : 'border-gray-200 focus:border-[#1A4FA0] focus:outline-none'}`} />
                  {namaMandiriTerkunci ? (
                    <div className="text-[10px] text-gray-400 mt-1">Sesuai profil akun Anda — dipakai untuk mencegah pendaftaran ganda.</div>
                  ) : (
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1 cursor-pointer">
                      <input type="checkbox" checked={tanpaNikMandiri} className="w-3.5 h-3.5 accent-[#1A4FA0]"
                        onChange={e => { setTanpaNikMandiri(e.target.checked); if (e.target.checked) setNikMandiri(''); }} />
                      Belum punya KTP (usia di bawah 17 tahun)
                    </label>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Jenis Kelamin *</label>
                  <select value={jkMandiri} onChange={e => setJkMandiri(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                    <option value="">-- Pilih --</option>
                    <option value="Laki-Laki">Laki-Laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Alamat Pengiriman Perlengkapan Umroh *</label>
                  <textarea value={alamatMandiri} onChange={e => setAlamatMandiri(e.target.value)} rows={2}
                    placeholder="Alamat lengkap untuk pengiriman koper, seragam, dan perlengkapan umroh lainnya"
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                </div>
              </div>

              {blokirMandiri && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {blokirMandiri}</div>
              )}

              <button
                onClick={lanjutMandiri}
                disabled={!!blokirMandiri || cekLanjutMandiri}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {cekLanjutMandiri ? 'Mengecek data...' : 'Lanjut ke Pembayaran →'}
              </button>

              {konfirmasiDataMandiri && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setKonfirmasiDataMandiri(false)}>
                  <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                    <div className="text-center mb-4">
                      <div className="text-4xl mb-2">⚠️</div>
                      <div className="font-bold text-lg text-[#0E2F6E]">Pastikan Data Sudah Benar</div>
                      <div className="text-xs text-gray-500 mt-1">Periksa kembali data di bawah sebelum lanjut ke pembayaran. Data ini dipakai untuk pendaftaran umroh & pengiriman perlengkapan Anda.</div>
                    </div>
                    <div className="bg-[#E8F0FB] rounded-xl p-4 space-y-2 text-sm">
                      {[
                        { label: 'Program', val: prog.name },
                        { label: 'Paket', val: `${paketOpsi.find(pk => pk.key === paketMandiri)?.label || paketMandiri} · ${kamarMandiri}` },
                        { label: 'Harga', val: `Rp ${hargaMandiri.toLocaleString('id-ID')}` },
                        { label: 'Nama Lengkap', val: namaMandiri },
                        { label: 'No. WhatsApp', val: waMandiri },
                        { label: 'NIK', val: nikMandiri || 'Belum punya KTP' },
                        { label: 'Jenis Kelamin', val: jkMandiri },
                        { label: 'Alamat Pengiriman', val: alamatMandiri },
                      ].map(f => (
                        <div key={f.label} className="flex justify-between items-start gap-4">
                          <span className="text-gray-500 shrink-0">{f.label}</span>
                          <span className="font-semibold text-[#0E2F6E] text-right leading-snug break-words min-w-0">{f.val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-5">
                      <button onClick={() => setKonfirmasiDataMandiri(false)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors text-sm">
                        Periksa Lagi
                      </button>
                      <button onClick={() => { setKonfirmasiDataMandiri(false); setStep(2); }}
                        className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors text-sm">
                        Ya, Data Sudah Benar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — Ringkasan pembayaran: saldo dulu, kalau kurang pilih
              Transfer Langsung (sisa ke rekening JM Travel) / Setor Mandiri */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-[#E8F0FB] rounded-xl p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-3">📋 Ringkasan Pembayaran</div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Program</span><span className="font-semibold text-[#0E2F6E]">{prog.name}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span className="capitalize">{paketMandiri} · {kamarMandiri}</span>
                  <span className="font-semibold text-[#0E2F6E]">Rp {hargaMandiri.toLocaleString('id-ID')}</span>
                </div>
                {voucherMandiri && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Voucher {voucherMandiri.kode}</span><span>−Rp {voucherDiskonMandiri.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                  <span className="text-gray-500">Total Harga</span><span className="font-bold text-[#0E2F6E]">Rp {totalMandiri.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-sm text-purple-600">
                  <span>Saldo Tabungan Tersedia</span><span className="font-semibold">Rp {saldoTersediaMandiri.toLocaleString('id-ID')}</span>
                </div>
                <div className="border-t border-blue-200 pt-2 flex justify-between font-bold">
                  <span className="text-sm">{saldoCukupMandiri ? 'Dipakai dari Saldo (Pelunasan Penuh)' : 'Dipakai dari Saldo'}</span>
                  <span className="text-purple-700">−Rp {saldoDipakaiMandiri.toLocaleString('id-ID')}</span>
                </div>
                {!saldoCukupMandiri && (
                  <div className="flex justify-between font-bold">
                    <span className="text-sm">Kekurangan</span>
                    <span className="text-red-600">Rp {kuranganMandiri.toLocaleString('id-ID')}</span>
                  </div>
                )}
              </div>

              {!saldoCukupMandiri && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3">
                  <div>
                    <div className="font-bold text-red-700 text-sm">⚠️ Saldo Tabungan Umroh Belum Cukup</div>
                    <div className="text-xs text-red-600">Kurang <b>Rp {kuranganMandiri.toLocaleString('id-ID')}</b> lagi dari total harga. Pilih cara melunasi kekurangannya:</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { key: 'transfer_langsung', judul: '💸 Transfer Langsung', ket: `Saldo dipakai semua, sisa Rp ${kuranganMandiri.toLocaleString('id-ID')} ditransfer ke rekening JM Travel. Checkout bisa diselesaikan sekarang.` },
                      { key: 'setor_mandiri', judul: '🏦 Setor Mandiri', ket: 'Setor kekurangannya ke rekening tabungan umroh Anda sendiri, lanjutkan checkout setelah saldo cukup.' },
                    ].map(o => (
                      <button key={o.key} type="button"
                        onClick={() => { setMetodeKurangMandiri(o.key); if (o.key !== 'transfer_langsung') setBuktiMandiri(null); }}
                        className={`text-left rounded-xl p-3 border-2 bg-white transition-colors ${
                          metodeKurangMandiri === o.key ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className="text-sm font-bold text-[#0E2F6E]">{o.judul}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{o.ket}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!saldoCukupMandiri && metodeKurangMandiri === 'setor_mandiri' && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-2">
                  <div className="text-xs text-gray-500">
                    Setor kekurangannya (<b>Rp {kuranganMandiri.toLocaleString('id-ID')}</b>) ke rekening tabungan umroh Anda sendiri:
                  </div>
                  {noRekeningUmrohMandiri && (
                    <div className="bg-gray-50 rounded-lg p-2.5 text-sm font-bold text-[#0E2F6E] text-center">{noRekeningUmrohMandiri}</div>
                  )}
                  <div className="text-xs text-gray-500">Sudah transfer? Unggah bukti transfernya di <button onClick={() => router.push('/dashboard/sahabat/riwayat?tab=cashflow')} className="text-[#1A4FA0] font-bold underline">Riwayat Tabungan Umroh</button> biar admin bisa langsung verifikasi & menambah saldo Anda — kembali ke sini untuk melanjutkan checkout setelah saldo cukup.</div>
                </div>
              )}

              {(saldoCukupMandiri || transferLangsungMandiri) && (
                <>
                  <div className="bg-[#FEF3DC] border border-[#C9952A] rounded-xl p-4 text-sm text-[#8a6516]">
                    ℹ️ Tidak ada tahap DP di jalur ini — booking langsung dianggap lunas penuh begitu {transferLangsungMandiri ? 'pemakaian saldo & transfer sisa' : 'pemakaian saldo'} di-ACC admin.
                  </div>
                  {/* Rekening tujuan saldo & transfer sisa SAMA (rekening JM
                      Travel) — Transfer Langsung cukup 1 kartu di bawah. */}
                  {!transferLangsungMandiri && saldoDipakaiMandiri > 0 && (
                    <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-4 space-y-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">🏦 Tabungan Umroh Anda Akan Dibayarkan Ke</div>
                      {metodePembayaran.map(m => (
                        <div key={m.id} className="text-sm text-gray-500 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                          <div className="font-bold text-[#0E2F6E]">{m.nama}</div>
                          {m.nomor && <div className="flex justify-between"><span>No. Rekening</span><span className="font-bold text-[#0E2F6E]">{m.nomor}</span></div>}
                          {m.atas_nama && <div className="flex justify-between"><span>Atas Nama</span><span className="font-bold text-[#0E2F6E]">{m.atas_nama}</span></div>}
                        </div>
                      ))}
                      <div className="text-xs text-gray-400 pt-1">Untuk pelunasan Program Umroh ini — Anda tidak perlu transfer apa pun, admin yang memprosesnya begitu pemakaian saldo dikonfirmasi.</div>
                    </div>
                  )}
                  {transferLangsungMandiri && (
                    <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-4 space-y-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">🏦 Rekening Tujuan Pembayaran</div>
                      {metodePembayaran.map(m => (
                        <div key={m.id} className="text-sm text-gray-500 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                          <div className="font-bold text-[#0E2F6E]">{m.nama}</div>
                          {m.nomor && <div className="flex justify-between"><span>No. Rekening</span><span className="font-bold text-[#0E2F6E]">{m.nomor}</span></div>}
                          {m.atas_nama && <div className="flex justify-between"><span>Atas Nama</span><span className="font-bold text-[#0E2F6E]">{m.atas_nama}</span></div>}
                          {m.catatan && <div className="text-xs text-gray-400 mt-0.5">{m.catatan}</div>}
                        </div>
                      ))}
                      <div className="border-t border-gray-100 pt-2 space-y-1">
                        {saldoDipakaiMandiri > 0 && (
                          <div className="flex justify-between text-sm text-gray-500">
                            <span>Dari Saldo Tabungan <span className="text-[10px] text-gray-400">(diproses admin)</span></span>
                            <span className="font-semibold text-purple-700">Rp {saldoDipakaiMandiri.toLocaleString('id-ID')}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold">
                          <span className="text-sm">Transfer Tepat</span>
                          <span className="text-red-600">Rp {kuranganMandiri.toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                      <UploadBukti
                        onUploaded={(path, nama) => setBuktiMandiri({ path, nama })}
                        label="Klik untuk upload bukti transfer sisa pembayaran"
                      />
                    </div>
                  )}
                  <label className="flex items-start gap-2 bg-gray-50 rounded-xl p-3 cursor-pointer">
                    <input type="checkbox" checked={setujuPotongSaldo} onChange={e => setSetujuPotongSaldo(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#1A4FA0] flex-shrink-0" />
                    <span className="text-xs text-gray-600">
                      Saya setuju saldo tabungan umroh saya sebesar <b>Rp {saldoDipakaiMandiri.toLocaleString('id-ID')}</b> dipotong
                      &amp; ditransfer ke rekening JM Travel untuk pembayaran program ini, sesuai Surat Kuasa Kerjasama Multi CIF
                      &amp; Surat Pernyataan Kuasa Blokir Rekening yang telah saya setujui.
                      {transferLangsungMandiri && <> Sisanya sebesar <b>Rp {kuranganMandiri.toLocaleString('id-ID')}</b> saya bayar lewat transfer langsung.</>}
                    </span>
                  </label>
                  <div className="bg-white border-2 border-gray-200 rounded-xl p-3 space-y-1">
                    <label className="block text-xs font-semibold text-[#0E2F6E]">🔒 Konfirmasi Password Akun *</label>
                    <input type="password" value={passwordDpSaldo} onChange={e => setPasswordDpSaldo(e.target.value)}
                      autoComplete="current-password" placeholder="Masukkan password akun Anda"
                      className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
                    <div className="text-[10px] text-gray-400">Demi keamanan, pemotongan saldo wajib dikonfirmasi dengan password akun.</div>
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setStep(1); setSetujuPotongSaldo(false); setPasswordDpSaldo(''); setMetodeKurangMandiri(''); setBuktiMandiri(null); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
                  ← Kembali
                </button>
                <button onClick={submitMandiri} disabled={loading || !bisaSubmitMandiri || !setujuPotongSaldo || !passwordDpSaldo}
                  className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? 'Memproses...' : !saldoCukupMandiri && !metodeKurangMandiri ? 'Pilih Cara Bayar Dulu' : !saldoCukupMandiri && metodeKurangMandiri === 'setor_mandiri' ? 'Saldo Belum Cukup' : !bisaSubmitMandiri ? 'Upload bukti transfer dulu' : !setujuPotongSaldo ? 'Centang persetujuan dulu' : !passwordDpSaldo ? 'Masukkan password dulu' : 'Selesaikan Pendaftaran'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Selesai */}
          {step === 3 && (
            <div className="text-center space-y-4 py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-[#0E2F6E]">Pendaftaran Terkirim!</h2>
              <p className="text-gray-400 text-sm">Admin akan verifikasi pemakaian saldo{Number(hasilMandiri?.sisa_transfer || 0) > 0 ? ' & bukti transfer' : ''} dalam 1×24 jam kerja.</p>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left space-y-1">
                <div className="text-sm text-green-600">Program: {prog.name}</div>
                <div className="font-bold text-green-800">Booking: {hasilMandiri?.booking_id}</div>
                <div className="text-sm text-green-700 pt-1">Dipakai dari saldo: Rp {Number(hasilMandiri?.saldo_dipakai || 0).toLocaleString('id-ID')}</div>
                {Number(hasilMandiri?.sisa_transfer || 0) > 0 && (
                  <div className="text-sm text-green-700">Transfer langsung: Rp {Number(hasilMandiri.sisa_transfer).toLocaleString('id-ID')}</div>
                )}
                <span className="inline-block bg-[#FEF3DC] text-[#7a5500] text-xs font-bold px-3 py-1 rounded-full mt-1">⏳ Menunggu Konfirmasi Admin</span>
              </div>
              {/* Status booking (progress DP/pelunasan, dokumen, dst) belum
                  pernah kelihatan di mana pun buat akun Sahabat Baitullah
                  (dikonfirmasi gap dari pertanyaan user 2026-09-29) —
                  /dashboard/jamaah sebenarnya generik by user_id (fetch
                  /api/bookings?user_id=), gak digate role, jadi tinggal
                  diarahkan kesini, gak perlu bikin halaman status baru. */}
              <button onClick={() => router.push('/dashboard/jamaah')}
                className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
                Lihat Status Booking →
              </button>
              <button onClick={() => router.push('/dashboard/sahabat')}
                className="w-full text-[#1A4FA0] font-semibold text-sm py-1">
                Ke Beranda Sahabat Baitullah →
              </button>
            </div>
          )}

        </div>
      </Layout>
    );
  }

  return (
    <Layout title="🛒 Checkout" backHref="/programs" confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Data booking yang sedang diisi akan hilang.">
      <div className="max-w-2xl mx-auto">

        {/* Steps */}
        <div className="flex items-center mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i + 1 < step ? 'bg-[#C9952A] text-white' :
                  i + 1 === step ? 'bg-[#1A4FA0] text-white' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {i + 1 < step ? '✓' : i + 1}
                </div>
                <div className={`text-[10px] mt-1 text-center ${i + 1 === step ? 'text-[#1A4FA0] font-semibold' : 'text-gray-400'}`}>{s}</div>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 ${i + 1 < step ? 'bg-[#C9952A]' : 'bg-gray-200'}`}></div>
              )}
            </div>
          ))}
        </div>

        {/* Reminder DP booking lain yang belum dikonfirmasi — non-blocking,
            cuma muncul di step 1 biar gak ganggu alur isi data. */}
        {step === 1 && bookingDpPending.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700 mb-4">
            ⚠️ Anda masih punya {bookingDpPending.length > 1 ? `${bookingDpPending.length} booking` : 'booking'} yang DP-nya belum dikonfirmasi admin:{' '}
            {bookingDpPending.map(b => `${b.prog_name || b.id} (${b.id})`).join(', ')}. Pastikan sudah transfer agar tidak lupa, sebelum membuat booking baru.
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6">
              <div className="text-xs opacity-75 mb-1">{prog.type} · {prog.durasi} Hari</div>
              <div className="text-xl font-bold mb-1">{prog.name}</div>
              <div className="text-sm opacity-85">{prog.highlight}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Keberangkatan', val: prog.tanggal },
                { label: 'Durasi', val: prog.durasi + ' Hari' },
                { label: 'Seat Tersisa', val: (prog.total_seat - prog.used_seat) + ' seat' },
                // Rupiah penuh, bukan "X jt" dibuletin -- DP di bawah 500rb
                // dulu kebaca "Rp 0 jt", 2,5jt jadi "Rp 3 jt".
                { label: 'DP/Jamaah', val: 'Rp ' + Number(prog.dp || 0).toLocaleString('id-ID') },
              ].map(item => (
                <div key={item.label} className="bg-[#E8F0FB] rounded-xl p-3">
                  <div className="text-xs text-gray-400">{item.label}</div>
                  <div className="font-bold text-[#0E2F6E] text-sm mt-0.5">{item.val}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {['✈️ Tiket PP', '🛂 Visa', '🚌 Transport', '🧳 Bagasi 2x23kg', '💧 Zamzam 5L', '🍗 Al Baik'].map(f => (
                <span key={f} className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">{f}</span>
              ))}
            </div>
            {metodePembayaran.length > 0 && (
              <div className="bg-[#E8F0FB] border border-blue-200 rounded-xl p-4 text-sm text-[#1A4FA0]">
                <div className="font-bold mb-1">⚠️ Pembayaran hanya via:</div>
                {metodePembayaran.map(m => (
                  <div key={m.id}>{m.nama}{m.nomor ? ` — ${m.nomor}` : ''}</div>
                ))}
              </div>
            )}

            {/* SUMBER INFORMASI — wajib, menentukan penerima komisi.
                Perwakilan yang checkout untuk diri sendiri di-skip:
                closing otomatis tercatat ke akun mereka sendiri. Jamaah
                dengan referral permanen (dikunci sejak registrasi) juga
                di-skip dari dropdown — gak ada gunanya nanya lagi kalau
                jawabannya udah gak bisa diubah. */}
            {user?.role === 'perwakilan' ? (
              <div className="rounded-xl p-4 text-sm border-2 bg-purple-50 text-purple-700 border-[#C9952A]">
                {`🏢 Checkout sebagai Perwakilan — closing otomatis tercatat ke akun Anda (${user.name}, ${user.kode_unik})`}
              </div>
            ) : permanentReferrer ? (
              <div className="rounded-xl p-4 text-sm border-2 bg-amber-50 text-amber-700 border-amber-300">
                {`📌 Referral Anda terkunci ke ${permanentReferrer.name} (${permanentReferrer.kode_unik}) sejak pendaftaran akun — tidak bisa diubah.`}
              </div>
            ) : (
            <div className="bg-white border-2 border-[#C9952A] rounded-xl p-4 space-y-3">
              <div>
                <div className="font-bold text-[#0E2F6E] text-sm">📣 Dari mana Anda mengetahui JM Travel?</div>
                <div className="text-xs text-gray-400 mt-0.5">Wajib diisi. Menentukan pencatatan referensi pendaftaran Anda.</div>
              </div>

              <select value={sumber}
                onChange={e => {
                  setSumber(e.target.value);
                  // Akun Sahabat yang pilih "Jamaah Sahabat Baitullah" otomatis
                  // pakai kode miliknya sendiri (kolom kode dikunci di bawah).
                  setReferralKode(user?.role === 'sahabat_baitullah' && e.target.value === 'sahabat_baitullah' ? (user.kode_unik || '') : '');
                }}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                <option value="">-- Pilih --</option>
                <option value="perwakilan">Perwakilan JM Travel</option>
                <option value="sahabat_baitullah">Jamaah Sahabat Baitullah</option>
                <option value="agen">Agen JM Travel</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="teman">Rekomendasi Teman / Keluarga</option>
                <option value="website">Website JM Travel</option>
                <option value="langsung_kantor">Langsung ke Kantor</option>
                <option value="lainnya">Lainnya</option>
              </select>

              {sumber === 'perwakilan' && (
                <div>
                  <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Kode Referral Perwakilan *</label>
                  <input
                    value={referralKode}
                    onChange={e => setReferralKode(e.target.value.toUpperCase())}
                    placeholder="Contoh: PJM0002"
                    className={`w-full px-3 py-2 rounded-lg border-2 focus:outline-none text-sm ${cekPerwakilanStatus === 'invalid' ? 'border-red-300' : 'border-gray-200 focus:border-[#1A4FA0]'}`}
                  />
                  {cekPerwakilanStatus === 'cek' && <div className="text-[10px] text-gray-400 mt-1">Mengecek kode...</div>}
                  {cekPerwakilanStatus === 'invalid' && <div className="text-[10px] text-red-500 mt-1">Kode tidak ditemukan. Tanyakan kode referral ke Perwakilan yang mengajak Anda.</div>}
                  {perwakilanTerverifikasi && <div className="text-[10px] text-green-600 mt-1">✓ {perwakilanTerverifikasi.nama} ({perwakilanTerverifikasi.kode_unik})</div>}
                </div>
              )}

              {sumber === 'agen' && (
                <div>
                  <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Kode Referral Agen *</label>
                  <input
                    value={referralKode}
                    onChange={e => setReferralKode(e.target.value)}
                    placeholder="Contoh: ida-kuraeny"
                    className={`w-full px-3 py-2 rounded-lg border-2 focus:outline-none text-sm ${cekAgenStatus === 'invalid' ? 'border-red-300' : 'border-gray-200 focus:border-[#1A4FA0]'}`}
                  />
                  {cekAgenStatus === 'cek' && <div className="text-[10px] text-gray-400 mt-1">Mengecek kode...</div>}
                  {cekAgenStatus === 'invalid' && <div className="text-[10px] text-red-500 mt-1">Kode tidak ditemukan. Tanyakan kode referral ke Agen yang mengajak Anda.</div>}
                  {agenTerverifikasi && <div className="text-[10px] text-green-600 mt-1">✓ {agenTerverifikasi.nama} ({agenTerverifikasi.kode_unik})</div>}
                </div>
              )}

              {sumber === 'sahabat_baitullah' && user?.role === 'sahabat_baitullah' && (
                // Dropdown sumber tetap bebas dipilih; yang dikunci cuma kode
                // referral-nya — akun Sahabat gak bisa atas-namakan anggota lain.
                <div>
                  <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Kode Referral Sahabat Baitullah</label>
                  <input value={`${user.kode_unik || ''} — ${user.name}`} readOnly disabled
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 bg-gray-50 text-gray-500 text-sm cursor-not-allowed" />
                  <div className="text-[10px] text-gray-400 mt-1">🔒 Terkunci ke akun Anda sendiri.</div>
                </div>
              )}

              {sumber === 'sahabat_baitullah' && user?.role !== 'sahabat_baitullah' && (
                <div>
                  <label className="block text-xs font-semibold text-[#0E2F6E] mb-1">Kode Referral Sahabat Baitullah *</label>
                  <input
                    value={referralKode}
                    onChange={e => setReferralKode(e.target.value.toUpperCase())}
                    placeholder="Contoh: SBJM0002 atau 6X8AEVY"
                    className={`w-full px-3 py-2 rounded-lg border-2 focus:outline-none text-sm ${cekSahabatStatus === 'invalid' ? 'border-red-300' : 'border-gray-200 focus:border-[#1A4FA0]'}`}
                  />
                  {cekSahabatStatus === 'cek' && <div className="text-[10px] text-gray-400 mt-1">Mengecek kode...</div>}
                  {cekSahabatStatus === 'invalid' && <div className="text-[10px] text-red-500 mt-1">Kode tidak ditemukan. Tanyakan kode referral ke anggota Sahabat Baitullah yang mengajak Anda.</div>}
                  {sahabatTerverifikasi && <div className="text-[10px] text-green-600 mt-1">✓ {sahabatTerverifikasi.nama} ({sahabatTerverifikasi.kode_unik})</div>}
                </div>
              )}

              {((sumber === 'perwakilan' && perwakilanTerverifikasi) || (sumber === 'agen' && agenTerverifikasi) || (sumber === 'sahabat_baitullah' && (sahabatTerverifikasi || user?.role === 'sahabat_baitullah'))) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700">
                  ✅ Pendaftaran akan tercatat atas nama {sumber} yang dipilih.
                </div>
              )}
            </div>
            )}

            <button
              onClick={() => {
                if (user?.role === 'perwakilan' || permanentReferrer) { setStep(2); return; }
                if (!sumber) { alert('Pilih dari mana Anda mengetahui JM Travel!'); return; }
                if (sumber === 'perwakilan' && !perwakilanTerverifikasi) {
                  alert('Masukkan kode referral Perwakilan yang valid!'); return;
                }
                if (sumber === 'agen' && !agenTerverifikasi) {
                  alert('Masukkan kode referral Agen yang valid!'); return;
                }
                if (sumber === 'sahabat_baitullah' && user?.role !== 'sahabat_baitullah' && !sahabatTerverifikasi) {
                  alert('Masukkan kode referral Sahabat Baitullah yang valid!'); return;
                }
                setStep(2);
              }}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
              Lanjutkan Daftar →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-5">

            <CartPaketKamar
              prog={prog} list={cart} onChangeList={setCart}
              onSummaryChange={setSummary}
              jamaahTerbuka={jamaahTerbuka} onJamaahTerbuka={setJamaahTerbuka}
              dataDiriSendiri={dataDiriSahabat}
              diriSendiriBookingId={diriSendiriBookingId}
              allowHargaCustom={user.role === 'admin' || user.role === 'super_admin'}
              referralPerwId={user.role === 'perwakilan' ? user.id
                : permanentReferrer ? permanentReferrer.id
                : sumber === 'perwakilan' ? (perwakilanTerverifikasi?.id || null) : null}
              // Banner "Chat Admin" TETAP tampil apapun kondisinya (dikonfirmasi
              // user 2026-08-20) — walau kartu "🎨 Custom Hotel" udah nawarin
              // pilih Bintang Mekkah/Madinah langsung in-app per kartu, masih
              // ada kemungkinan kombinasi yang jamaah cari gak ke-cover (mis.
              // mau hotel spesifik di luar 3 bintang yang ada). "Set Harga
              // Sendiri (Admin)" PINDAH ke dalam tiap kartu jamaah (prop
              // allowHargaCustom di atas) — dikonfirmasi user 2026-10-16,
              // sekarang per-orang bukan per-pesanan.
              extra={
                <div className="bg-gradient-to-r from-[#C9952A] to-yellow-500 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">✨ Ingin Paket Custom?</div>
                      <div className="text-xs text-white/85 mt-0.5">
                        {prog?.custom_hotel_tersedia
                          ? 'Gak nemu kombinasi yang cocok di atas? Konsultasi langsung'
                          : 'Kombinasi hotel berbeda Mekkah & Madinah'}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const msg = `Halo JM Travel, saya ingin konsultasi paket custom untuk program *${prog?.name}*. Mohon bantuannya 🙏`;
                        window.open(waLink(pengaturan.wa_kantor, msg) || '#', '_blank');
                      }}
                      className="bg-white text-[#C9952A] font-bold text-xs px-4 py-2 rounded-full hover:bg-yellow-50 transition-colors whitespace-nowrap">
                      Chat Admin →
                    </button>
                  </div>
                </div>
              }
            />

            <div className="flex gap-3">
              <button onClick={() => setStep(1)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
                ← Kembali
              </button>
              <button onClick={lanjutKePembayaran} disabled={cart.length === 0 || cekNikBusy}
                className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {cekNikBusy ? 'Mengecek data...' : 'Lanjut ke Pembayaran →'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="text-xs text-red-500 mb-1">⏰ Batas Waktu Pembayaran DP</div>
              <div className="text-4xl font-black text-red-600 font-mono tracking-widest">{timerFmt}</div>
            </div>
            {/* Invoice DP — 3 konsep dilabelin eksplisit di TIAP baris:
                Harga program (total yang harus dibayar) / DP (dibayar
                SEKARANG) / Sisa pelunasan (dibayar NANTI). Dulu cuma
                "Nama — Paket ... Rp 5jt" + "Total DP" + "Transfer Tepat" +
                kotak sisa terpisah, user gak bisa bedain mana harga
                program, mana DP, mana yang dibayar (dikonfirmasi user
                2026-10-19). Angka total diambil dari `summary`
                (CartPaketKamar, sudah termasuk voucher). */}
            <div className="bg-white border-2 border-[#E8F0FB] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">📋 Invoice DP</div>
                <div className="text-xs text-gray-500">{prog.name}</div>
              </div>

              {cart.map((c, i) => {
                const harga = hargaItem(prog, c);
                const dp = Number(prog?.dp || 0);
                return (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <div className="font-semibold text-[#0E2F6E] capitalize">{c.nama || `Jamaah ${i + 1}`}</div>
                    <div className="text-[11px] text-gray-400 -mt-0.5 mb-1">{labelPaketKamar(c)}</div>
                    <div className="flex justify-between text-gray-500">
                      <span>Harga program</span><span className="text-[#0E2F6E]">Rp {harga.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>DP <span className="text-[11px]">(dibayar sekarang)</span></span><span className="font-semibold text-[#0E2F6E]">Rp {dp.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-gray-400 text-xs">
                      <span>Sisa pelunasan <span className="text-[11px]">(dibayar nanti)</span></span><span>Rp {Math.max(0, harga - dp).toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                );
              })}

              <div className="border-t border-gray-200 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Total harga program{cart.length > 1 ? ` (${cart.length} jamaah)` : ''}</span>
                  <span className="text-[#0E2F6E]">Rp {Number(summary.totalHarga || 0).toLocaleString('id-ID')}</span>
                </div>
                {summary.voucherKode && summary.voucherDiskon > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Diskon voucher ({summary.voucherKode})</span>
                    <span>−Rp {Number(summary.voucherDiskon).toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>Sisa pelunasan <span className="text-[11px]">(dibayar nanti, setelah DP dikonfirmasi)</span></span>
                  <span className="text-[#0E2F6E] whitespace-nowrap">Rp {Number(summary.sisaPelunasan || 0).toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex justify-between items-center">
                <div>
                  <div className="text-sm font-bold text-red-700">Yang ditransfer SEKARANG</div>
                  <div className="text-[11px] text-red-500">Total DP{cart.length > 1 ? ` ${cart.length} jamaah` : ''} — transfer tepat sesuai nominal ini</div>
                </div>
                <div className="text-lg font-black text-red-600 whitespace-nowrap">Rp {totalDP.toLocaleString('id-ID')}</div>
              </div>
            </div>

            {/* Bayar DP dari saldo tabungan umroh buat program reguler
                DICABUT (dikonfirmasi user 2026-10-15) — selalu transfer
                manual sekarang, sama kayak jamaah biasa. */}
            <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">🏦 Rekening Tujuan</div>
              {metodePembayaran.map(m => (
                <div key={m.id} className="text-sm text-gray-500 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                  <div className="font-bold text-[#0E2F6E]">{m.nama}</div>
                  {m.nomor && <div className="flex justify-between"><span>No. Rekening</span><span className="font-bold text-[#0E2F6E]">{m.nomor}</span></div>}
                  {m.atas_nama && <div className="flex justify-between"><span>Atas Nama</span><span className="font-bold text-[#0E2F6E]">{m.atas_nama}</span></div>}
                  {m.catatan && <div className="text-xs text-gray-400 mt-0.5">{m.catatan}</div>}
                </div>
              ))}
            </div>
            {/* Notice DP non-refundable (dikonfirmasi user 2026-09-27) — cuma
                di flow checkout normal (ada DP), BUKAN di checkout mandiri
                Sahabat Baitullah (dibayar dari saldo tabungan, gak ada DP). */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 text-center">
              ⚠️ DP tidak dapat dikembalikan, namun dapat dialihkan ke program lain.
            </div>
            <UploadBukti
              onUploaded={(path, nama) => { setBuktiPath(path); setBuktiNama(nama); }}
              label="Klik untuk upload bukti transfer DP"
            />
            <div className="flex gap-3">
              <button onClick={() => setStep(2)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full transition-colors">
                ← Kembali
              </button>
              <button onClick={submitBooking} disabled={!buktiPath || loading}
                className="flex-2 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 px-8 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Memproses...' : 'Kirim Bukti Transfer'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="text-center space-y-4 py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-[#0E2F6E]">Bukti Transfer Terkirim!</h2>
            <p className="text-gray-400 text-sm">Admin akan verifikasi dalam 1×24 jam kerja.</p>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left space-y-1">
              <div className="text-sm text-green-600">Program: {prog.name}</div>
              {bookingIds.map(id => (
                <div key={id} className="font-bold text-green-800">Booking: {id}</div>
              ))}
              <span className="inline-block bg-[#FEF3DC] text-[#7a5500] text-xs font-bold px-3 py-1 rounded-full mt-1">⏳ Menunggu Konfirmasi Admin</span>
            </div>
            <div className="bg-[#E8F0FB] rounded-xl p-4 text-left text-sm text-[#0E2F6E] space-y-1">
              <div>① Admin verifikasi bukti (maks 1×24 jam)</div>
              <div>② Notif WA saat DP dikonfirmasi</div>
              <div>③ Formulir jamaah terbuka untuk diisi</div>
              <div>④ Lanjutkan pelunasan setelah formulir selesai</div>
            </div>
            <button onClick={() => {
                // Bug ditemukan & diperbaiki 2026-09-27 — dulu hardcode ke
                // /dashboard/jamaah buat semua role, baru kerasa begitu
                // perwakilan/sahabat/admin ikut lewat checkout (dilebur dari
                // /order-jamaah). Key HARUS 'sahabat_baitullah' (bukan
                // 'sahabat') — itu nilai role yang beneran dipakai di sistem.
                const tujuan = { admin: '/admin', super_admin: '/admin', perwakilan: '/dashboard/perwakilan', sahabat_baitullah: '/dashboard/sahabat' };
                router.push(tujuan[user.role] || '/dashboard/jamaah');
              }}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors">
              Ke Dashboard →
            </button>
          </div>
        )}

      </div>
    </Layout>
  );
}