'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { KAPASITAS_KAMAR } from '@/lib/kalkulatorBiaya';

const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad (ber-4)', triple: 'Triple (ber-3)', double: 'Double (ber-2)' };
const KAMAR_LIST = ['quad', 'triple', 'double'];
const RUTE_LABEL = { direct: 'Direct', transit: 'Transit' };
const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;

function serializePilihan(p) {
  const q = new URLSearchParams();
  if (p.paket) q.set('paket', p.paket);
  if (p.kamar) q.set('kamar', p.kamar);
  if (p.tanggal) q.set('tanggal', p.tanggal);
  if (p.durasi) q.set('durasi', p.durasi);
  if (p.urutanKota) q.set('urutan', p.urutanKota);
  // null = belum di-resolve dari default admin (lihat effect muat template),
  // TULIS EKSPLISIT '1'/'0' begitu udah ke-resolve — beda dari field
  // boolean lain yang default-nya konstan, default urutan Umroh Plus di sini
  // BEDA per-template, gak aman diasumsikan salah satu arah.
  if (p.umrohDulu != null) q.set('umroh_dulu', p.umrohDulu ? '1' : '0');
  if (p.addon && p.addon.length > 0) q.set('addon', p.addon.join(','));
  if (p.rute) q.set('rute', p.rute);
  if (p.hotelMekkahIdx != null) q.set('hotel_mekkah', p.hotelMekkahIdx);
  if (p.hotelMadinahIdx != null) q.set('hotel_madinah', p.hotelMadinahIdx);
  if (p.malamMekkah) q.set('malam_mekkah', p.malamMekkah);
  if (p.malamMadinah) q.set('malam_madinah', p.malamMadinah);
  if (p.mutawwifHari !== '') q.set('mutawwif_hari', p.mutawwifHari);
  if (!p.pakaiMutawwifah) q.set('mutawwifah', '0');
  if (p.jumlahTl) q.set('tl', p.jumlahTl);
  if (p.jumlahCowok) q.set('cowok', p.jumlahCowok);
  if (p.jumlahCewek) q.set('cewek', p.jumlahCewek);
  if (p.jumlahPasangan) q.set('pasangan', p.jumlahPasangan);
  if (p.modulPilihan && p.modulPilihan.length > 0) q.set('modul', JSON.stringify(p.modulPilihan));
  if (p.kombinasi && p.kombinasi.length > 0) q.set('kombinasi', JSON.stringify(p.kombinasi));
  if (p.jumlahUmroh && p.jumlahUmroh !== '1') q.set('umroh', p.jumlahUmroh);
  if (p.maskapai) q.set('maskapai', p.maskapai);
  return q.toString();
}

