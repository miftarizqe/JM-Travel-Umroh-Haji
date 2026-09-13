'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { KOSONG_BREAKDOWN } from '@/app/components/KalkulatorBiaya';
import KalkulatorTerpadu from '@/app/components/KalkulatorTerpadu';
import { useCurrentUser } from '@/lib/useCurrentUser';

const PAKET = ['deluxe', 'eksekutif', 'signature'];
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
  const [modulList, setModulList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
      fetch('/api/admin/modul-negara?semua=1&full=1').then(r => r.json()),
    ]).then(([t, mn]) => {
      setTemplateList(t.breakdown || []);
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
          margin_mode: b.margin_mode || 'flat', margin_persen: b.margin_persen,
          komisi_mode: b.komisi_mode || 'flat', komisi_persen: b.komisi_persen,
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
          // Custom Hotel per Kota (Bintang Mekkah/Madinah dicampur) —
          // margin_mode/margin_persen/komisi_mode/komisi_persen sudah ikut
          // ke-spread dari kalkulatorShared di atas, dipakai bareng di
          // hitungHargaCustomHotelDenganDb (src/lib/hotelCustomPricing.js).
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

  return (
    <Layout title="🧮 Costing Program" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Khusus super admin. Bangun HPP dari komponen biaya (hotel per bintang/kamar/malam + item multi-currency dari
        daftar Master) — halaman ini adalah SUMBER template Umroh Regular, disimpan buat dipakai ulang atau langsung
        dipilih pas bikin/edit program di{' '}
        <a href="/admin/programs" className="text-[#1A4FA0] font-semibold hover:underline">Kelola Program</a>.
      </div>

      {/* CRUD Master Item & Modul Negara dipindah ke /admin/master-data
          (2026-08-16), akses dari nav sidebar ("Master Data (Modul & Harga)")
          — halaman ini fokus costing doang, gak perlu link keluar lagi di
          sini. modulList tetap di-fetch (lihat muat()) buat dipakai picker
          "Modul Negara Tambahan" di KalkulatorTerpadu bawah; masterList gak
          perlu di-fetch di sini sama sekali karena KalkulatorBiaya.jsx (dipakai
          KalkulatorTerpadu) udah fetch katalog master item-nya sendiri. */}

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

// Form tambah/edit Master Item DIPINDAH ke halaman terpisah
// /admin/master-data (2026-08-16) — sama alasannya kayak Modul Negara di
// bawah, biar admin cuma perlu 1 tempat buat semua data master.

// Form tambah/edit Modul Negara (Dubai/Turkey dkk) DIPINDAH ke halaman
// terpisah /admin/master-data (2026-08-16) — Modul Negara + Master Harga
// Hotel/Tiket sekarang jadi 1 "cluster" pusat data master, biar admin cuma
// perlu 1 tempat buat semua data master. Halaman ini cuma BACA modulList
// (lihat muat() di atas & katalogModul prop ke KalkulatorTerpadu di bawah)
// buat milih modul negara yang mau ditempel ke program yang lagi di-costing,
// gak nge-CRUD modul negara-nya lagi dari sini.
