'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { KOSONG_BREAKDOWN, BasisPicker, TRIGGER_KUNCI_LIST, JENIS_PROGRAM_LIST } from '@/app/components/KalkulatorBiaya';
import KalkulatorTerpadu from '@/app/components/KalkulatorTerpadu';
import { useCurrentUser } from '@/lib/useCurrentUser';

const MATA_UANG_LIST = ['IDR', 'SAR', 'USD'];
const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KOSONG_MASTER = { id: null, kelompok: '', nama: '', keterangan: '', harga_default: '', mata_uang: 'IDR', basis_default: 'jamaah', trigger_kunci: '', modul_negara_id: null, urutan: 0, aktif: true };
const KOSONG_MODUL = { id: null, jenis_program: 'umroh_plus', nama: '', mata_uang: 'USD', pakai_periode: false, pakai_hotel_star: false, info_hotel: '', pakai_city_tour_opsi: false, urutan: 0, aktif: true, tiers: [], addons: [], itinerary_per_hari: {}, tl_gratis_min_pax: '' };
const KOSONG_ADDON = { nama: '', mata_uang: 'USD', harga_per_unit: '', basis: 'per_pax', sertakan_tl: true, aktif: true };
const BASIS_ADDON_LIST = [
  { value: 'per_pax', label: 'Per Pax' },
  { value: 'per_pax_hari', label: 'Per Pax × Hari' },
  { value: 'per_hari', label: 'Per Hari (gak dikali pax)' },
  { value: 'flat', label: 'Flat / Per Kloter' },
];
// Cuma jenis_program selain "Umroh Regular" yang butuh modul negara.
const JENIS_PROGRAM_MODUL_LIST = JENIS_PROGRAM_LIST.filter(j => j.value !== 'umroh_regular');
const KOSONG_BRACKET = { pax_min: '', pax_max: '', harga_per_pax: '' };
const KOSONG_CLUSTER = { periode_mulai: '', periode_selesai: '', hotel_star: '', city_tour_opsi: '', hari: '', brackets: [{ ...KOSONG_BRACKET }] };

// Nilai unik `hari` dari daftar tier (urut angka) — buat nentuin varian
// durasi mana aja yang butuh itinerary sendiri-sendiri.
function hariUnikTier(tiers) {
  return [...new Set((tiers || []).map(t => t.hari).filter(v => v !== null && v !== undefined && v !== ''))]
    .sort((a, b) => Number(a) - Number(b));
}