// Konfigurator paket private/custom — pengunjung bisa isi SEMUA pilihan
// (paket/kamar/tanggal/rute/hotel/malam/mutawwif/add-on) tanpa login, tapi
// harga BENAR-BENAR kosong sampai mereka login/daftar (lead capture: siapa
// aja yang pakai kalkulator ini kecatat, walau gak jadi booking). Begitu
// pilihan diisi & pengunjung klik "Hitung Estimasi" saat belum login,
// pilihannya diserialize ke query string URL halaman INI SENDIRI lalu
// diarahkan ke /login?redirect=<url ini> — begitu login/daftar selesai, alur
// redirect (lihat register/verifikasi/upload-foto) balik ke sini dengan
// query yang sama, otomatis dihitung ulang SEKALI (lihat effect di bawah)
// biar pengunjung gak perlu isi ulang.
export default function KalkulatorPublikDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const templateId = params?.template_id;
  const [user] = useCurrentUser();

  const [template, setTemplate] = useState(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [paket, setPaket] = useState(searchParams.get('paket') || '');
  const [kamar, setKamar] = useState(searchParams.get('kamar') || '');
  const [tanggal, setTanggal] = useState(searchParams.get('tanggal') || '');
  const [durasi, setDurasi] = useState(searchParams.get('durasi') || '');
  const [urutanKota, setUrutanKota] = useState(searchParams.get('urutan') || '');
  // null = belum di-resolve, diisi dari template.umroh_dulu_default begitu
  // template kelar dimuat (lihat effect di bawah) — beda dari urutanKota,
  // default true/false-nya BEDA per-template (admin yang set), gak bisa
  // di-hardcode di sini.
  const [umrohDulu, setUmrohDulu] = useState(() => {
    const q = searchParams.get('umroh_dulu');
    return q === '0' ? false : q === '1' ? true : null;
  });
  const [addonAktif, setAddonAktif] = useState(new Set((searchParams.get('addon') || '').split(',').filter(Boolean)));
  const [rute, setRute] = useState(searchParams.get('rute') || '');
  const [hotelMekkahIdx, setHotelMekkahIdx] = useState(searchParams.get('hotel_mekkah') !== null ? Number(searchParams.get('hotel_mekkah')) : null);
  const [hotelMadinahIdx, setHotelMadinahIdx] = useState(searchParams.get('hotel_madinah') !== null ? Number(searchParams.get('hotel_madinah')) : null);
  // Bintang yang lagi dipilih di step 1 (baru munculin dropdown nama hotel
  // step 2, sama pola kayak baris Kombinasi Kamar Campuran) — KHUSUS mode
  // non-dinamis (single picker, bukan per-baris). null = belum pilih bintang.
  const [hotelMekkahBintang, setHotelMekkahBintang] = useState(null);
  const [hotelMadinahBintang, setHotelMadinahBintang] = useState(null);
  const [malamMekkah, setMalamMekkah] = useState(searchParams.get('malam_mekkah') || '');
  const [malamMadinah, setMalamMadinah] = useState(searchParams.get('malam_madinah') || '');
  const [mutawwifHari, setMutawwifHari] = useState(searchParams.get('mutawwif_hari') || '');
  const [pakaiMutawwifah, setPakaiMutawwifah] = useState(searchParams.get('mutawwifah') !== '0');
  const [jumlahTl, setJumlahTl] = useState(searchParams.get('tl') || '');
  const [jumlahCowok, setJumlahCowok] = useState(searchParams.get('cowok') || '');
  const [jumlahCewek, setJumlahCewek] = useState(searchParams.get('cewek') || '');
  const [jumlahPasangan, setJumlahPasangan] = useState(searchParams.get('pasangan') || '');
  const [modulPilihan, setModulPilihan] = useState(() => {
    try { return JSON.parse(searchParams.get('modul') || '[]'); } catch { return []; }
  });
  // Kombinasi kamar campuran — KHUSUS paket private/custom (paxAturan.mode
  // 'dinamis'). 1 baris = 1 sub-grup dengan paket+kamar+jumlah orang sendiri
  // (mis. 3 orang Quad Signature + 4 orang Triple Deluxe dalam 1 booking).
  // Gantiin paket/kamar/jumlahCowok/jumlahCewek/jumlahPasangan TUNGGAL di
  // atas KHUSUS buat mode dinamis — mode lain (fix/pasangan) tetap pakai
  // field tunggal itu, gak disentuh sama sekali.
  const [kombinasi, setKombinasi] = useState(() => {
    try { const arr = JSON.parse(searchParams.get('kombinasi') || 'null'); return Array.isArray(arr) ? arr : []; } catch { return []; }
  });
  const [maskapai, setMaskapai] = useState(searchParams.get('maskapai') || '');
  const [jumlahUmroh, setJumlahUmroh] = useState(searchParams.get('umroh') || '1');

  const [menghitung, setMenghitung] = useState(false);
  const [hasil, setHasil] = useState(null); // { lead_id, harga_jual, itinerary }
  const [mengajukan, setMengajukan] = useState(false);
  const [sudahDiajukan, setSudahDiajukan] = useState(false);
  const [error, setError] = useState('');
  const autoHitungSudah = useRef(false);

  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/kalkulator-publik/template?id=${templateId}`).then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); setLoadingTemplate(false); return; }
        setTemplate(d.template);
        setPaket(prev => prev || d.template.paket_list?.[0] || '');
        setMalamMekkah(prev => prev || (d.template.malam_default?.mekkah ? String(d.template.malam_default.mekkah) : ''));
        setMalamMadinah(prev => prev || (d.template.malam_default?.madinah ? String(d.template.malam_default.madinah) : ''));
        setUmrohDulu(prev => prev !== null ? prev : d.template.umroh_dulu_default !== false);
        setKombinasi(prev => prev.length > 0 || d.template.pax_aturan?.mode !== 'dinamis' ? prev : [{ kamar: '', jumlah_cowok: '', jumlah_cewek: '', jumlah_pasangan: '', hotel_mekkah_idx: '', hotel_madinah_idx: '' }]);
        setLoadingTemplate(false);
      })
      .catch(() => { setNotFound(true); setLoadingTemplate(false); });
  }, [templateId]);

  // Bintang Mekkah & Madinah INDEPENDEN dari "paket" (Deluxe/Eksekutif/
  // Signature udah gak dipakai buat kalkulator publik manapun, lihat
  // hotelOpsiGabunganUntukTemplate di server) — dipakai baik buat baris
  // Kombinasi Kamar Campuran (mode dinamis, per baris) MAUPUN picker Bintang
  // → Hotel tunggal (mode pasangan/fix, 1x pilih) di bawah.
  const opsiHotelGabungan = template?.hotel_opsi_gabungan || { mekkah: [], madinah: [] };
  const paxAturan = template?.pax_aturan || { mode: 'dinamis', fixTotal: null, min: null, max: null };
  // skip run pertama (mount) — biar pilihan hotel yang di-restore dari query
  // string (balik dari login) gak langsung ke-reset begitu render awal.
  const paketMountSudah = useRef(false);
  useEffect(() => {
    if (!paketMountSudah.current) { paketMountSudah.current = true; return; }
    setHotelMekkahIdx(null); setHotelMadinahIdx(null);
  }, [paket]);

  // Pilih 1 opsi durasi (mis. 9 Hari) — kalau opsi itu punya total malam
  // terkunci (lihat durasi_opsi di kalkulatorPublik.js), langsung isi
  // Malam Mekkah/Madinah rata tengah sebagai starting point (jamaah tetap
  // bebas geser, tinggal total-nya yang gak boleh berubah — lihat
  // ubahMalamMekkah/ubahMalamMadinah).
  function pilihDurasi(d) {
    setDurasi(String(d.hari));
    if (d.malam) {
      const separuh = Math.ceil(d.malam / 2);
      setMalamMekkah(String(separuh));
      setMalamMadinah(String(d.malam - separuh));
    }
  }
  // Begitu durasi terpilih ngunci total malam, ubah salah satu field
  // OTOMATIS nyesuain sisanya ke field satunya — jamaah gak perlu itung
  // manual, dan gak mungkin submit total yang meleset dari yang dikunci
  // admin (lihat validasi ulang di server, hitung/route.js).
  function ubahMalamMekkah(v) {
    setMalamMekkah(v);
    const malamTerkunci = template?.durasi_opsi?.find(d => String(d.hari) === durasi)?.malam;
    if (malamTerkunci) setMalamMadinah(String(Math.max(0, malamTerkunci - (Number(v) || 0))));
  }
  function ubahMalamMadinah(v) {
    setMalamMadinah(v);
    const malamTerkunci = template?.durasi_opsi?.find(d => String(d.hari) === durasi)?.malam;
    if (malamTerkunci) setMalamMekkah(String(Math.max(0, malamTerkunci - (Number(v) || 0))));
  }

  function toggleAddon(key) {
    setAddonAktif(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Haramain Express — dulu 2 checkbox lepas (One Way + Upgrade PP), sekarang
  // disamain kayak Tambahan Umroh: 1 checkbox utama, begitu dicontreng baru
  // muncul pertanyaan One Way/PP (dikonfirmasi user 2026-08-18). PP otomatis
  // nyakup One Way (server nganggep haramain_express=2 kalau PP dipilih,
  // lihat resolveAddonPatch di kalkulatorPublik.js), makanya toggle One
  // Way/PP TETAP nyalain key 'haramain_express'.
  function toggleHaramain(aktif) {
    setAddonAktif(prev => {
      const next = new Set(prev);
      if (aktif) next.add('haramain_express');
      else { next.delete('haramain_express'); next.delete('haramain_express_pp'); }
      return next;
    });
  }
  function pilihHaramainPp(pp) {
    setAddonAktif(prev => {
      const next = new Set(prev);
      next.add('haramain_express');
      if (pp) next.add('haramain_express_pp'); else next.delete('haramain_express_pp');
      return next;
    });
  }

  // Negara tambahan "Pilihan Publik" (mis. Turkey/Dubai) — jamaah pilih
  // sendiri negara + hari + (kalau modulnya butuh) bintang hotel/opsi city
  // tour. Beda dari template.itinerary/hotel_opsi dkk yang udah fix dari
  // admin — ini beneran diklik-klik pengunjung sendiri.
  function tambahModulPilihan() {
    setModulPilihan(prev => [...prev, { modul_negara_id: '', hari: '', hotel_star: '', city_tour_opsi: '' }]);
  }
  function ubahModulPilihan(idx, patch) {
    setModulPilihan(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
  }
  function hapusModulPilihan(idx) {
    setModulPilihan(prev => prev.filter((_, i) => i !== idx));
  }
  // Urutan array modulPilihan = urutan negara di itinerary (lihat
  // itineraryUntukTemplate di server) — geser naik/turun buat ubah negara
  // mana yang dikunjungi duluan (mis. Turkey dulu baru Dubai, atau
  // sebaliknya), gak ngaruh ke harga sama sekali.
  function geserModulPilihan(idx, arah) {
    const tujuan = idx + arah;
    if (tujuan < 0 || tujuan >= modulPilihan.length) return;
    setModulPilihan(prev => {
      const next = [...prev];
      [next[idx], next[tujuan]] = [next[tujuan], next[idx]];
      return next;
    });
  }

  function tambahBarisKombinasi() {
    setKombinasi(prev => [...prev, { kamar: '', jumlah_cowok: '', jumlah_cewek: '', jumlah_pasangan: '', hotel_mekkah_idx: '', hotel_madinah_idx: '' }]);
  }
  function ubahBarisKombinasi(idx, patch) {
    setKombinasi(prev => prev.map((k, i) => i === idx ? { ...k, ...patch } : k));
  }
  function hapusBarisKombinasi(idx) {
    setKombinasi(prev => prev.filter((_, i) => i !== idx));
  }

  function pilihanSaatIni() {
    return {
      paket, kamar, tanggal, durasi, urutanKota, umrohDulu, addon: [...addonAktif], rute,
      hotelMekkahIdx, hotelMadinahIdx, malamMekkah, malamMadinah,
      mutawwifHari, pakaiMutawwifah, jumlahCowok, jumlahCewek, jumlahPasangan, modulPilihan, jumlahUmroh,
      maskapai, kombinasi, jumlahTl,
    };
  }

  async function hitung() {
    setError('');
    const pakaiKombinasi = paxAturan.mode === 'dinamis';
    if (pakaiKombinasi) {
      if (kombinasi.length < 1) { setError('Tambah minimal 1 kombinasi kamar dulu.'); return; }
      for (const k of kombinasi) {
        if (!k.kamar) { setError('Pilih tipe kamar di setiap baris kombinasi.'); return; }
        if (opsiHotelGabungan.mekkah.length > 0 && k.hotel_mekkah_idx === '') { setError('Pilih Bintang/Hotel Mekkah di setiap baris kombinasi.'); return; }
        if (opsiHotelGabungan.madinah.length > 0 && k.hotel_madinah_idx === '') { setError('Pilih Bintang/Hotel Madinah di setiap baris kombinasi.'); return; }
        if ((Number(k.jumlah_cowok) || 0) + (Number(k.jumlah_cewek) || 0) < 1) { setError('Isi jumlah jamaah di setiap baris kombinasi (minimal 1 orang).'); return; }
      }
    } else if (!paket || !kamar) {
      setError('Pilih paket & tipe kamar dulu.'); return;
    }
    if (template.rute_list?.length > 0 && !rute) { setError('Pilih rute (direct/transit) dulu.'); return; }
    if (template.maskapai_list?.length > 0 && !maskapai) { setError('Pilih maskapai dulu.'); return; }
    if (!pakaiKombinasi && opsiHotelGabungan.mekkah.length > 0 && hotelMekkahIdx == null) { setError('Pilih hotel Mekkah dulu.'); return; }
    if (!pakaiKombinasi && opsiHotelGabungan.madinah.length > 0 && hotelMadinahIdx == null) { setError('Pilih hotel Madinah dulu.'); return; }
    if (template.malam_aturan?.mode !== 'fix' && template.malam_aturan?.mode !== 'tidak_ada' && (!malamMekkah || !malamMadinah)) { setError('Isi jumlah malam di Mekkah & Madinah dulu.'); return; }
    if (template.durasi_opsi?.length > 0 && !durasi) { setError('Pilih durasi Umroh dulu.'); return; }
    if (jumlahUmroh && (!Number.isInteger(Number(jumlahUmroh)) || Number(jumlahUmroh) < 1)) { setError('Jumlah Umroh minimal 1 kali.'); return; }
    if (mutawwifHari !== '' && Number(mutawwifHari) < 3) { setError('Hari Mutawwif minimal 3 hari (1 hari penjemputan + 2 hari umroh) — kosongkan aja kalau mau sepanjang trip.'); return; }
    if (template.modul_pilihan?.length > 0) {
      if (modulPilihan.length < 1) { setError('Pilih minimal 1 negara tambahan dulu.'); return; }
      for (const m of modulPilihan) {
        const modul = template.modul_pilihan.find(mp => mp.id === Number(m.modul_negara_id));
        if (!modul) { setError('Pilih negara tambahan dulu di setiap baris.'); return; }
        if (!m.hari) { setError(`Pilih jumlah hari di ${modul.nama} dulu.`); return; }
        if (modul.pakai_hotel_star && !m.hotel_star) { setError(`Pilih bintang hotel di ${modul.nama} dulu.`); return; }
        if (modul.pakai_city_tour_opsi && !m.city_tour_opsi) { setError(`Pilih opsi city tour di ${modul.nama} dulu.`); return; }
      }
    }
    const totalPax = pakaiKombinasi
      ? kombinasi.reduce((s, k) => s + (Number(k.jumlah_cowok) || 0) + (Number(k.jumlah_cewek) || 0), 0)
      : (Number(jumlahCowok) || 0) + (Number(jumlahCewek) || 0);
    if (paxAturan.mode === 'pasangan') {
      const jumlahPasanganDipilih = Number(jumlahCowok) || 0;
      if (jumlahPasanganDipilih < 1) { setError('Isi jumlah pasangan dulu (minimal 1 pasang) — ini paket khusus pasangan suami istri.'); return; }
      if (paxAturan.pasanganMax != null && jumlahPasanganDipilih > paxAturan.pasanganMax) { setError(`Paket ini maksimal ${paxAturan.pasanganMax} pasang.`); return; }
    } else {
      if (totalPax < 1) { setError('Isi jumlah jamaah cowok/cewek dulu (minimal 1 orang) — ini paket private/custom, harganya dihitung dari jumlah orang yang beneran ikut.'); return; }
      if (paxAturan.mode === 'fix' && totalPax !== paxAturan.fixTotal) { setError(`Paket ini khusus ${paxAturan.fixTotal} orang — jumlah cowok+cewek harus pas ${paxAturan.fixTotal}.`); return; }
      if (paxAturan.mode === 'dinamis' && paxAturan.min != null && totalPax < paxAturan.min) { setError(`Paket ini minimal ${paxAturan.min} orang.`); return; }
      if (paxAturan.mode === 'dinamis' && paxAturan.max != null && totalPax > paxAturan.max) { setError(`Paket ini maksimal ${paxAturan.max} orang.`); return; }
    }
    if (!user) {
      const query = serializePilihan(pilihanSaatIni());
      const urlKembali = query ? `${pathname}?${query}` : pathname;
      router.push(`/login?redirect=${encodeURIComponent(urlKembali)}`);
      return;
    }
    setMenghitung(true);
    try {
      const res = await fetch('/api/kalkulator-publik/hitung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId, tanggal_berangkat: tanggal || null, addon_keys: [...addonAktif],
          ...(pakaiKombinasi
            ? { kombinasi: kombinasi.map(k => ({
                kamar: k.kamar,
                jumlah_cowok: Number(k.jumlah_cowok) || 0, jumlah_cewek: Number(k.jumlah_cewek) || 0,
                jumlah_pasangan: Number(k.jumlah_pasangan) || 0,
                hotel_mekkah_idx: k.hotel_mekkah_idx === '' ? undefined : k.hotel_mekkah_idx,
                hotel_madinah_idx: k.hotel_madinah_idx === '' ? undefined : k.hotel_madinah_idx,
              })) }
            : { paket, kamar, jumlah_cowok: jumlahCowok || 0, jumlah_cewek: jumlahCewek || 0 }),
          durasi_dipilih: durasi || undefined, jumlah_umroh: jumlahUmroh || 1, urutan_dipilih: urutanKota || undefined,
          umroh_dulu_dipilih: template.bisa_pilih_urutan_umroh ? umrohDulu : undefined,
          rute: rute || undefined,
          hotel_mekkah_opsi_idx: hotelMekkahIdx, hotel_madinah_opsi_idx: hotelMadinahIdx,
          malam_mekkah: malamMekkah, malam_madinah: malamMadinah,
          mutawwif_hari: mutawwifHari !== '' ? mutawwifHari : undefined,
          pakai_mutawwifah: pakaiMutawwifah,
          pax_tl: jumlahTl !== '' ? Number(jumlahTl) : 0,
          modul_pilihan_dipilih: template.modul_pilihan?.length > 0 ? modulPilihan.map(m => ({
            modul_negara_id: Number(m.modul_negara_id), hari: Number(m.hari),
            hotel_star: m.hotel_star || undefined, city_tour_opsi: m.city_tour_opsi || undefined,
          })) : undefined,
          maskapai: maskapai || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal menghitung estimasi'); setMenghitung(false); return; }
      setHasil(d);
    } catch { setError('Terjadi kesalahan, coba lagi.'); }
    setMenghitung(false);
  }

  // Begitu balik dari login/daftar dengan pilihan lengkap di query string,
  // otomatis hitung ulang SEKALI (bukan tiap render) — lalu bersihkan query
  // dari URL biar refresh manual gak nge-trigger hitung baru berulang-ulang
  // (tiap panggilan sukses = 1 baris baru kalkulator_lead, disengaja gak
  // upsert, tapi gak boleh nge-spam gara-gara efek ini doang).
  useEffect(() => {
    if (autoHitungSudah.current) return;
    if (!user || !template) return;
    const p = searchParams.get('paket'), k = searchParams.get('kamar'), kb = searchParams.get('kombinasi');
    if (!kb && (!p || !k)) return;
    autoHitungSudah.current = true;
    setTimeout(hitung, 0);
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, template]);

  // Begitu HASIL UDAH KETAMPIL, ubah pilihan apa aja (add-on/kombinasi/dst)
  // otomatis hitung ulang sendiri — pengunjung gak perlu pencet "Ubah pilihan
  // & hitung ulang" lalu "Hitung Estimasi" manual lagi tiap kali coba-coba
  // opsi lain (dikonfirmasi user 2026-08-18). Di-debounce 700ms biar gak
  // nembak request/nyimpen lead baru di TIAP klik pas lagi buru-buru ganti
  // beberapa pilihan sekaligus. SEBELUM hasil pertama muncul TETAP manual
  // (harus pencet "Hitung Estimasi") — auto-recalc nembak hitung() yang
  // bisa ngarahin ke /login kalau belum login, jangan sampai kepicu diam-
  // diam pas pengunjung baru ngetik-ngetik isi form pertama kali.
  const hitungRef = useRef(hitung);
  useEffect(() => { hitungRef.current = hitung; });
  const pilihanKey = JSON.stringify(pilihanSaatIni());
  useEffect(() => {
    if (!hasil) return;
    const timer = setTimeout(() => { hitungRef.current(); }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilihanKey]);

  async function ajukanBudget() {
    if (!hasil?.lead_id) return;
    setMengajukan(true);
    try {
      const res = await fetch('/api/kalkulator-publik/ajukan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: hasil.lead_id }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal mengajukan budget'); setMengajukan(false); return; }
      setSudahDiajukan(true);
    } catch { setError('Terjadi kesalahan, coba lagi.'); }
    setMengajukan(false);
  }

  if (loadingTemplate) {
    return <Layout title="🧮 Kalkulator Estimasi" backHref="/#umroh-private"><div className="text-center text-gray-400 py-20">Memuat...</div></Layout>;
  }
  if (notFound || !template) {
    return <Layout title="🧮 Kalkulator Estimasi" backHref="/#umroh-private"><div className="text-center text-gray-400 py-20">Paket tidak ditemukan.</div></Layout>;
  }

  const inp = "w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1.5";
  const paketList = template.paket_list?.length > 0 ? template.paket_list : ['deluxe'];
  const durasiTerpilih = template.durasi_opsi?.find(d => String(d.hari) === durasi) || null;
  const mutawwifInvalid = mutawwifHari !== '' && Number(mutawwifHari) < 3;

  // Kebutuhan kamar — murni info buat pengunjung, GAK ngaruh ke harga (kamar
  // & harga tetap dihitung dari pilihan Tipe Kamar di atas). Default dipisah
  // per gender (jamaah cowok/cewek gak sekamar), KECUALI diisi "jumlah
  // pasangan" (mis. suami istri) — pasangan yang sekamar dihitung sebagai 1
  // kamar campur, sisa cowok/cewek yang gak berpasangan tetap dipecah normal.
  // Dibatasi eksplisit (bukan diasumsikan SEMUA yang gender-nya pas jadi
  // pasangan) — buat paket jumlah bebas, gak semua cowok+cewek yang datang
  // bareng itu pasutri. KECUALI mode 'pasangan' (mis. Umroh Berdua) — di
  // situ SEMUA pax emang pasangan suami istri by design, gak perlu input
  // terpisah.
  const cowokN = Number(jumlahCowok) || 0, cewekN = Number(jumlahCewek) || 0;
  const kapasitas = kamar ? KAPASITAS_KAMAR[kamar] : null;
  const pasanganN = paxAturan.mode === 'pasangan' ? Math.min(cowokN, cewekN) : Math.min(Number(jumlahPasangan) || 0, cowokN, cewekN);
  const sisaCowokN = cowokN - pasanganN, sisaCewekN = cewekN - pasanganN;
  const kamarPasangan = kapasitas && pasanganN > 0 ? Math.ceil((pasanganN * 2) / kapasitas) : 0;
  const kamarCowok = kapasitas && sisaCowokN > 0 ? Math.ceil(sisaCowokN / kapasitas) : 0;
  const kamarCewek = kapasitas && sisaCewekN > 0 ? Math.ceil(sisaCewekN / kapasitas) : 0;

  // Estimasi tanggal pulang — murni info tampilan, dihitung dari total malam
  // program (fix: dari template, dinamis: dari input Malam Mekkah+Madinah
  // yang diisi pengunjung). Gak ngaruh ke harga.
  const totalMalamProgram = template.malam_aturan?.mode === 'fix'
    ? (Number(template.malam_default?.mekkah) || 0) + (Number(template.malam_default?.madinah) || 0)
    : (Number(malamMekkah) || 0) + (Number(malamMadinah) || 0);
  // Hari trip: durasi yang beneran dipilih pengunjung (mis. 9, dari
  // durasi_opsi) kalau ada, lalu total_hari_program yang admin set di
  // KalkulatorTerpadu, baru fallback nebak malam+1 — dua yang pertama lebih
  // akurat karena durasi 9 hari bisa aja cuma 7 malam nginep, sisanya hari
  // berangkat/pulang (lihat durasiTerpilih.malam / total_hari_program).
  const totalHariProgram = durasiTerpilih?.hari || Number(template.total_hari_program) || (totalMalamProgram + 1);
  let tanggalPulangLabel = '';
  if (tanggal && totalMalamProgram > 0) {
    const dPulang = new Date(`${tanggal}T00:00:00`);
    if (!isNaN(dPulang)) {
      dPulang.setDate(dPulang.getDate() + (totalHariProgram - 1));
      tanggalPulangLabel = dPulang.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    }
  }

  // POST /hitung SELALU balikin itinerary hasil akhir (label Mekkah/Madinah
  // & malam sesuai pilihan pengunjung SEBENARNYA, bukan cuma default template)
  // — begitu ada, itu yang diutamakan. Sebelum hitung (atau kalau kosong),
  // fallback ke template.itinerary (preview dari GET /template, masih pakai
  // malam DEFAULT template).
  const itineraryUntukTampil = hasil?.itinerary?.length > 0 ? hasil.itinerary : (template.itinerary || []);

  return (
    <Layout title={`🧮 ${template.nama}`} backHref="/#umroh-private">
      {template.gambar && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={template.gambar} alt={template.nama} className="w-full h-auto object-contain rounded-2xl mb-4" />
      )}
      {template.deskripsi && <div className="text-sm text-gray-600 mb-6">{template.deskripsi}</div>}

      {/* Foto flyer biasanya udah nampilin ini juga, tapi teksnya tetap
          ditampilin di sini — foto gak selalu kebaca jelas (kompresi/ukuran
          layar kecil), dan versi teks lebih gampang dibaca screen reader. */}
      {(template.include_list?.length > 0 || template.exclude_list?.length > 0) && (
        <div className="bg-white rounded-2xl border border-[#e0e8f0] p-5 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="font-bold text-green-700 text-sm mb-2">✅ Sudah Termasuk</div>
              {template.include_list?.length > 0 ? (
                <ul className="space-y-1.5">
                  {template.include_list.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-green-500 mt-0.5">✓</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : <div className="text-xs text-gray-400">-</div>}
            </div>
            <div>
              <div className="font-bold text-red-600 text-sm mb-2">❌ Tidak Termasuk</div>
              {template.exclude_list?.length > 0 ? (
                <ul className="space-y-1.5">
                  {template.exclude_list.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-red-400 mt-0.5">✕</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : <div className="text-xs text-gray-400">-</div>}
            </div>
          </div>
        </div>
      )}

      {(itineraryUntukTampil.length > 0 || template.modul_pilihan?.length > 0) && (
        <div className="bg-white rounded-2xl border border-[#e0e8f0] p-5 mb-4">
          <div className="font-bold text-[#0E2F6E] mb-3">🗺️ Itinerary Perjalanan</div>
          {itineraryUntukTampil.length === 0 ? (
            <div className="text-xs text-gray-400">Pilih negara tambahan & hitung estimasi dulu buat lihat itinerary lengkapnya.</div>
          ) : (
            <div className="border-l-2 border-[#1A4FA0] pl-4 space-y-4">
              {itineraryUntukTampil.map((h) => (
                <div key={h.hari} className="relative">
                  <div className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-[#1A4FA0] border-2 border-white"></div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#0E2F6E]">Hari {h.hari}</span>
                    {h.label && <span className="text-[11px] text-gray-400">{h.label}</span>}
                  </div>
                  <div className="text-sm text-gray-600 whitespace-pre-line mt-0.5">{h.teks}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e0e8f0] p-5 space-y-4 mb-6">
        {template.durasi_opsi?.length > 0 && (
          <div>
            <label className={lbl}>Durasi Umroh</label>
            <div className="flex gap-2">
              {template.durasi_opsi.map(d => (
                <button key={d.hari} type="button" onClick={() => pilihDurasi(d)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${durasi === String(d.hari) ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {d.hari} Hari
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className={lbl}>Tanggal Keberangkatan</label>
          <input type="date" value={tanggal} onChange={e => { if (e.target.value) setTanggal(e.target.value); }} className={inp} />
          {tanggalPulangLabel && (
            <div className="text-xs text-gray-500 mt-1.5">
              ✈️ Estimasi kembali: <b>{tanggalPulangLabel}</b> ({totalHariProgram} hari)
            </div>
          )}
        </div>

        {paxAturan.mode !== 'dinamis' && paketList.length > 1 && (
          <div>
            <label className={lbl}>Paket</label>
            <div className="flex gap-2">
              {paketList.map(p => (
                <button key={p} type="button" onClick={() => setPaket(p)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${paket === p ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {PAKET_LABEL[p] || p}
                </button>
              ))}
            </div>
          </div>
        )}

        {template.rute_list?.length > 0 && (
          <div>
            <label className={lbl}>Rute Penerbangan</label>
            <div className="flex gap-2">
              {template.rute_list.map(r => (
                <button key={r} type="button" onClick={() => setRute(r)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${rute === r ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {RUTE_LABEL[r] || r}
                </button>
              ))}
            </div>
          </div>
        )}

        {template.maskapai_list?.length > 0 && (
          <div>
            <label className={lbl}>Maskapai</label>
            <div className="flex flex-wrap gap-2">
              {template.maskapai_list.map(m => (
                <button key={m} type="button" onClick={() => setMaskapai(m)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${maskapai === m ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {paxAturan.mode !== 'dinamis' && (
        <div>
          <label className={lbl}>Tipe Kamar</label>
          <div className="flex gap-2">
            {KAMAR_LIST.map(k => (
              <button key={k} type="button" onClick={() => setKamar(k)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${kamar === k ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                {KAMAR_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        )}

        {paxAturan.mode !== 'dinamis' && (opsiHotelGabungan.mekkah.length > 0 || opsiHotelGabungan.madinah.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { kota: 'mekkah', idx: hotelMekkahIdx, setIdx: setHotelMekkahIdx, bintang: hotelMekkahBintang, setBintang: setHotelMekkahBintang },
              { kota: 'madinah', idx: hotelMadinahIdx, setIdx: setHotelMadinahIdx, bintang: hotelMadinahBintang, setBintang: setHotelMadinahBintang },
            ].map(({ kota, idx, setIdx, bintang, setBintang }) => {
              const opsiKota = opsiHotelGabungan[kota];
              if (opsiKota.length === 0) return null;
              const bintangList = [...new Set(opsiKota.map(o => o.bintang).filter(Boolean))].sort((a, b) => a - b);
              const bintangTerpilih = bintang ?? (opsiKota.find(o => o.idx === idx)?.bintang ?? '');
              const kandidat = bintangTerpilih ? opsiKota.filter(o => o.bintang === bintangTerpilih) : [];
              return (
                <div key={kota} className="space-y-1">
                  <label className={lbl}>Hotel {kota === 'mekkah' ? 'Mekkah' : 'Madinah'}</label>
                  <select value={bintangTerpilih} onChange={e => {
                    const b = e.target.value ? Number(e.target.value) : '';
                    const cocok = opsiKota.filter(o => o.bintang === b);
                    setBintang(b); setIdx(cocok.length === 1 ? cocok[0].idx : null);
                  }} className={inp}>
                    <option value="">— Bintang —</option>
                    {bintangList.map(b => <option key={b} value={b}>Bintang {b}</option>)}
                  </select>
                  {bintangTerpilih !== '' && kandidat.length > 0 && (
                    <select value={idx ?? ''} onChange={e => setIdx(e.target.value === '' ? null : Number(e.target.value))} className={inp}>
                      <option value="">— Pilih Hotel —</option>
                      {kandidat.map(o => <option key={o.idx} value={o.idx}>{o.nama}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {template.malam_aturan?.mode !== 'tidak_ada' && (
          <div>
            <label className={lbl}>Mau ke Mana Dulu?</label>
            <select value={urutanKota || 'mekkah'} onChange={e => setUrutanKota(e.target.value)} className={`${inp} max-w-xs`}>
              <option value="mekkah">Mekkah Dulu</option>
              <option value="madinah">Madinah Dulu</option>
            </select>
          </div>
        )}

        {template.malam_aturan?.mode === 'tidak_ada' ? null : template.malam_aturan?.mode === 'fix' ? (
          <div className="text-xs bg-gray-50 rounded-lg px-3 py-2.5 text-gray-600">
            🌙 <b>{template.malam_default?.mekkah || 0} malam Mekkah + {template.malam_default?.madinah || 0} malam Madinah</b> — sudah termasuk itinerary paket ini.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Malam di Mekkah</label>
                <input type="number" min={0} max={20} value={malamMekkah} onChange={e => ubahMalamMekkah(e.target.value)} placeholder="0" className={inp} />
              </div>
              <div>
                <label className={lbl}>Malam di Madinah</label>
                <input type="number" min={0} max={20} value={malamMadinah} onChange={e => ubahMalamMadinah(e.target.value)} placeholder="0" className={inp} />
              </div>
            </div>
            {durasiTerpilih?.malam ? (
              <div className="text-[10px] text-gray-400 mt-1">Total {durasiTerpilih.malam} malam buat durasi {durasiTerpilih.hari} hari — isi salah satu, sisanya otomatis nyesuain.</div>
            ) : null}
          </div>
        )}

        {template.bisa_pilih_urutan_umroh && (
          <div>
            <label className={lbl}>Umroh Dulu atau Negara Tambahan Dulu?</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setUmrohDulu(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${umrohDulu !== false ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                Umroh Dulu
              </button>
              <button type="button" onClick={() => setUmrohDulu(false)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${umrohDulu === false ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                Negara Tambahan Dulu
              </button>
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Cuma ngubah urutan itinerary, harga tetap sama.</div>
          </div>
        )}

        {template.mutawwif_tersedia && (
          template.mutawwif_aturan?.mode === 'fix' ? (
            <div className="text-xs bg-gray-50 rounded-lg px-3 py-2.5 text-gray-600">
              🧭 Mutawwif mendampingi <b>{template.mutawwif_aturan.fixHari} hari</b> — sudah termasuk paket ini.
            </div>
          ) : (
            <div>
              <label className={lbl}>Pakai Mutawwif Berapa Hari?</label>
              <input type="number" min={3} value={mutawwifHari} onChange={e => setMutawwifHari(e.target.value)}
                placeholder="Kosongkan = sepanjang trip" className={`${inp} ${mutawwifInvalid ? 'border-red-400 focus:border-red-400' : ''}`} />
              {mutawwifInvalid ? (
                <div className="text-[10px] text-red-500 mt-1 font-semibold">Minimal 3 hari (1 hari penjemputan + 2 hari umroh) — kosongkan aja kalau mau sepanjang trip.</div>
              ) : (
                <div className="text-[10px] text-gray-400 mt-1">Kalau diisi (gak dikosongin), minimal 3 hari — 1 hari penjemputan + 2 hari umroh.</div>
              )}
            </div>
          )
        )}
        {template.mutawwifah_tersedia && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={pakaiMutawwifah} onChange={e => setPakaiMutawwifah(e.target.checked)} className="w-4 h-4 accent-[#1A4FA0]" />
            Pakai Mutawwifah
          </label>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={jumlahTl !== ''} onChange={e => setJumlahTl(e.target.checked ? '1' : '')} className="w-4 h-4 accent-[#1A4FA0]" />
            Pakai Tour Leader (TL)?
          </label>
          {jumlahTl !== '' ? (
            <div className="mt-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Jumlah TL</div>
              <input type="number" min={1} value={jumlahTl} onChange={e => setJumlahTl(e.target.value)} placeholder="1" className={inp} />
              <div className="text-[10px] text-gray-400 mt-1">TL ikut numpang tiket/hotel/visa, biayanya dibagi rata ke jamaah — bisa nambah estimasi harga.</div>
            </div>
          ) : (
            <div className="text-[10px] text-gray-400 mt-1">Jumlah jamaah di atas belum termasuk Tour Leader — centang ini kalau mau bawa TL sendiri.</div>
          )}
        </div>

        {template.modul_pilihan?.length > 0 && (
          <div>
            <label className={lbl}>🌍 Negara Tambahan</label>
            <div className="space-y-2">
              {modulPilihan.map((m, idx) => {
                const modul = template.modul_pilihan.find(mp => mp.id === Number(m.modul_negara_id));
                const sudahDipilihLain = new Set(modulPilihan.filter((_, i) => i !== idx).map(x => x.modul_negara_id));
                return (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <select value={m.modul_negara_id} onChange={e => ubahModulPilihan(idx, { modul_negara_id: e.target.value, hari: '', hotel_star: '', city_tour_opsi: '' })} className={`${inp} flex-1`}>
                        <option value="">— Pilih Negara —</option>
                        {template.modul_pilihan.filter(mp => !sudahDipilihLain.has(String(mp.id))).map(mp => (
                          <option key={mp.id} value={mp.id}>{mp.nama}</option>
                        ))}
                      </select>
                      {modulPilihan.length > 1 && (
                        <div className="flex flex-col shrink-0">
                          <button type="button" onClick={() => geserModulPilihan(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-25 disabled:hover:text-gray-400 leading-none text-xs px-1" title="Kunjungi lebih dulu">▲</button>
                          <button type="button" onClick={() => geserModulPilihan(idx, 1)} disabled={idx === modulPilihan.length - 1} className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-25 disabled:hover:text-gray-400 leading-none text-xs px-1" title="Kunjungi belakangan">▼</button>
                        </div>
                      )}
                      <button type="button" onClick={() => hapusModulPilihan(idx)} className="text-red-500 text-xs font-bold hover:underline shrink-0">Hapus</button>
                    </div>
                    {modul && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className={lbl}>Hari</label>
                          <select value={m.hari} onChange={e => ubahModulPilihan(idx, { hari: e.target.value })} className={inp}>
                            <option value="">— Pilih —</option>
                            {modul.hari_opsi.map(h => <option key={h} value={h}>{h} Hari</option>)}
                          </select>
                        </div>
                        {modul.pakai_hotel_star && (
                          <div>
                            <label className={lbl}>Bintang Hotel</label>
                            <select value={m.hotel_star} onChange={e => ubahModulPilihan(idx, { hotel_star: e.target.value })} className={inp}>
                              <option value="">— Pilih —</option>
                              {modul.hotel_star_opsi.map(v => <option key={v} value={v}>{v}★</option>)}
                            </select>
                          </div>
                        )}
                        {modul.pakai_city_tour_opsi && (
                          <div>
                            <label className={lbl}>Opsi City Tour</label>
                            <select value={m.city_tour_opsi} onChange={e => ubahModulPilihan(idx, { city_tour_opsi: e.target.value })} className={inp}>
                              <option value="">— Pilih —</option>
                              {modul.city_tour_opsi_opsi.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {modulPilihan.length < template.modul_pilihan.length && (
              <button type="button" onClick={tambahModulPilihan} className="text-xs font-bold text-[#1A4FA0] hover:underline mt-2">+ Tambah Negara</button>
            )}
          </div>
        )}

        {paxAturan.mode === 'pasangan' ? (
          <div>
            <label className={lbl}>
              Jumlah Pasangan Suami Istri (paket private/custom — harga dihitung per pasangan yang beneran ikut)
              <span className="text-[#C9952A]"> — kelipatan pasangan{paxAturan.pasanganMax != null ? `, maks ${paxAturan.pasanganMax} pasang` : ''}</span>
            </label>
            <input type="number" min={1} max={paxAturan.pasanganMax ?? undefined} value={jumlahCowok}
              onChange={e => {
                let v = e.target.value;
                if (v !== '' && paxAturan.pasanganMax != null && Number(v) > paxAturan.pasanganMax) v = String(paxAturan.pasanganMax);
                setJumlahCowok(v); setJumlahCewek(v);
              }}
              placeholder="Mis. 1" className={inp} />
            <div className="text-[10px] text-gray-400 mt-1">Tiap pasang = 1 suami + 1 istri, otomatis sekamar berdua.</div>
          </div>
        ) : paxAturan.mode === 'dinamis' ? (
          <div>
            <label className={lbl}>
              Paket, Kamar &amp; Jumlah Jamaah
              {(paxAturan.min != null || paxAturan.max != null) && (
                <span className="text-[#C9952A]"> — total {paxAturan.min != null ? `min ${paxAturan.min}` : ''}{paxAturan.min != null && paxAturan.max != null ? ', ' : ''}{paxAturan.max != null ? `maks ${paxAturan.max}` : ''} orang</span>
              )}
            </label>
            <div className="text-[10px] text-gray-400 mb-2">1 rombongan boleh campur paket/kamar beda-beda per sub-grup (mis. sebagian Quad, sebagian Triple) — tambah baris kalau perlu.</div>
            <div className="space-y-3">
              {kombinasi.map((k, idx) => {
                const cowokK = Number(k.jumlah_cowok) || 0, cewekK = Number(k.jumlah_cewek) || 0;
                const kapasitasK = k.kamar ? KAPASITAS_KAMAR[k.kamar] : null;
                const pasanganK = Math.min(Number(k.jumlah_pasangan) || 0, cowokK, cewekK);
                const sisaCowokK = cowokK - pasanganK, sisaCewekK = cewekK - pasanganK;
                const kamarHint = kapasitasK ? [
                  pasanganK > 0 && `${Math.ceil((pasanganK * 2) / kapasitasK)} kamar suami istri`,
                  sisaCowokK > 0 && `${Math.ceil(sisaCowokK / kapasitasK)} kamar cowok`,
                  sisaCewekK > 0 && `${Math.ceil(sisaCewekK / kapasitasK)} kamar cewek`,
                ].filter(Boolean).join(' + ') : '';
                return (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0E2F6E]">Kombinasi {idx + 1}</span>
                      {kombinasi.length > 1 && (
                        <button type="button" onClick={() => hapusBarisKombinasi(idx)} className="text-red-500 text-xs font-bold hover:underline">Hapus</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={k.kamar} onChange={e => ubahBarisKombinasi(idx, { kamar: e.target.value })} className={inp}>
                        <option value="">— Tipe Kamar —</option>
                        {KAMAR_LIST.map(km => <option key={km} value={km}>{KAMAR_LABEL[km]}</option>)}
                      </select>
                    </div>
                    {(opsiHotelGabungan.mekkah.length > 0 || opsiHotelGabungan.madinah.length > 0) && (
                      <div className="grid grid-cols-2 gap-2">
                        {['mekkah', 'madinah'].map(kota => {
                          const opsiKota = opsiHotelGabungan[kota];
                          if (opsiKota.length === 0) return null;
                          const bintangList = [...new Set(opsiKota.map(o => o.bintang).filter(Boolean))].sort((a, b) => a - b);
                          const idxKey = `hotel_${kota}_idx`, bintangKey = `bintang_${kota}`;
                          const bintangTerpilih = k[bintangKey] ?? (opsiKota.find(o => o.idx === k[idxKey])?.bintang ?? '');
                          const kandidat = bintangTerpilih ? opsiKota.filter(o => o.bintang === bintangTerpilih) : [];
                          return (
                            <div key={kota} className="space-y-1">
                              <label className={lbl}>Hotel {kota === 'mekkah' ? 'Mekkah' : 'Madinah'}</label>
                              <select value={bintangTerpilih} onChange={e => {
                                const b = e.target.value ? Number(e.target.value) : '';
                                const cocok = opsiKota.filter(o => o.bintang === b);
                                ubahBarisKombinasi(idx, { [bintangKey]: b, [idxKey]: cocok.length === 1 ? cocok[0].idx : '' });
                              }} className={inp}>
                                <option value="">— Bintang —</option>
                                {bintangList.map(b => <option key={b} value={b}>Bintang {b}</option>)}
                              </select>
                              {bintangTerpilih !== '' && kandidat.length > 0 && (
                                <select value={k[idxKey] ?? ''} onChange={e => ubahBarisKombinasi(idx, { [idxKey]: e.target.value === '' ? '' : Number(e.target.value) })} className={inp}>
                                  <option value="">— Pilih Hotel —</option>
                                  {kandidat.map(o => <option key={o.idx} value={o.idx}>{o.nama}</option>)}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" min={0} value={k.jumlah_cowok} onChange={e => ubahBarisKombinasi(idx, { jumlah_cowok: e.target.value })} placeholder="Cowok" className={inp} />
                      <input type="number" min={0} value={k.jumlah_cewek} onChange={e => ubahBarisKombinasi(idx, { jumlah_cewek: e.target.value })} placeholder="Cewek" className={inp} />
                    </div>
                    {cowokK > 0 && cewekK > 0 && (
                      <input type="number" min={0} max={Math.min(cowokK, cewekK)} value={k.jumlah_pasangan}
                        onChange={e => ubahBarisKombinasi(idx, { jumlah_pasangan: e.target.value })} placeholder="Jumlah pasangan suami istri (sekamar berdua, opsional)" className={inp} />
                    )}
                    {kamarHint && <div className="text-[10px] text-gray-500">📦 Perkiraan: {kamarHint}</div>}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={tambahBarisKombinasi} className="text-xs font-bold text-[#1A4FA0] hover:underline mt-2">+ Tambah Kombinasi Kamar</button>
            {kombinasi.length > 0 && (
              <div className="text-xs text-gray-500 mt-2">
                Total: <b>{kombinasi.reduce((s, k) => s + (Number(k.jumlah_cowok) || 0) + (Number(k.jumlah_cewek) || 0), 0)} orang</b>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className={lbl}>
              Jumlah Jamaah (paket private/custom — harga dihitung dari jumlah orang yang beneran ikut)
              {paxAturan.mode === 'fix' && <span className="text-[#C9952A]"> — khusus {paxAturan.fixTotal} orang</span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min={0} value={jumlahCowok} onChange={e => {
                let v = e.target.value;
                if (v !== '' && paxAturan.mode === 'fix') v = String(Math.min(Number(v), Math.max(0, paxAturan.fixTotal - (Number(jumlahCewek) || 0))));
                setJumlahCowok(v);
              }} placeholder="Cowok" className={inp} />
              <input type="number" min={0} value={jumlahCewek} onChange={e => {
                let v = e.target.value;
                if (v !== '' && paxAturan.mode === 'fix') v = String(Math.min(Number(v), Math.max(0, paxAturan.fixTotal - (Number(jumlahCowok) || 0))));
                setJumlahCewek(v);
              }} placeholder="Cewek" className={inp} />
            </div>
            {cowokN > 0 && cewekN > 0 && (
              <div className="mt-2">
                <label className={lbl}>Jumlah Pasangan Suami Istri (sekamar berdua, opsional)</label>
                <input type="number" min={0} max={Math.min(cowokN, cewekN)} value={jumlahPasangan}
                  onChange={e => setJumlahPasangan(e.target.value)} placeholder="0" className={inp} />
                <div className="text-[10px] text-gray-400 mt-1">
                  Maks {Math.min(cowokN, cewekN)} pasang sesuai jumlah cowok/cewek di atas. Sisanya tetap dipisah kamar per gender.
                </div>
              </div>
            )}
          </div>
        )}
        {paxAturan.mode !== 'dinamis' && (kamarPasangan > 0 || kamarCowok > 0 || kamarCewek > 0) && (
          <div className="text-xs bg-[#E8F0FB] text-[#0E2F6E] rounded-lg px-3 py-2.5">
            📦 Perkiraan kebutuhan kamar {KAMAR_LABEL[kamar]}:
            {kamarPasangan > 0 && <> {kamarPasangan} kamar suami istri</>}
            {kamarPasangan > 0 && (kamarCowok > 0 || kamarCewek > 0) && ' + '}
            {kamarCowok > 0 && <> {kamarCowok} kamar cowok</>}
            {kamarCowok > 0 && kamarCewek > 0 && ' + '}
            {kamarCewek > 0 && <>{kamarCewek} kamar cewek</>}
          </div>
        )}

        {(template.umroh_tambahan_tersedia || template.addon_list?.length > 0) && (
          <div>
            <label className={lbl}>Add-on (opsional)</label>
            <div className="space-y-3">
              {template.umroh_tambahan_tersedia && (
                <div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={Number(jumlahUmroh) > 2}
                      onChange={e => setJumlahUmroh(e.target.checked ? '3' : '1')}
                      className="w-4 h-4 accent-[#1A4FA0]" />
                    Tambahan Umroh
                  </label>
                  {Number(jumlahUmroh) > 2 && (
                    <div className="mt-2">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Berapa Kali Tambahan?</div>
                      <input type="number" min={1} value={Math.max(1, Number(jumlahUmroh) - 2)}
                        onChange={e => setJumlahUmroh(String(2 + (Number(e.target.value) || 1)))}
                        placeholder="1" className={inp} />
                      <div className="text-[10px] text-gray-400 mt-1">2x umroh pertama udah termasuk — ini tambahan di luar itu, kena biaya per kali umroh ekstra.</div>
                    </div>
                  )}
                </div>
              )}
              {(() => {
                const punyaOneWay = template.addon_list?.some(a => a.key === 'haramain_express');
                const punyaPp = template.addon_list?.some(a => a.key === 'haramain_express_pp');
                const haramainAktif = addonAktif.has('haramain_express') || addonAktif.has('haramain_express_pp');
                const haramainPpDipilih = addonAktif.has('haramain_express_pp');
                if (!punyaOneWay) return null;
                return (
                  <div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={haramainAktif} onChange={e => toggleHaramain(e.target.checked)} className="w-4 h-4 accent-[#1A4FA0]" />
                      Haramain Express (Kereta Cepat Mekkah–Madinah)
                    </label>
                    {haramainAktif && punyaPp && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => pilihHaramainPp(false)}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-colors ${!haramainPpDipilih ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200'}`}>
                          One Way
                        </button>
                        <button type="button" onClick={() => pilihHaramainPp(true)}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-colors ${haramainPpDipilih ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200'}`}>
                          PP (Pulang-Pergi)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {template.addon_list?.filter(a => a.key !== 'haramain_express' && a.key !== 'haramain_express_pp').map(a => (
                <label key={a.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={addonAktif.has(a.key)} onChange={() => toggleAddon(a.key)} className="w-4 h-4 accent-[#1A4FA0]" />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

        {!hasil ? (
          <button onClick={hitung} disabled={menghitung}
            className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white font-bold py-3 rounded-full transition-colors">
            {menghitung ? 'Menghitung...' : !user ? '🔒 Login untuk Lihat Estimasi' : '🧮 Hitung Estimasi'}
          </button>
        ) : (
          <div className={`border-t border-gray-100 pt-4 transition-opacity ${menghitung ? 'opacity-40' : ''}`}>
            {/* Rinci DULU per paket/kamar (harganya beda-beda tiap tipe,
                jangan langsung dibundling jadi 1 angka doang) — total
                gabungan baru ditaruh PALING BAWAH (dikonfirmasi user
                2026-08-18). */}
            {hasil.kombinasi?.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="text-xs text-gray-400">Rincian per Kombinasi{menghitung && <span className="text-[#1A4FA0] font-semibold"> · menghitung ulang...</span>}</div>
                {hasil.kombinasi.map((k, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#0E2F6E]">{k.jumlah}× {KAMAR_LABEL[k.kamar] || k.kamar}</span>
                      <span className="text-sm font-bold text-[#0E2F6E]">{rp(k.subtotal)}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">{rp(k.harga_per_orang)} / orang</div>
                    {(k.hotel_mekkah || k.hotel_madinah) && (
                      <div className="text-[11px] text-gray-400">{[k.hotel_mekkah && `${k.hotel_mekkah}${k.bintang_mekkah ? ` (★${k.bintang_mekkah})` : ''}`, k.hotel_madinah && `${k.hotel_madinah}${k.bintang_madinah ? ` (★${k.bintang_madinah})` : ''}`].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-400 mb-1">{hasil.kombinasi?.length > 0 ? 'Estimasi Total (semua kombinasi)' : 'Estimasi Harga'}{!hasil.kombinasi?.length && menghitung && <span className="text-[#1A4FA0] font-semibold"> · menghitung ulang...</span>}</div>
            <div className="text-3xl font-black text-[#0E2F6E] mb-4">{rp(hasil.harga_jual)}</div>
            {sudahDiajukan ? (
              <div className="text-sm text-green-700 font-semibold bg-green-50 rounded-lg px-3 py-2.5 text-center">
                ✓ Pengajuan budget terkirim! Tim kami akan segera menghubungi kamu.
              </div>
            ) : (
              <button onClick={ajukanBudget} disabled={mengajukan}
                className="w-full bg-[#C9952A] hover:bg-[#a97d20] disabled:opacity-50 text-white font-bold py-3 rounded-full transition-colors">
                {mengajukan ? 'Mengirim...' : '✅ Ajukan Budget Sekarang'}
              </button>
            )}
            <button onClick={() => { setHasil(null); setSudahDiajukan(false); }} className="w-full text-xs font-bold text-gray-400 hover:text-[#1A4FA0] mt-3">
              Ubah pilihan & hitung ulang
            </button>
          </div>
        )}
      </div>

      <div className="text-[10px] text-gray-400 text-center">
        Harga di atas adalah estimasi, bisa berubah menyesuaikan kondisi terkini. Tim JM Travel akan menghubungi kamu untuk konfirmasi final.
      </div>
    </Layout>
  );
}
