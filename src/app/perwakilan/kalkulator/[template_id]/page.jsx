'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { KAPASITAS_KAMAR } from '@/lib/kalkulatorBiaya';

const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad (ber-4)', triple: 'Triple (ber-3)', double: 'Double (ber-2)' };
const KAMAR_LIST = ['quad', 'triple', 'double'];
const RUTE_LABEL = { direct: 'Direct', transit: 'Transit' };
const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;

// Kalkulator Perwakilan — clone & adaptasi dari
// src/app/kalkulator/[template_id]/page.jsx (Kalkulator Estimasi Publik).
// Isian rute/hotel/malam/mutawwif/durasi/negara tambahan SAMA PERSIS, mode
// kombinasi kamar campuran (paxAturan.mode 'dinamis') DI LUAR SCOPE v1.
// Bedanya di hasil: HPP diperlihatkan (bukan disembunyikan), margin/ujroh
// diisi sendiri, dan hasil BISA DISIMPAN (draft) alih-alih auto-insert tiap
// hitung — baru diajukan ke admin kalau perwakilan eksplisit klik Ajukan.
export default function KalkulatorPerwakilanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = params?.template_id;
  const quoteId = searchParams.get('quote_id');
  const [user] = useCurrentUser();

  const [template, setTemplate] = useState(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [paket, setPaket] = useState('');
  const [kamar, setKamar] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [durasi, setDurasi] = useState('');
  const [urutanKota, setUrutanKota] = useState('');
  const [umrohDulu, setUmrohDulu] = useState(null);
  const [addonAktif, setAddonAktif] = useState(new Set());
  const [rute, setRute] = useState('');
  const [hotelMekkahIdx, setHotelMekkahIdx] = useState(null);
  const [hotelMadinahIdx, setHotelMadinahIdx] = useState(null);
  const [hotelMekkahBintang, setHotelMekkahBintang] = useState(null);
  const [hotelMadinahBintang, setHotelMadinahBintang] = useState(null);
  const [malamMekkah, setMalamMekkah] = useState('');
  const [malamMadinah, setMalamMadinah] = useState('');
  const [mutawwifHari, setMutawwifHari] = useState('');
  const [pakaiMutawwifah, setPakaiMutawwifah] = useState(true);
  const [jumlahTl, setJumlahTl] = useState('');
  const [jumlahCowok, setJumlahCowok] = useState('');
  const [jumlahCewek, setJumlahCewek] = useState('');
  const [jumlahPasangan, setJumlahPasangan] = useState('');
  const [modulPilihan, setModulPilihan] = useState([]);
  const [maskapai, setMaskapai] = useState('');
  const [jumlahUmroh, setJumlahUmroh] = useState('1');

  const [menghitung, setMenghitung] = useState(false);
  const [hasil, setHasil] = useState(null); // { hpp, itinerary, addon_config }
  const [marginInput, setMarginInput] = useState('');
  const [namaQuote, setNamaQuote] = useState('');
  const [catatanPerwakilan, setCatatanPerwakilan] = useState('');
  const [savedId, setSavedId] = useState(quoteId || null);
  const [savedStatus, setSavedStatus] = useState('draft');
  const [menyimpan, setMenyimpan] = useState(false);
  const [mengajukan, setMengajukan] = useState(false);
  const [tersimpanBaruSaja, setTersimpanBaruSaja] = useState(false);
  const [error, setError] = useState('');
  const quoteDimuatSudah = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'perwakilan') { router.replace('/login'); return; }
  }, [user, router]);

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
        setLoadingTemplate(false);
      })
      .catch(() => { setNotFound(true); setLoadingTemplate(false); });
  }, [templateId]);

  // Lanjutin draft yang sudah pernah disimpan (dibuka dari "Quote Saya") —
  // isi ulang semua field dari addon_config yang sudah dibekukan.
  useEffect(() => {
    if (!quoteId || quoteDimuatSudah.current) return;
    quoteDimuatSudah.current = true;
    fetch(`/api/perwakilan/kalkulator?id=${quoteId}`).then(r => r.json())
      .then(d => {
        if (!d.lead) return;
        const q = d.lead;
        let cfg = q.addon_config;
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
        setSavedId(q.id); setSavedStatus(q.status);
        setPaket(q.paket); setKamar(q.kamar);
        setTanggal(q.tanggal_berangkat ? String(q.tanggal_berangkat).slice(0, 10) : '');
        setNamaQuote(q.nama_quote || ''); setCatatanPerwakilan(q.catatan_perwakilan || '');
        setMarginInput(String(q.margin_perwakilan ?? ''));
        if (cfg) {
          setAddonAktif(new Set(cfg.addon_keys || []));
          setRute(cfg.rute || '');
          setMalamMekkah(cfg.malam_mekkah != null ? String(cfg.malam_mekkah) : '');
          setMalamMadinah(cfg.malam_madinah != null ? String(cfg.malam_madinah) : '');
          setMutawwifHari(cfg.mutawwif_hari != null ? String(cfg.mutawwif_hari) : '');
          setPakaiMutawwifah(cfg.pakai_mutawwifah !== false);
          setJumlahTl(cfg.pax_tl ? String(cfg.pax_tl) : '');
          setJumlahCowok(cfg.jumlah_cowok != null ? String(cfg.jumlah_cowok) : '');
          setJumlahCewek(cfg.jumlah_cewek != null ? String(cfg.jumlah_cewek) : '');
          setMaskapai(cfg.maskapai || '');
        }
        // HPP snapshot langsung dianggap "hasil" biar harga jual & tombol
        // aksi langsung muncul tanpa perlu hitung ulang dulu.
        setHasil({ hpp: { [q.kamar]: q.hpp_snapshot }, itinerary: [], addon_config: cfg });
      })
      .catch(() => {});
  }, [quoteId]);

  const paxAturan = template?.pax_aturan || { mode: 'dinamis', fixTotal: null, min: null, max: null };
  const opsiHotelGabungan = template?.hotel_opsi_gabungan || { mekkah: [], madinah: [] };
  const paketMountSudah = useRef(false);
  useEffect(() => {
    if (!paketMountSudah.current) { paketMountSudah.current = true; return; }
    setHotelMekkahIdx(null); setHotelMadinahIdx(null);
  }, [paket]);

  function pilihDurasi(d) {
    setDurasi(String(d.hari));
    if (d.malam) {
      const separuh = Math.ceil(d.malam / 2);
      setMalamMekkah(String(separuh));
      setMalamMadinah(String(d.malam - separuh));
    }
  }
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
  function tambahModulPilihan() {
    setModulPilihan(prev => [...prev, { modul_negara_id: '', hari: '', hotel_star: '', city_tour_opsi: '' }]);
  }
  function ubahModulPilihan(idx, patch) {
    setModulPilihan(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
  }
  function hapusModulPilihan(idx) {
    setModulPilihan(prev => prev.filter((_, i) => i !== idx));
  }
  function geserModulPilihan(idx, arah) {
    const tujuan = idx + arah;
    if (tujuan < 0 || tujuan >= modulPilihan.length) return;
    setModulPilihan(prev => {
      const next = [...prev];
      [next[idx], next[tujuan]] = [next[tujuan], next[idx]];
      return next;
    });
  }

  async function hitung() {
    setError('');
    if (paxAturan.mode === 'dinamis') {
      setError('Template ini pakai kombinasi kamar campuran, belum didukung di Kalkulator Perwakilan.');
      return;
    }
    if (!paket || !kamar) { setError('Pilih paket & tipe kamar dulu.'); return; }
    if (template.rute_list?.length > 0 && !rute) { setError('Pilih rute (direct/transit) dulu.'); return; }
    if (template.maskapai_list?.length > 0 && !maskapai) { setError('Pilih maskapai dulu.'); return; }
    if (opsiHotelGabungan.mekkah.length > 0 && hotelMekkahIdx == null) { setError('Pilih hotel Mekkah dulu.'); return; }
    if (opsiHotelGabungan.madinah.length > 0 && hotelMadinahIdx == null) { setError('Pilih hotel Madinah dulu.'); return; }
    if (template.malam_aturan?.mode !== 'fix' && template.malam_aturan?.mode !== 'tidak_ada' && (!malamMekkah || !malamMadinah)) { setError('Isi jumlah malam di Mekkah & Madinah dulu.'); return; }
    if (template.durasi_opsi?.length > 0 && !durasi) { setError('Pilih durasi Umroh dulu.'); return; }
    if (mutawwifHari !== '' && Number(mutawwifHari) < 3) { setError('Hari Mutawwif minimal 3 hari — kosongkan aja kalau mau sepanjang trip.'); return; }
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
    const totalPax = (Number(jumlahCowok) || 0) + (Number(jumlahCewek) || 0);
    if (paxAturan.mode === 'pasangan') {
      const jumlahPasanganDipilih = Number(jumlahCowok) || 0;
      if (jumlahPasanganDipilih < 1) { setError('Isi jumlah pasangan dulu (minimal 1 pasang).'); return; }
      if (paxAturan.pasanganMax != null && jumlahPasanganDipilih > paxAturan.pasanganMax) { setError(`Paket ini maksimal ${paxAturan.pasanganMax} pasang.`); return; }
    } else {
      if (totalPax < 1) { setError('Isi jumlah jamaah cowok/cewek dulu (minimal 1 orang).'); return; }
      if (paxAturan.mode === 'fix' && totalPax !== paxAturan.fixTotal) { setError(`Paket ini khusus ${paxAturan.fixTotal} orang.`); return; }
      if (paxAturan.mode === 'dinamis' && paxAturan.min != null && totalPax < paxAturan.min) { setError(`Paket ini minimal ${paxAturan.min} orang.`); return; }
      if (paxAturan.mode === 'dinamis' && paxAturan.max != null && totalPax > paxAturan.max) { setError(`Paket ini maksimal ${paxAturan.max} orang.`); return; }
    }

    setMenghitung(true);
    try {
      const res = await fetch('/api/perwakilan/kalkulator/hitung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId, tanggal_berangkat: tanggal || null, addon_keys: [...addonAktif],
          paket, kamar, jumlah_cowok: jumlahCowok || 0, jumlah_cewek: jumlahCewek || 0,
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
      if (!res.ok) { setError(d.error || 'Gagal menghitung'); setMenghitung(false); return; }
      setHasil(d);
      setSavedId(null); setSavedStatus('draft'); setTersimpanBaruSaja(false);
    } catch { setError('Terjadi kesalahan, coba lagi.'); }
    setMenghitung(false);
  }

  const hppTerpilih = hasil ? Number(hasil.hpp?.[kamar] || 0) : 0;
  const marginNum = Number(marginInput) || 0;
  const hargaJualPerwakilan = hppTerpilih + marginNum;

  async function simpanQuote() {
    if (!hasil) return;
    setMenyimpan(true); setError('');
    try {
      const res = await fetch('/api/perwakilan/kalkulator/simpan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: savedId || undefined,
          template_id: templateId, paket, kamar, tanggal_berangkat: tanggal || null,
          addon_config: hasil.addon_config, hpp_snapshot: hppTerpilih, margin_perwakilan: marginNum,
          nama_quote: namaQuote || null, catatan_perwakilan: catatanPerwakilan || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal menyimpan quote'); setMenyimpan(false); return; }
      setSavedId(d.id); setSavedStatus('draft'); setTersimpanBaruSaja(true);
    } catch { setError('Terjadi kesalahan, coba lagi.'); }
    setMenyimpan(false);
  }

  async function ajukanQuote() {
    if (!savedId) return;
    setMengajukan(true); setError('');
    try {
      const res = await fetch(`/api/perwakilan/kalkulator/${savedId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ajukan' }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Gagal mengajukan'); setMengajukan(false); return; }
      setSavedStatus('diajukan');
    } catch { setError('Terjadi kesalahan, coba lagi.'); }
    setMengajukan(false);
  }

  // Cetak/bagikan ke jamaah — HPP & margin SENGAJA gak ikut, cuma harga jual
  // final + rincian pilihan, yang emang boleh dilihat jamaah.
  function cetakQuote() {
    if (!hasil) return;
    const tanggalCetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const cfg = hasil.addon_config || {};
    const baris = [
      cfg.rute && `Rute: ${RUTE_LABEL[cfg.rute] || cfg.rute}`,
      cfg.hotel_mekkah && `Hotel Mekkah: ${cfg.hotel_mekkah}`,
      cfg.hotel_madinah && `Hotel Madinah: ${cfg.hotel_madinah}`,
      (cfg.malam_mekkah || cfg.malam_madinah) && `Malam: ${cfg.malam_mekkah || 0}N Mekkah + ${cfg.malam_madinah || 0}N Madinah`,
      cfg.mutawwif_hari != null && `Mutawwif: ${cfg.mutawwif_hari} hari`,
    ].filter(Boolean);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Quote — ${namaQuote || template?.nama}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;padding:24px;}
        h1{font-size:20px;margin:0 0 4px;} h2{font-size:13px;color:#666;font-weight:normal;margin:0 0 16px;}
        .item{padding:6px 0;border-bottom:1px solid #eee;}
        .total{font-size:20px;font-weight:bold;margin-top:20px;padding:14px;background:#E8F0FB;border-radius:8px;color:#0E2F6E;}
        .btn-download{position:fixed;top:16px;right:16px;background:#1A4FA0;color:#fff;border:none;padding:10px 18px;
          border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer;}
        @media print{ @page{size:A4;margin:16mm;} .btn-download{display:none;} }
      </style></head><body>
      <button type="button" class="btn-download" onclick="window.print()">📄 Download PDF</button>
      <h1>${template?.nama || '-'}</h1>
      <h2>${namaQuote ? namaQuote + ' · ' : ''}Paket ${PAKET_LABEL[paket] || paket} — ${KAMAR_LABEL[kamar] || kamar} · dicetak ${tanggalCetak}</h2>
      ${baris.map(b => `<div class="item">${b}</div>`).join('')}
      <div class="total">Harga: ${rp(hargaJualPerwakilan)} / orang</div>
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Popup diblokir browser — izinkan popup buat halaman ini dulu.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  if (loadingTemplate) {
    return <Layout title="🧮 Kalkulator Perwakilan" showBack><div className="text-center text-gray-400 py-20">Memuat...</div></Layout>;
  }
  if (notFound || !template) {
    return <Layout title="🧮 Kalkulator Perwakilan" showBack><div className="text-center text-gray-400 py-20">Paket tidak ditemukan.</div></Layout>;
  }

  const inp = "w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1.5";
  const paketList = template.paket_list?.length > 0 ? template.paket_list : ['deluxe'];
  const durasiTerpilih = template.durasi_opsi?.find(d => String(d.hari) === durasi) || null;
  const mutawwifInvalid = mutawwifHari !== '' && Number(mutawwifHari) < 3;

  const cowokN = Number(jumlahCowok) || 0, cewekN = Number(jumlahCewek) || 0;
  const kapasitas = kamar ? KAPASITAS_KAMAR[kamar] : null;
  const pasanganN = paxAturan.mode === 'pasangan' ? Math.min(cowokN, cewekN) : Math.min(Number(jumlahPasangan) || 0, cowokN, cewekN);
  const sisaCowokN = cowokN - pasanganN, sisaCewekN = cewekN - pasanganN;
  const kamarPasangan = kapasitas && pasanganN > 0 ? Math.ceil((pasanganN * 2) / kapasitas) : 0;
  const kamarCowok = kapasitas && sisaCowokN > 0 ? Math.ceil(sisaCowokN / kapasitas) : 0;
  const kamarCewek = kapasitas && sisaCewekN > 0 ? Math.ceil(sisaCewekN / kapasitas) : 0;

  const isDinamis = paxAturan.mode === 'dinamis';

  return (
    <Layout title={`🧮 ${template.nama}`} showBack backHref="/perwakilan/kalkulator">
      {template.deskripsi && <div className="text-sm text-gray-600 mb-6">{template.deskripsi}</div>}

      {isDinamis && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700 mb-4">
          ⚠️ Template ini pakai kombinasi kamar campuran (paket private/custom dinamis) — belum didukung di Kalkulator Perwakilan versi ini.
        </div>
      )}

      <div className={`bg-white rounded-2xl border border-[#e0e8f0] p-5 space-y-4 mb-6 ${isDinamis ? 'opacity-40 pointer-events-none' : ''}`}>
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
        </div>

        {paketList.length > 1 && (
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

        {(opsiHotelGabungan.mekkah.length > 0 || opsiHotelGabungan.madinah.length > 0) && (
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
              {mutawwifInvalid && <div className="text-[10px] text-red-500 mt-1 font-semibold">Minimal 3 hari — kosongkan aja kalau mau sepanjang trip.</div>}
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
          {jumlahTl !== '' && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Jumlah TL</div>
              <input type="number" min={1} value={jumlahTl} onChange={e => setJumlahTl(e.target.value)} placeholder="1" className={inp} />
            </div>
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
                          <button type="button" onClick={() => geserModulPilihan(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-25 leading-none text-xs px-1">▲</button>
                          <button type="button" onClick={() => geserModulPilihan(idx, 1)} disabled={idx === modulPilihan.length - 1} className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-25 leading-none text-xs px-1">▼</button>
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
            <label className={lbl}>Jumlah Pasangan Suami Istri{paxAturan.pasanganMax != null ? ` — maks ${paxAturan.pasanganMax} pasang` : ''}</label>
            <input type="number" min={1} max={paxAturan.pasanganMax ?? undefined} value={jumlahCowok}
              onChange={e => {
                let v = e.target.value;
                if (v !== '' && paxAturan.pasanganMax != null && Number(v) > paxAturan.pasanganMax) v = String(paxAturan.pasanganMax);
                setJumlahCowok(v); setJumlahCewek(v);
              }}
              placeholder="Mis. 1" className={inp} />
          </div>
        ) : (
          <div>
            <label className={lbl}>
              Jumlah Jamaah
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
              </div>
            )}
          </div>
        )}
        {(kamarPasangan > 0 || kamarCowok > 0 || kamarCewek > 0) && (
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
                      <input type="number" min={1} value={Math.max(1, Number(jumlahUmroh) - 2)}
                        onChange={e => setJumlahUmroh(String(2 + (Number(e.target.value) || 1)))}
                        placeholder="1" className={inp} />
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
                      Haramain Express
                    </label>
                    {haramainAktif && punyaPp && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => pilihHaramainPp(false)}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-colors ${!haramainPpDipilih ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200'}`}>
                          One Way
                        </button>
                        <button type="button" onClick={() => pilihHaramainPp(true)}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-colors ${haramainPpDipilih ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200'}`}>
                          PP
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
          <button onClick={hitung} disabled={menghitung || isDinamis}
            className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white font-bold py-3 rounded-full transition-colors">
            {menghitung ? 'Menghitung...' : '🧮 Hitung HPP'}
          </button>
        ) : (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">HPP ({KAMAR_LABEL[kamar]})</div>
              <div className="text-xl font-black text-gray-700">{rp(hppTerpilih)}</div>
            </div>
            <div>
              <label className={lbl}>Margin / Ujroh Anda (Rp per orang)</label>
              <input type="number" min={0} value={marginInput} onChange={e => setMarginInput(e.target.value)} placeholder="0" className={inp} />
            </div>
            <div className="bg-[#E8F0FB] rounded-xl p-4">
              <div className="text-xs text-[#1A4FA0] mb-1">Harga Jual ke Jamaah</div>
              <div className="text-2xl font-black text-[#0E2F6E]">{rp(hargaJualPerwakilan)}</div>
            </div>

            <div>
              <label className={lbl}>Nama Quote (opsional, mis. &quot;Buat Bu Siti&quot;)</label>
              <input value={namaQuote} onChange={e => setNamaQuote(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Catatan (opsional)</label>
              <input value={catatanPerwakilan} onChange={e => setCatatanPerwakilan(e.target.value)} className={inp} />
            </div>

            {tersimpanBaruSaja && (
              <div className="text-xs text-green-700 font-semibold bg-green-50 rounded-lg px-3 py-2 text-center">✓ Quote tersimpan!</div>
            )}
            {savedStatus !== 'draft' && (
              <div className="text-xs text-yellow-700 font-semibold bg-yellow-50 rounded-lg px-3 py-2 text-center">
                Status: {savedStatus === 'diajukan' ? 'Sudah diajukan ke admin' : savedStatus === 'disetujui' ? 'Disetujui admin' : 'Ditolak admin'} — gak bisa diedit lagi.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={simpanQuote} disabled={menyimpan || savedStatus !== 'draft'}
                className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white font-bold py-2.5 rounded-full transition-colors">
                {menyimpan ? 'Menyimpan...' : '💾 Simpan Quote'}
              </button>
              <button onClick={ajukanQuote} disabled={!savedId || mengajukan || savedStatus !== 'draft'}
                className="flex-1 bg-[#C9952A] hover:bg-[#a97d20] disabled:opacity-50 text-white font-bold py-2.5 rounded-full transition-colors">
                {mengajukan ? 'Mengirim...' : '📤 Ajukan ke Admin'}
              </button>
              <button onClick={cetakQuote} className="flex-1 border-2 border-[#1A4FA0] text-[#1A4FA0] font-bold py-2.5 rounded-full transition-colors hover:bg-[#E8F0FB]">
                🖨️ Cetak/Bagikan
              </button>
            </div>
            <button onClick={() => { setHasil(null); setSavedId(null); setSavedStatus('draft'); setTersimpanBaruSaja(false); }} className="w-full text-xs font-bold text-gray-400 hover:text-[#1A4FA0]">
              Ubah pilihan & hitung ulang
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