// Baris tier flat (dari/ke DB) <-> "cluster" (1 kombinasi periode/bintang/city
// tour/hari + banyak bracket pax) — biar admin isi dimensi yang sama cuma
// SEKALI per cluster, bukan per baris pax kayak sebelumnya.
function kelompokkanTier(tiers) {
  const map = new Map();
  for (const t of tiers || []) {
    const key = JSON.stringify([t.periode_mulai || '', t.periode_selesai || '', t.hotel_star ?? '', t.city_tour_opsi ?? '', t.hari ?? '']);
    if (!map.has(key)) {
      map.set(key, {
        periode_mulai: t.periode_mulai ? String(t.periode_mulai).slice(0, 10) : '',
        periode_selesai: t.periode_selesai ? String(t.periode_selesai).slice(0, 10) : '',
        hotel_star: t.hotel_star ?? '', city_tour_opsi: t.city_tour_opsi ?? '', hari: t.hari ?? '',
        brackets: [],
      });
    }
    map.get(key).brackets.push({ pax_min: t.pax_min, pax_max: t.pax_max, harga_per_pax: t.harga_per_pax });
  }
  return [...map.values()];
}
function ratakanCluster(clusters) {
  const out = [];
  for (const c of clusters) {
    for (const b of c.brackets) {
      out.push({
        periode_mulai: c.periode_mulai || null, periode_selesai: c.periode_selesai || null,
        hotel_star: c.hotel_star === '' ? null : c.hotel_star, city_tour_opsi: c.city_tour_opsi === '' ? null : c.city_tour_opsi,
        hari: c.hari, pax_min: b.pax_min, pax_max: b.pax_max, harga_per_pax: b.harga_per_pax,
      });
    }
  }
  return out;
}
// Urutan kelompok sesuai sheet "Master" asli — kelompok baru yang belum ada
// di daftar ini (dibuat lewat "+ Tambah Kategori Baru") otomatis nempel di
// belakang, urut alfabet.
const URUTAN_KELOMPOK_MASTER = ['Cost Saudi (Via Mutawwif)', 'Cost Jakarta (Via Management)', 'Cost Transportation', 'Cost Tour Leader', 'Handling Alfiyah'];
function urutkanKelompok(daftar) {
  return [...daftar].sort((a, b) => {
    const ia = URUTAN_KELOMPOK_MASTER.indexOf(a), ib = URUTAN_KELOMPOK_MASTER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}
const KALKULATOR_HOTEL_KOSONG = { mekkah_nama: '', mekkah_rate_double: '', mekkah_rate_triple: '', mekkah_rate_quad: '', mekkah_mata_uang: 'SAR', madinah_nama: '', madinah_rate_double: '', madinah_rate_triple: '', madinah_rate_quad: '', madinah_mata_uang: 'SAR' };
const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

function kosongShared(jenisProgram = 'umroh_regular') {
  return {
    ...KOSONG_BREAKDOWN, jenis_program: jenisProgram,
    total_hari_program: '', manasik_umroh: '', perlengkapan_jamaah: '', haramain_express: '0', handling_jeddah: '',
    city_tour_mekkah: '', city_tour_madinah: '', city_tour_thaif: '', transportasi_pilihan: null,
  };
}
function kosongHotelSet() {
  return { deluxe: { ...KALKULATOR_HOTEL_KOSONG }, eksekutif: { ...KALKULATOR_HOTEL_KOSONG }, signature: { ...KALKULATOR_HOTEL_KOSONG } };
}

export default function KalkulatorBiayaHubPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [templateList, setTemplateList] = useState([]);
  const [masterList, setMasterList] = useState([]);
  const [modulList, setModulList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showMaster, setShowMaster] = useState(false);
  const [formMaster, setFormMaster] = useState(null);
  const [showModul, setShowModul] = useState(false);
  const [formModul, setFormModul] = useState(null);
  const [busyModul, setBusyModul] = useState(false);
  const [busyDuplikat, setBusyDuplikat] = useState(false);

  // Editor template — "head" sumber bentuk kalkulator Umroh Regular: Pax/
  // Kurs/Trigger/Item Master shared buat ketiga bintang, Hotel & Komisi beda
  // per bintang. Disimpan sebagai 3 row biaya_breakdown yang berbagi 1
  // template_group (sama persis polanya kayak kalkulator di form Program).
  const [editorTerbuka, setEditorTerbuka] = useState(false);
  const [templateGroup, setTemplateGroup] = useState(null);
  const [templateBreakdownId, setTemplateBreakdownId] = useState({ deluxe: null, eksekutif: null, signature: null });
  const [kalkulatorShared, setKalkulatorShared] = useState(kosongShared());
  const [kalkulatorHotel, setKalkulatorHotel] = useState(kosongHotelSet());
  const [kalkulatorMalam, setKalkulatorMalam] = useState({ mekkah: '', madinah: '' });
  const [kalkulatorKomisi, setKalkulatorKomisi] = useState({ deluxe: '', eksekutif: '', signature: '' });
  const [kalkulatorMargin, setKalkulatorMargin] = useState({ deluxe: '', eksekutif: '', signature: '' });

  function muat() {
    Promise.all([
      fetch('/api/admin/biaya-breakdown?is_template=1').then(r => r.json()),
      fetch('/api/admin/biaya-master-item?semua=1').then(r => r.json()),
      fetch('/api/admin/modul-negara?semua=1&full=1').then(r => r.json()),
    ]).then(([t, m, mn]) => {
      setTemplateList(t.breakdown || []);
      setMasterList(m.item || []);
      setModulList(mn.modul || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  useEffect(() => { muat(); }, []);

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  function mulaiBaru(jenisProgram = 'umroh_regular') {
    setTemplateGroup(crypto.randomUUID());
    setTemplateBreakdownId({ deluxe: null, eksekutif: null, signature: null });
    setKalkulatorShared(kosongShared(jenisProgram));
    setKalkulatorHotel(kosongHotelSet());
    setKalkulatorMalam({ mekkah: '', madinah: '' });
    setKalkulatorKomisi({ deluxe: '', eksekutif: '', signature: '' });
    setKalkulatorMargin({ deluxe: '', eksekutif: '', signature: '' });
    setEditorTerbuka(true);
  }

  async function bukaTemplate(group) {
    const res = await fetch(`/api/admin/biaya-breakdown?template_group=${group}`);
    const d = await res.json();
    if (!res.ok || !d.breakdown?.length) { alert(d.error || 'Gagal memuat template'); return; }

    const ids = {}; const hotel = kosongHotelSet(); const komisi = { deluxe: '', eksekutif: '', signature: '' };
    const margin = { deluxe: '', eksekutif: '', signature: '' };
    let malam = { mekkah: '', madinah: '' }; let shared = null;
    for (const b of d.breakdown) {
      if (!b.paket) continue;
      ids[b.paket] = b.id;
      hotel[b.paket] = {
        mekkah_nama: b.hotel_mekkah_nama || '', mekkah_rate_double: b.hotel_mekkah_rate_double, mekkah_rate_triple: b.hotel_mekkah_rate_triple, mekkah_rate_quad: b.hotel_mekkah_rate_quad, mekkah_mata_uang: b.hotel_mekkah_mata_uang,
        madinah_nama: b.hotel_madinah_nama || '', madinah_rate_double: b.hotel_madinah_rate_double, madinah_rate_triple: b.hotel_madinah_rate_triple, madinah_rate_quad: b.hotel_madinah_rate_quad, madinah_mata_uang: b.hotel_madinah_mata_uang,
      };
      komisi[b.paket] = b.komisi_rate; margin[b.paket] = b.margin_rate;
      malam = { mekkah: b.hotel_mekkah_malam, madinah: b.hotel_madinah_malam };
      if (!shared) {
        shared = {
          nama: b.nama, paket: '',
          jenis_program: b.jenis_program || 'umroh_regular', modul_tambahan: b.modul_tambahan || {},
          hotel_mode: b.hotel_mode || 'fix', hotel_list: b.hotel_list || [],
          bintang_aktif: b.bintang_aktif || { deluxe: true, eksekutif: true, signature: true },
          pembulatan: Number(b.pembulatan) || 0, umroh_dulu: b.umroh_dulu !== 0 && b.umroh_dulu !== false,
          include_items: b.include_items || '', exclude_items: b.exclude_items || '', itinerary: b.itinerary || [],
          pax_jamaah: b.pax_jamaah, pax_tl: b.pax_tl, pax_mutawwif: b.pax_mutawwif, pax_mutawwifah: b.pax_mutawwifah, pax_driver: b.pax_driver,
          total_hari_program: b.total_hari_program, manasik_umroh: b.manasik_umroh,
          perlengkapan_jamaah: b.perlengkapan_jamaah, haramain_express: b.haramain_express, handling_jeddah: b.handling_jeddah,
          city_tour_mekkah: b.city_tour_mekkah, city_tour_madinah: b.city_tour_madinah, city_tour_thaif: b.city_tour_thaif,
          transportasi_pilihan: b.transportasi_pilihan,
          kurs_usd_idr: b.kurs_usd_idr, kurs_sar_idr: b.kurs_sar_idr,
          tiket_pesawat_rate: b.tiket_pesawat_rate, tiket_pesawat_mata_uang: b.tiket_pesawat_mata_uang, tiket_pesawat_list: b.tiket_pesawat_list || [],
          visa_rate: b.visa_rate, visa_mata_uang: b.visa_mata_uang,
          biaya_lain_lain: b.biaya_lain_lain, biaya_lain_lain_mata_uang: b.biaya_lain_lain_mata_uang,
          items: [],
        };
      }
    }
    if (!shared) return;

    setTemplateGroup(group); setTemplateBreakdownId(ids); setKalkulatorHotel(hotel); setKalkulatorMalam(malam); setKalkulatorKomisi(komisi); setKalkulatorMargin(margin);
    const anyId = Object.values(ids)[0];
    const itemRes = await fetch(`/api/admin/biaya-breakdown?id=${anyId}`);
    const itemD = await itemRes.json();
    const items = (itemD.breakdown?.items || []).map(it => ({ master_item_id: it.master_item_id, kelompok: it.kelompok, nama: it.nama, nominal: it.nominal, mata_uang: it.mata_uang, basis: it.basis, trigger_kunci: it.trigger_kunci, modul_negara_id: it.modul_negara_id }));
    setKalkulatorShared({ ...shared, items });
    setEditorTerbuka(true);
  }

  async function simpanTemplate() {
    if (!kalkulatorShared.nama?.trim()) { alert('Nama template wajib diisi'); return; }
    setBusy(true);
    try {
      // Pax Jamaah >= 15 wajib Bus (aturan operasional) — override apapun
      // yang sempat kepilih pas pax-nya masih di bawah 15.
      const transportasiEfektif = (Number(kalkulatorShared.pax_jamaah) || 0) >= 15 ? 'bus' : kalkulatorShared.transportasi_pilihan;
      for (const paket of PAKET) {
        const h = kalkulatorHotel[paket];
        const existingId = templateBreakdownId[paket];
        const payload = {
          ...kalkulatorShared, paket, transportasi_pilihan: transportasiEfektif,
          hotel_mekkah_nama: h.mekkah_nama, hotel_mekkah_rate_double: h.mekkah_rate_double, hotel_mekkah_rate_triple: h.mekkah_rate_triple, hotel_mekkah_rate_quad: h.mekkah_rate_quad, hotel_mekkah_malam: kalkulatorMalam.mekkah, hotel_mekkah_mata_uang: h.mekkah_mata_uang,
          hotel_madinah_nama: h.madinah_nama, hotel_madinah_rate_double: h.madinah_rate_double, hotel_madinah_rate_triple: h.madinah_rate_triple, hotel_madinah_rate_quad: h.madinah_rate_quad, hotel_madinah_malam: kalkulatorMalam.madinah, hotel_madinah_mata_uang: h.madinah_mata_uang,
          komisi_rate: kalkulatorKomisi[paket], margin_rate: kalkulatorMargin[paket],
          is_template: 1, program_id: null, template_group: templateGroup,
        };
        const res = await fetch('/api/admin/biaya-breakdown', {
          method: existingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(existingId ? { ...payload, id: existingId } : payload),
        });
        const d = await res.json();
        if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
        if (!existingId && d.id) setTemplateBreakdownId(prev => ({ ...prev, [paket]: d.id }));
      }
      setEditorTerbuka(false);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function hapusTemplate(group) {
    if (!confirm('Hapus template ini?')) return;
    const res = await fetch(`/api/admin/biaya-breakdown?template_group=${group}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    muat();
  }

  async function simpanMaster() {
    if (!formMaster.kelompok.trim() || !formMaster.nama.trim()) { alert('Kelompok & nama wajib diisi'); return; }
    const res = await fetch('/api/admin/biaya-master-item', {
      method: formMaster.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formMaster),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
    setFormMaster(null);
    muat();
  }

  async function toggleAktifMaster(m) {
    await fetch('/api/admin/biaya-master-item', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...m, aktif: !m.aktif }),
    });
    muat();
  }

  // Simpan header + tabel tier + biaya tambahan SEKALIGUS dalam 1 klik (dulu
  // 3 tombol terpisah — header dulu, baru tier, baru addon — gampang lupa
  // salah satu). Header disimpan dulu (butuh id kalau modul baru), baru tier
  // & addon nempel ke id itu. Form ditutup otomatis kalau semua sukses.
  async function simpanModul() {
    if (!formModul.nama.trim()) { alert('Nama wajib diisi'); return; }
    setBusyModul(true);
    const res = await fetch('/api/admin/modul-negara', {
      method: formModul.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formModul),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyModul(false); return; }
    const modulId = formModul.id || d.id;

    const [resTier, resAddon] = await Promise.all([
      fetch('/api/admin/modul-negara-tier', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modul_negara_id: modulId, tiers: formModul.tiers }),
      }),
      fetch('/api/admin/modul-negara-addon', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modul_negara_id: modulId, addons: formModul.addons }),
      }),
    ]);
    setBusyModul(false);
    if (!resTier.ok || !resAddon.ok) { alert('Header kesimpen, tapi tier/biaya tambahan gagal kesimpen — coba klik Simpan sekali lagi.'); await muat(); return; }
    await muat();
    setFormModul(null);
  }

  async function toggleAktifModul(m) {
    await fetch('/api/admin/modul-negara', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...m, aktif: !m.aktif }),
    });
    muat();
  }

  // Hapus permanen (tier & addon ikut kehapus lewat ON DELETE CASCADE). Kalau
  // modul ini masih ditautkan ke Item Master/breakdown, DB nolak lewat FK
  // constraint — API balikin pesan yang jelasin itu, bukan cuma "gagal".
  async function hapusModul(m) {
    if (!confirm(`Hapus modul negara "${m.nama}"? Semua tabel tier & biaya tambahannya ikut kehapus. Kalau masih dipakai program lain, sebaiknya "Nonaktifkan" saja.`)) return;
    const res = await fetch(`/api/admin/modul-negara?id=${m.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    if (formModul?.id === m.id) setFormModul(null);
    muat();
  }

  // Duplikat 1 modul negara (header + SEMUA tier + addon) jadi modul BARU —
  // LANGSUNG kesimpen ke DB berurutan (header dulu buat dapet id baru, baru
  // tier & addon nempel ke id itu), bukan cuma disalin ke form lokal kayak
  // sebelumnya. Versi lama bikin tier/addon BARU beneran kesimpen kalau admin
  // masih inget klik "Simpan Tabel Tier"/"Simpan Biaya Tambahan" manual
  // sesudahnya — gampang kelewat, jadi duplikatnya keliatan "kosong" tier-nya.
  async function duplikatModul(m) {
    setBusyDuplikat(true);
    const header = {
      jenis_program: m.jenis_program, nama: `${m.nama} (Copy)`, mata_uang: m.mata_uang,
      pakai_periode: m.pakai_periode, pakai_hotel_star: m.pakai_hotel_star, info_hotel: m.info_hotel || '', pakai_city_tour_opsi: m.pakai_city_tour_opsi,
      urutan: m.urutan, itinerary_per_hari: m.itinerary_per_hari || {}, tl_gratis_min_pax: m.tl_gratis_min_pax ?? '',
    };
    const resHeader = await fetch('/api/admin/modul-negara', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(header),
    });
    const dHeader = await resHeader.json();
    if (!resHeader.ok) { alert(dHeader.error || 'Gagal duplikat modul'); setBusyDuplikat(false); return; }
    const newId = dHeader.id;

    const tiers = (m.tiers || []).map(t => ({ ...t, id: undefined, modul_negara_id: undefined }));
    const addons = (m.addons || []).map(a => ({ ...a, id: undefined, modul_negara_id: undefined }));
    const [resTier, resAddon] = await Promise.all([
      fetch('/api/admin/modul-negara-tier', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modul_negara_id: newId, tiers }),
      }),
      fetch('/api/admin/modul-negara-addon', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modul_negara_id: newId, addons }),
      }),
    ]);
    if (!resTier.ok || !resAddon.ok) alert('Header berhasil diduplikat, tapi ada tier/biaya tambahan yang gagal ikut tersalin — cek & simpan ulang manual di form-nya.');

    setBusyDuplikat(false);
    await muat();
    setFormModul({ ...header, id: newId, aktif: true, tiers, addons });
  }

  const kelompokMaster = urutkanKelompok([...new Set(masterList.map(m => m.kelompok))]);

  return (
    <Layout title="🧮 Costing Program" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Khusus super admin. Bangun HPP dari komponen biaya (hotel per bintang/kamar/malam + item multi-currency dari
        daftar Master) — halaman ini adalah SUMBER template Umroh Regular, disimpan buat dipakai ulang atau langsung
        dipilih pas bikin/edit program di{' '}
        <a href="/admin/programs" className="text-[#1A4FA0] font-semibold hover:underline">Kelola Program</a>.
      </div>

      <button onClick={() => setShowMaster(v => !v)} className="text-xs font-bold text-[#1A4FA0] hover:underline mb-4 block">
        {showMaster ? 'Sembunyikan' : '📋 Kelola Master Item'}
      </button>

      {showMaster && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#0E2F6E]">Daftar Harga Acuan (Master Item)</div>
            {!formMaster && (
              <div className="flex gap-3">
                <button onClick={() => {
                  const nama = prompt('Nama kategori/kelompok biaya baru (mis. "Handling Alfiyah"):');
                  if (nama?.trim()) setFormMaster({ ...KOSONG_MASTER, kelompok: nama.trim() });
                }} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Kategori Baru</button>
                <button onClick={() => setFormMaster(KOSONG_MASTER)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Item</button>
              </div>
            )}
          </div>
          {formMaster && !formMaster.id && (
            <div className="mb-4">
              <FormMasterItem value={formMaster} onChange={setFormMaster} onSimpan={simpanMaster} onBatal={() => setFormMaster(null)} kelompokMaster={kelompokMaster} modulList={modulList} />
            </div>
          )}

          {kelompokMaster.map(kelompok => (
            <div key={kelompok} className="mb-4">
              <div className="text-xs font-bold text-gray-500 mb-2">{kelompok}</div>
              <div className="space-y-2">
                {masterList.filter(m => m.kelompok === kelompok).map(m => (
                  formMaster?.id === m.id ? (
                    <FormMasterItem key={m.id} value={formMaster} onChange={setFormMaster} onSimpan={simpanMaster} onBatal={() => setFormMaster(null)} kelompokMaster={kelompokMaster} modulList={modulList} />
                  ) : (
                    <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5">
                      <div className="text-sm">
                        <span className="font-semibold text-gray-700">{m.nama}</span>{' '}
                        {m.modul_negara_id ? (
                          <span className="text-xs text-[#1A4FA0]">(📦 {modulList.find(mn => mn.id === m.modul_negara_id)?.nama || 'Modul Negara'})</span>
                        ) : (
                          <span className="text-xs text-gray-400">({m.mata_uang} {Number(m.harga_default).toLocaleString('id-ID')})</span>
                        )}
                        {!m.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setFormMaster({ ...m, keterangan: m.keterangan || '', harga_default: m.harga_default, aktif: !!m.aktif })} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                        <button onClick={() => toggleAktifMaster(m)} className="text-xs font-bold text-amber-600 hover:underline">{m.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          ))}
          {masterList.length === 0 && <div className="text-xs text-gray-400">Belum ada item master.</div>}
        </div>
      )}

      <button onClick={() => setShowModul(v => !v)} className="text-xs font-bold text-[#1A4FA0] hover:underline mb-4 block">
        {showModul ? 'Sembunyikan' : '🌍 Kelola Modul Negara'}
      </button>

      {showModul && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="text-xs text-gray-400 mb-3">
            Modul negara = paket tambahan (Dubai/Turkey dkk) yang tarifnya berdasarkan tabel tier per-jumlah-jamaah
            (bukan flat per orang). Bikin modulnya dulu, isi tabel tier-nya, baru tautkan ke 1 Item Master (kelompok
            &quot;Cost Dubai&quot;/&quot;Cost Turkey&quot;) lewat field &quot;Modul Negara&quot; di form Item Master di atas.
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#0E2F6E]">Daftar Modul Negara</div>
            {!formModul && (
              <button onClick={() => setFormModul(KOSONG_MODUL)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Modul Negara</button>
            )}
          </div>
          {formModul && !formModul.id && (
            <div className="mb-4">
              <FormModulNegara value={formModul} onChange={setFormModul} onSimpan={simpanModul} onBatal={() => setFormModul(null)} busy={busyModul} />
            </div>
          )}
          <div className="space-y-2">
            {modulList.map(m => (
              formModul?.id === m.id ? (
                <FormModulNegara key={m.id} value={formModul} onChange={setFormModul} onSimpan={simpanModul} onBatal={() => setFormModul(null)} busy={busyModul} />
              ) : (
                <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5">
                  <div className="text-sm">
                    <span className="font-semibold text-gray-700">{m.nama}</span>{' '}
                    <span className="text-xs text-gray-400">
                      ({JENIS_PROGRAM_MODUL_LIST.find(j => j.value === m.jenis_program)?.label || m.jenis_program}, {m.mata_uang}, {(m.tiers || []).length} tier)
                    </span>
                    {m.info_hotel && <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🏨 {m.info_hotel}</span>}
                    {!m.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setFormModul({ ...m, tiers: m.tiers || [], addons: m.addons || [], itinerary_per_hari: m.itinerary_per_hari || {}, tl_gratis_min_pax: m.tl_gratis_min_pax ?? '' })} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                    <button onClick={() => duplikatModul(m)} disabled={busyDuplikat} className="text-xs font-bold text-emerald-600 hover:underline disabled:opacity-50">{busyDuplikat ? 'Menduplikat...' : 'Duplikat'}</button>
                    <button onClick={() => toggleAktifModul(m)} className="text-xs font-bold text-amber-600 hover:underline">{m.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button onClick={() => hapusModul(m)} className="text-xs font-bold text-red-600 hover:underline">Hapus</button>
                  </div>
                </div>
              )
            ))}
            {modulList.length === 0 && <div className="text-xs text-gray-400">Belum ada modul negara.</div>}
          </div>
        </div>
      )}

      {!editorTerbuka && (
        <button onClick={() => mulaiBaru('umroh_regular')} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl mb-6">
          + Costing Baru
        </button>
      )}

      {editorTerbuka && (
        <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 mb-6">
          <div className="mb-3">
            <label className={lbl}>Nama Template</label>
            <input value={kalkulatorShared.nama} onChange={e => setKalkulatorShared(prev => ({ ...prev, nama: e.target.value }))} placeholder="Mis. Umroh 9 Hari Regular" className={inp} />
          </div>
          <KalkulatorTerpadu
            aktif={true} onToggle={() => {}}
            shared={kalkulatorShared} setShared={setKalkulatorShared}
            hotel={kalkulatorHotel} setHotel={setKalkulatorHotel}
            malam={kalkulatorMalam} setMalam={setKalkulatorMalam}
            komisi={kalkulatorKomisi} setKomisi={setKalkulatorKomisi}
            margin={kalkulatorMargin} setMargin={setKalkulatorMargin}
            showTemplatePicker={false} showToggle={false}
            katalogModul={modulList.filter(m => m.aktif)}
          />
          <div className="flex gap-2 mt-4">
            <button onClick={simpanTemplate} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {busy ? 'Menyimpan...' : '💾 Simpan Template'}
            </button>
            <button onClick={() => setEditorTerbuka(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Tutup</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <div className="space-y-2">
          {templateList.length === 0 && (
            <div className="text-center text-gray-400 py-10 text-sm">Belum ada template tersimpan.</div>
          )}
          {templateList.map(t => (
            <div key={t.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
              <button onClick={() => bukaTemplate(t.id)} className="text-left font-bold text-[#0E2F6E] hover:underline">{t.nama}</button>
              <button onClick={() => hapusTemplate(t.id)} className="text-xs font-bold text-red-500 hover:underline shrink-0">Hapus</button>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

// Form tambah/edit Master Item — dipakai baik buat "+ Tambah Item" (di atas
// list) maupun buat Edit (nempel inline di baris item yang diedit) biar gak
// perlu scroll ke atas pas edit.
function FormMasterItem({ value, onChange, onSimpan, onBatal, kelompokMaster, modulList = [] }) {
  const modulTerpilih = value.modul_negara_id ? modulList.find(m => String(m.id) === String(value.modul_negara_id)) : null;

  function pilihModul(id) {
    if (!id) { onChange({ ...value, modul_negara_id: null, trigger_kunci: '' }); return; }
    onChange({ ...value, modul_negara_id: Number(id), trigger_kunci: `modul_negara_${id}` });
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border-2 border-[#1A4FA0]/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Kelompok</label>
          <input value={value.kelompok} onChange={e => onChange({ ...value, kelompok: e.target.value })} placeholder="Mis. Cost Saudi (Via Mutawwif)" className={inp} list="kelompok-list" />
          <datalist id="kelompok-list">{kelompokMaster.map(k => <option key={k} value={k} />)}</datalist>
        </div>
        <div>
          <label className={lbl}>Nama Item</label>
          <input value={value.nama} onChange={e => onChange({ ...value, nama: e.target.value })} placeholder="Mis. Ongkos mutawwif ke Airport Jeddah" className={inp} />
        </div>
      </div>
      <div>
        <label className={lbl}>Keterangan (opsional)</label>
        <input value={value.keterangan} onChange={e => onChange({ ...value, keterangan: e.target.value })} className={inp} />
      </div>

      <div>
        <label className={lbl}>Modul Negara (LAWAS — sejak 2026-07-27 sudah gak perlu dipakai lagi, lihat catatan di bawah)</label>
        <select value={value.modul_negara_id || ''} onChange={e => pilihModul(e.target.value)} className={inp}>
          <option value="">— Tidak terkait —</option>
          {modulList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
        </select>
      </div>

      {modulTerpilih ? (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          ⚠ Mekanisme lama — sekarang cost modul negara dihitung LANGSUNG dari &quot;Pilih Modul Negara&quot; di kalkulator
          (gak butuh Item Master lagi). Item ini gak lagi ikut ke-hitung ke HPP; kalau cuma buat data lama, boleh dibiarkan,
          tapi jangan dipakai buat item baru — pilih &quot;— Tidak terkait —&quot; di atas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Harga Default</label>
              <input type="number" value={value.harga_default} onChange={e => onChange({ ...value, harga_default: e.target.value })} className={inp} />
            </div>
            <div>
              <label className={lbl}>Mata Uang</label>
              <select value={value.mata_uang} onChange={e => onChange({ ...value, mata_uang: e.target.value })} className={inp}>
                {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>Basis Qty (item ini ngikut headcount apa)</label>
            <BasisPicker value={value.basis_default} onChange={v => onChange({ ...value, basis_default: v })} />
          </div>
          <div>
            <label className={lbl}>Trigger (kapan item ini ke-hitung otomatis)</label>
            <select value={value.trigger_kunci || ''} onChange={e => onChange({ ...value, trigger_kunci: e.target.value })} className={inp}>
              {TRIGGER_KUNCI_LIST.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={onSimpan} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">💾 Simpan</button>
        <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>
    </div>
  );
}

// Form tambah/edit Modul Negara (Dubai/Turkey dkk) + editor tabel tier-nya.
// Header (nama/jenis_program/flag pakai_*) disimpan terpisah dari tier (tier
// butuh id modul dulu) — makanya ada 2 tombol simpan berbeda.
//
// Tier di-edit sebagai "cluster": 1 kombinasi Periode/Bintang Hotel/City Tour/
// Hari diisi SEKALI, lalu di bawahnya tinggal nambah baris pax-bracket
// (pax_min/pax_max/harga) — bukan ngulang semua dimensi di tiap baris pax
// kayak sebelumnya. `value.tiers` tetap flat (satu baris per bracket, sesuai
// bentuk yang disimpan API) — cluster cuma tampilan, di-explode balik ke flat
// tiap kali berubah lewat ratakanCluster().
function FormModulNegara({ value, onChange, onSimpan, onBatal, busy }) {
  function batal() {
    if (confirm('Batal? Perubahan yang belum disimpan bakal hilang.')) onBatal();
  }
  const clusters = kelompokkanTier(value.tiers);

  function terapkanCluster(next) {
    onChange({ ...value, tiers: ratakanCluster(next) });
  }
  function tambahCluster() {
    terapkanCluster([...clusters, { ...KOSONG_CLUSTER, brackets: [{ ...KOSONG_BRACKET }] }]);
  }
  function ubahCluster(ci, patch) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, ...patch } : c));
  }
  function hapusCluster(ci) {
    terapkanCluster(clusters.filter((_, i) => i !== ci));
  }
  // Duplikat 1 cluster (periode/bintang/city tour + semua bracket pax-nya) —
  // buat bikin varian baru (mis. Hari yang beda tapi harga per-pax mirip)
  // tanpa harus ngetik ulang semua bracket harga dari nol. `hari` SENGAJA
  // dikosongin (bukan ikut di-copy) — cluster dikelompokkan berdasar kombinasi
  // periode+bintang+city_tour+HARI (lihat kelompokkanTier), jadi kalau hari-nya
  // ikut sama persis, cluster hasil duplikat bakal langsung KE-MERGE BALIK ke
  // cluster asli begitu di-render ulang (key-nya identik), bukan jadi cluster
  // terpisah. Wajib diisi beda dulu sama admin biar gak collide.
  function duplikatCluster(ci) {
    const asli = clusters[ci];
    terapkanCluster([...clusters, { ...asli, hari: '', brackets: asli.brackets.map(b => ({ ...b })) }]);
  }
  function tambahBracket(ci) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, brackets: [...c.brackets, { ...KOSONG_BRACKET }] } : c));
  }
  function ubahBracket(ci, bi, patch) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, brackets: c.brackets.map((b, j) => j === bi ? { ...b, ...patch } : b) } : c));
  }
  function hapusBracket(ci, bi) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, brackets: c.brackets.filter((_, j) => j !== bi) } : c));
  }

  function tambahAddon() {
    onChange({ ...value, addons: [...(value.addons || []), { ...KOSONG_ADDON }] });
  }
  function ubahAddon(ai, patch) {
    onChange({ ...value, addons: value.addons.map((a, i) => i === ai ? { ...a, ...patch } : a) });
  }
  function hapusAddon(ai) {
    onChange({ ...value, addons: value.addons.filter((_, i) => i !== ai) });
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border-2 border-[#1A4FA0]/30">
      <div>
        <label className={lbl}>Nama Tampil</label>
        <input value={value.nama} onChange={e => onChange({ ...value, nama: e.target.value })} placeholder="Mis. Dubai - MED Alliance" className={inp} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Jenis Program</label>
          <select value={value.jenis_program} onChange={e => onChange({ ...value, jenis_program: e.target.value })} className={inp}>
            {JENIS_PROGRAM_MODUL_LIST.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Mata Uang Tarif</label>
          <select value={value.mata_uang} onChange={e => onChange({ ...value, mata_uang: e.target.value })} className={inp}>
            {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.pakai_periode} onChange={e => onChange({ ...value, pakai_periode: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Tarif beda per Periode (musim)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.pakai_hotel_star} onChange={e => onChange({ ...value, pakai_hotel_star: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Tarif beda per Bintang Hotel
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.pakai_city_tour_opsi} onChange={e => onChange({ ...value, pakai_city_tour_opsi: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Tarif beda per City Tour
        </label>
      </div>
      <div>
        <label className={lbl}>Info Hotel (opsional)</label>
        <input value={value.info_hotel || ''} onChange={e => onChange({ ...value, info_hotel: e.target.value })} placeholder="Mis. Bintang 4" className={`${inp} max-w-xs`} />
        <div className="text-[10px] text-gray-400 mt-1">
          Cuma info tampilan (mis. buat itinerary/PDF) — gak ngaruh ke harga. Kalau tarifnya emang beda per bintang, pakai toggle &quot;Tarif beda per Bintang Hotel&quot; di atas, bukan field ini.
        </div>
      </div>
      <div>
        <label className={lbl}>TL Gratis Mulai Berapa Jamaah (opsional)</label>
        <input type="number" value={value.tl_gratis_min_pax} onChange={e => onChange({ ...value, tl_gratis_min_pax: e.target.value })} placeholder="Kosongkan kalau TL selalu gratis" className={`${inp} max-w-xs`} />
        <div className="text-[10px] text-gray-400 mt-1">
          Skema umum vendor: &quot;20 jamaah + 1 TL gratis&quot; — isi 20 kalau TL baru gratis mulai grup 20 jamaah (di bawah itu TL tetap kena tarif per-pax penuh). Kosongkan kalau TL emang selalu gratis apapun jumlah jamaahnya.
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">{busy ? 'Menyimpan...' : '💾 Simpan'}</button>
        <button onClick={batal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>

      <div className="border-t border-gray-200 pt-3 space-y-3">
          <div className="text-xs font-bold text-gray-500">Tabel Tier (harga per-pax berdasar jumlah jamaah)</div>

          {clusters.map((c, ci) => (
            <div key={ci} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-end">
                {!!value.pakai_periode && (
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Periode Mulai</div>
                    <input type="date" value={c.periode_mulai} onChange={e => ubahCluster(ci, { periode_mulai: e.target.value })} className={`${inp} w-36`} />
                  </div>
                )}
                {!!value.pakai_periode && (
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Periode Selesai</div>
                    <input type="date" value={c.periode_selesai} onChange={e => ubahCluster(ci, { periode_selesai: e.target.value })} className={`${inp} w-36`} />
                  </div>
                )}
                {!!value.pakai_hotel_star && (
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Bintang Hotel</div>
                    <input type="number" value={c.hotel_star} onChange={e => ubahCluster(ci, { hotel_star: e.target.value })} placeholder="4" className={`${inp} w-20`} />
                  </div>
                )}
                {!!value.pakai_city_tour_opsi && (
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Nama City Tour</div>
                    <input value={c.city_tour_opsi} onChange={e => ubahCluster(ci, { city_tour_opsi: e.target.value })} placeholder="Mis. Thaif" className={`${inp} w-36`} />
                  </div>
                )}
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">Hari</div>
                  <input type="number" value={c.hari} onChange={e => ubahCluster(ci, { hari: e.target.value })} placeholder="Wajib diisi" className={`${inp} w-16`} />
                </div>
                <button onClick={() => duplikatCluster(ci)} className="text-[#1A4FA0] text-xs font-bold hover:underline mb-2 ml-auto shrink-0">Duplikat Cluster</button>
                <button onClick={() => hapusCluster(ci)} className="text-red-500 text-xs font-bold hover:underline mb-2 shrink-0">Hapus Cluster</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="p-1">Pax Min</th>
                      <th className="p-1">Pax Max (kosong = +)</th>
                      <th className="p-1">Harga/Pax</th>
                      <th className="p-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.brackets.map((b, bi) => (
                      <tr key={bi} className="border-t border-gray-100">
                        <td className="p-1"><input type="number" value={b.pax_min ?? ''} onChange={e => ubahBracket(ci, bi, { pax_min: e.target.value })} className={`${inp} w-20`} /></td>
                        <td className="p-1"><input type="number" value={b.pax_max ?? ''} onChange={e => ubahBracket(ci, bi, { pax_max: e.target.value })} className={`${inp} w-20`} /></td>
                        <td className="p-1"><input type="number" value={b.harga_per_pax ?? ''} onChange={e => ubahBracket(ci, bi, { harga_per_pax: e.target.value })} className={`${inp} w-24`} /></td>
                        <td className="p-1"><button onClick={() => hapusBracket(ci, bi)} className="text-red-500 text-xs font-bold hover:underline">Hapus</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => tambahBracket(ci)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Pax Bracket</button>
            </div>
          ))}
          {clusters.length === 0 && <div className="text-xs text-gray-400">Belum ada cluster tier.</div>}

          <button onClick={tambahCluster} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Cluster Baru</button>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="text-xs font-bold text-gray-500">Biaya Tambahan (Visa, Tips Guide, Porter, dkk)</div>
            <div className="text-[10px] text-gray-400">
              Beda dari tabel tier di atas — ini biaya linear (rate tetap × qty), bukan bracket per-jumlah-jamaah. Kalau ada
              beberapa pilihan tarif buat 1 jenis biaya (mis. Visa Regular/Express/Turis), tambahin masing-masing sebagai baris
              terpisah lalu nonaktifkan yang gak dipakai — cuma yang ✅ Aktif yang ke-hitung.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="p-1">Nama</th>
                    <th className="p-1">Mata Uang</th>
                    <th className="p-1">Harga/Unit</th>
                    <th className="p-1">Basis</th>
                    <th className="p-1" title="Kalau dicontreng, headcount-nya jamaah + TL. Kalau enggak, cuma jamaah aja (mis. Tips Guide biasanya cuma ditanggung jamaah, tapi Porter Airport/Hotel tetap kena buat TL juga).">Termasuk TL</th>
                    <th className="p-1">Aktif</th>
                    <th className="p-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {(value.addons || []).map((a, ai) => (
                    <tr key={ai} className="border-t border-gray-100">
                      <td className="p-1"><input value={a.nama} onChange={e => ubahAddon(ai, { nama: e.target.value })} placeholder="Mis. Tips Guide" className={`${inp} w-36`} /></td>
                      <td className="p-1">
                        <select value={a.mata_uang} onChange={e => ubahAddon(ai, { mata_uang: e.target.value })} className={inp}>
                          {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input type="number" value={a.harga_per_unit} onChange={e => ubahAddon(ai, { harga_per_unit: e.target.value })} className={`${inp} w-24`} /></td>
                      <td className="p-1">
                        <select value={a.basis} onChange={e => ubahAddon(ai, { basis: e.target.value })} className={inp}>
                          {BASIS_ADDON_LIST.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                        </select>
                      </td>
                      <td className="p-1 text-center"><input type="checkbox" checked={a.sertakan_tl !== 0 && a.sertakan_tl !== false} onChange={e => ubahAddon(ai, { sertakan_tl: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" /></td>
                      <td className="p-1 text-center"><input type="checkbox" checked={!!a.aktif} onChange={e => ubahAddon(ai, { aktif: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" /></td>
                      <td className="p-1"><button onClick={() => hapusAddon(ai)} className="text-red-500 text-xs font-bold hover:underline">Hapus</button></td>
                    </tr>
                  ))}
                  {(value.addons || []).length === 0 && (
                    <tr><td colSpan={7} className="p-2 text-gray-400">Belum ada biaya tambahan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <button onClick={tambahAddon} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Biaya Tambahan</button>
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="text-xs font-bold text-gray-500">Itinerary (per Program Wisata/Umroh Plus yang pakai modul ini)</div>
            <div className="text-[10px] text-gray-400">
              Diisi per varian Hari (dari tabel tier di atas) — begitu admin pilih modul ini + Hari sekian di kalkulator,
              itinerary di bawah ini otomatis kepasang, gak perlu diketik ulang tiap bikin kalkulator baru.
            </div>
            {hariUnikTier(value.tiers).length === 0 ? (
              <div className="text-xs text-gray-400">Isi dulu tabel tier di atas (butuh nilai Hari) buat munculin kolom itinerary.</div>
            ) : (
              hariUnikTier(value.tiers).map(hari => (
                <div key={hari} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-[#0E2F6E] mb-2">{hari} Hari</div>
                  <div className="space-y-2">
                    {Array.from({ length: Number(hari) }, (_, i) => (
                      <div key={i}>
                        <div className="text-[10px] text-gray-400 mb-1">Hari {i + 1}</div>
                        <textarea
                          value={(value.itinerary_per_hari?.[hari] && value.itinerary_per_hari[hari][i]) || ''}
                          onChange={e => {
                            const arr = Array.isArray(value.itinerary_per_hari?.[hari]) ? [...value.itinerary_per_hari[hari]] : [];
                            arr[i] = e.target.value;
                            onChange({ ...value, itinerary_per_hari: { ...(value.itinerary_per_hari || {}), [hari]: arr } });
                          }}
                          rows={2} className={`${inp} text-xs`} placeholder={`Kegiatan hari ke-${i + 1}...`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            <button onClick={onSimpan} disabled={busy} className="bg-[#C9952A] hover:bg-[#a97d20] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">{busy ? 'Menyimpan...' : '💾 Simpan'}</button>
          </div>
        </div>
    </div>
  );
}
