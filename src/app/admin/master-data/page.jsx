'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { BasisPicker, TRIGGER_KUNCI_LIST } from '@/app/components/KalkulatorBiaya';
import KalkulatorAcuanEditor from '@/app/components/KalkulatorAcuanEditor';
import PaketTematikManager from '@/app/components/PaketTematikManager';
import { useCurrentUser } from '@/lib/useCurrentUser';

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";
const KOTA_LABEL = { mekkah: 'Mekkah', madinah: 'Madinah' };
// Sub-tab dalam grup "🗃️ Master" — dulu 3 tab terpisah (Hotel/Tiket/Master
// Item) + Kurs nyasar ke halaman Pengaturan Umum, digabung jadi 1 grup biar
// gak berserakan (dikonfirmasi user 2026-08-18).
const MASTER_SUBTABS = ['hotel', 'tiket', 'master-item', 'kurs'];
const RUTE_LABEL = { direct: 'Direct', transit: 'Transit' };
const MATA_UANG_LIST = ['IDR', 'SAR', 'USD'];
const rp = (n) => Number(n || 0).toLocaleString('id-ID');

const KOSONG_MODUL = { id: null, nama: '', mata_uang: 'USD', pakai_periode: false, pakai_hotel_star: false, info_hotel: '', pakai_city_tour_opsi: false, urutan: 0, aktif: true, tiers: [], addons: [], itinerary_per_hari: {}, include_exclude: {}, tl_gratis_min_pax: '' };
const KOSONG_ADDON = { nama: '', mata_uang: 'USD', harga_per_unit: '', basis: 'per_pax', sertakan_tl: true, aktif: true };
const BASIS_ADDON_LIST = [
  { value: 'per_pax', label: 'Per Pax' },
  { value: 'per_pax_hari', label: 'Per Pax × Hari' },
  { value: 'per_hari', label: 'Per Hari (gak dikali pax)' },
  { value: 'flat', label: 'Flat / Per Kloter' },
];
const KOSONG_JENIS_PROGRAM = { value: null, label: '', punya_umroh: true, boleh_modul_negara: false, tipe_program: 'Umroh', urutan: 0, aktif: true };
const TIPE_PROGRAM_LIST = ['Umroh', 'Haji', 'Wisata Muslim'];
const KOSONG_BRACKET = { pax_min: '', pax_max: '', harga_per_pax: '' };
const KOSONG_CLUSTER = { periode_mulai: '', periode_selesai: '', berlaku_sampai: '', hotel_star: '', city_tour_opsi: '', hari: '', brackets: [{ ...KOSONG_BRACKET }] };

const KOSONG_MASTER = { id: null, kelompok: '', nama: '', keterangan: '', harga_default: '', mata_uang: 'IDR', basis_default: 'jamaah', trigger_kunci: '', modul_negara_id: null, urutan: 0, aktif: true };
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

// Varian (Hari, City Tour) unik dari tabel tier — dipakai buat itinerary
// per-varian (lihat itineraryHariModul di kalkulatorBiaya.js). City Tour
// beda (mis. "Half Day" vs "Full Day") BISA punya kegiatan beda walau
// jumlah Hari-nya sama, jadi gak cukup dikelompokkan per Hari doang kayak
// hariUnikTier(). Kalau modul ini gak pakai City Tour, city tour disamain
// '' semua (collapse ke perilaku lama — 1 itinerary per Hari).
function variantUnikTier(tiers, pakaiCityTour) {
  const map = new Map();
  for (const t of tiers || []) {
    if (t.hari === '' || t.hari == null) continue;
    const cityTour = pakaiCityTour ? (t.city_tour_opsi || '') : '';
    const key = `${t.hari}::${cityTour}`;
    if (!map.has(key)) map.set(key, { hari: t.hari, cityTour });
  }
  return [...map.values()].sort((a, b) => Number(a.hari) - Number(b.hari) || String(a.cityTour).localeCompare(String(b.cityTour)));
}

// Nilai City Tour unik dari tabel tier — buat Include/Exclude, yang beda per
// City Tour tapi SAMA buat semua Hari (beda dari variantUnikTier di atas
// yang juga mecah per Hari — include/exclude gak sedetail itu). '' selalu
// disertakan di depan (entry "berlaku semua city tour").
function cityTourUnikTier(tiers, pakaiCityTour) {
  if (!pakaiCityTour) return [''];
  const set = new Set(['']);
  for (const t of tiers || []) { if (t.city_tour_opsi) set.add(t.city_tour_opsi); }
  return [...set];
}

// Baris tier flat (dari/ke DB) <-> "cluster" (1 kombinasi periode/bintang/city
// tour/hari + banyak bracket pax) — biar admin isi dimensi yang sama cuma
// SEKALI per cluster, bukan per baris pax kayak sebelumnya.
function kelompokkanTier(tiers) {
  const map = new Map();
  for (const t of tiers || []) {
    const key = JSON.stringify([t.periode_mulai || '', t.periode_selesai || '', t.berlaku_sampai || '', t.hotel_star ?? '', t.city_tour_opsi ?? '', t.hari ?? '']);
    if (!map.has(key)) {
      map.set(key, {
        periode_mulai: t.periode_mulai ? String(t.periode_mulai).slice(0, 10) : '',
        periode_selesai: t.periode_selesai ? String(t.periode_selesai).slice(0, 10) : '',
        berlaku_sampai: t.berlaku_sampai ? String(t.berlaku_sampai).slice(0, 10) : '',
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
        periode_mulai: c.periode_mulai || null, periode_selesai: c.periode_selesai || null, berlaku_sampai: c.berlaku_sampai || null,
        hotel_star: c.hotel_star === '' ? null : c.hotel_star, city_tour_opsi: c.city_tour_opsi === '' ? null : c.city_tour_opsi,
        hari: c.hari, pax_min: b.pax_min, pax_max: b.pax_max, harga_per_pax: b.harga_per_pax,
      });
    }
  }
  return out;
}

// Rate/tier tanpa periode_selesai ATAU berlaku_sampai keliatan "Berlaku
// selamanya" — gak ada tanda kadaluarsa sama sekali, resiko admin gak sadar
// masih makai harga vendor yang udah basi. berlaku_sampai itu FALLBACK
// (dipakai kalau periode_selesai kosong), BUKAN gantiin periode_selesai —
// batas mana pun yang keisi, itu yang dipakai buat cek kadaluarsa.
function sudahKadaluarsa(selesai, berlakuSampai) {
  const batas = selesai || berlakuSampai;
  if (!batas) return false;
  return new Date(batas) < new Date(new Date().toDateString());
}
function labelPeriode(mulai, selesai, berlakuSampai) {
  const f = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '?';
  const kadaluarsa = sudahKadaluarsa(selesai, berlakuSampai) ? ' · ⚠️ Kadaluarsa' : '';
  if (mulai || selesai) return `${f(mulai)} s/d ${f(selesai)}${kadaluarsa}`;
  if (berlakuSampai) return `Berlaku sampai ${f(berlakuSampai)}${kadaluarsa}`;
  return 'Berlaku selamanya';
}
function kosongHotel() {
  return { kota: 'mekkah', bintang: 3, nama_hotel: '' };
}
function kosongPeriode() {
  return { periode_mulai: '', periode_selesai: '', berlaku_sampai: '', rate_double: '', rate_triple: '', rate_quad: '', mata_uang: 'SAR' };
}
function kosongTiket() {
  return { nama_rute: '', kota_asal: '', kota_tujuan: '', rute: '', negara_transit_id: '', periode_mulai: '', periode_selesai: '', berlaku_sampai: '', rate: '', mata_uang: 'IDR' };
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
// Header (nama/flag pakai_*) disimpan terpisah dari tier (tier
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
      <div className="w-40">
        <label className={lbl}>Mata Uang Tarif</label>
        <select value={value.mata_uang} onChange={e => onChange({ ...value, mata_uang: e.target.value })} className={inp}>
          {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
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
          <div className="text-[10px] text-gray-400 -mt-2">
            Dikelompokkan Hari → City Tour → Bintang Hotel biar gampang dibaca. <b>Bintang Hotel &amp; Nama City Tour BOLEH dikosongin</b> per cluster kalau harganya emang sama terlepas dari dimensi itu — gak perlu bikin kombinasi silang penuh (mis. kalau City Tour &quot;Thaif&quot; harganya sama aja mau hotel bintang berapa, cukup 1 cluster City Tour Thaif tanpa isi Bintang Hotel).
          </div>

          {(() => {
            const urut = clusters
              .map((c, ci) => ({ c, ci }))
              .sort((a, b) => {
                const h = Number(a.c.hari || 0) - Number(b.c.hari || 0);
                if (h !== 0) return h;
                const ct = String(a.c.city_tour_opsi || '').localeCompare(String(b.c.city_tour_opsi || ''));
                if (ct !== 0) return ct;
                return Number(a.c.hotel_star || 0) - Number(b.c.hotel_star || 0);
              });
            let hariSebelumnya, cityTourSebelumnya;
            const elemen = [];
            urut.forEach(({ c, ci }) => {
              if (c.hari !== hariSebelumnya) {
                hariSebelumnya = c.hari; cityTourSebelumnya = undefined;
                elemen.push(
                  <div key={`hari-${ci}`} className="text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] rounded px-2 py-1 mt-2">
                    📅 Hari {c.hari || '?'}
                  </div>
                );
              }
              if (!!value.pakai_city_tour_opsi && c.city_tour_opsi !== cityTourSebelumnya) {
                cityTourSebelumnya = c.city_tour_opsi;
                elemen.push(
                  <div key={`ct-${ci}`} className="text-[11px] font-bold text-gray-500 pl-2 mt-1">
                    🚌 {c.city_tour_opsi || 'Tanpa City Tour spesifik (berlaku semua)'}
                  </div>
                );
              }
              elemen.push(
                <div key={ci} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2 ml-3">
                  {sudahKadaluarsa(c.periode_selesai, c.berlaku_sampai) && (
                    <div className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded inline-block">⚠️ Kadaluarsa — masih bisa dipakai, tapi cek dulu harganya masih valid apa enggak</div>
                  )}
                  <div className="flex flex-wrap gap-2 items-end">
                    {!!value.pakai_periode && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Periode Mulai</div>
                        <input type="date" value={c.periode_mulai} onChange={e => { if (e.target.value) ubahCluster(ci, { periode_mulai: e.target.value }); }} className={`${inp} w-36`} />
                      </div>
                    )}
                    {!!value.pakai_periode && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Periode Selesai</div>
                        <input type="date" value={c.periode_selesai} onChange={e => { if (e.target.value) ubahCluster(ci, { periode_selesai: e.target.value }); }} className={`${inp} w-36`} />
                      </div>
                    )}
                    {!value.pakai_periode && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Berlaku Sampai (opsional)</div>
                        <input type="date" value={c.berlaku_sampai} onChange={e => ubahCluster(ci, { berlaku_sampai: e.target.value })} className={`${inp} w-36`} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — gak pakai musim/periode, kosongkan kalau emang berlaku selamanya." />
                      </div>
                    )}
                    {!!value.pakai_hotel_star && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Bintang Hotel (kosongkan = semua bintang)</div>
                        <input type="number" value={c.hotel_star} onChange={e => ubahCluster(ci, { hotel_star: e.target.value })} placeholder="Semua" className={`${inp} w-24`} />
                      </div>
                    )}
                    {!!value.pakai_city_tour_opsi && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Nama City Tour (kosongkan = semua opsi)</div>
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
              );
            });
            return elemen;
          })()}
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
              {!!value.pakai_city_tour_opsi && ' City Tour beda (mis. Half Day vs Full Day) bisa diisi itinerary beda-beda walau jumlah Hari-nya sama.'}
            </div>
            {(() => {
              const varian = variantUnikTier(value.tiers, value.pakai_city_tour_opsi);
              if (varian.length === 0) {
                return <div className="text-xs text-gray-400">Isi dulu tabel tier di atas (butuh nilai Hari) buat munculin kolom itinerary.</div>;
              }
              function ambilArr(hari, cityTour) {
                const data = value.itinerary_per_hari?.[hari];
                if (Array.isArray(data)) return data;
                if (data && typeof data === 'object') return data[cityTour] || data[''] || [];
                return [];
              }
              function ubahTeks(hari, cityTour, i, teks) {
                const existing = value.itinerary_per_hari?.[hari];
                if (!value.pakai_city_tour_opsi) {
                  const arr = Array.isArray(existing) ? [...existing] : [];
                  arr[i] = teks;
                  onChange({ ...value, itinerary_per_hari: { ...(value.itinerary_per_hari || {}), [hari]: arr } });
                  return;
                }
                const obj = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? { ...existing } : {};
                const arr = Array.isArray(obj[cityTour]) ? [...obj[cityTour]] : [];
                arr[i] = teks;
                onChange({ ...value, itinerary_per_hari: { ...(value.itinerary_per_hari || {}), [hari]: { ...obj, [cityTour]: arr } } });
              }
              let hariSebelumnya;
              const elemen = [];
              varian.forEach(({ hari, cityTour }) => {
                if (hari !== hariSebelumnya) {
                  hariSebelumnya = hari;
                  elemen.push(
                    <div key={`h-${hari}`} className="text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] rounded px-2 py-1 mt-2">📅 Hari {hari}</div>
                  );
                }
                elemen.push(
                  <div key={`${hari}::${cityTour}`} className="bg-white border border-gray-200 rounded-lg p-3 ml-3">
                    {!!value.pakai_city_tour_opsi && (
                      <div className="text-[11px] font-bold text-gray-500 mb-2">🚌 {cityTour || 'Tanpa City Tour spesifik (berlaku semua)'}</div>
                    )}
                    <div className="space-y-2">
                      {Array.from({ length: Number(hari) }, (_, i) => (
                        <div key={i}>
                          <div className="text-[10px] text-gray-400 mb-1">Hari {i + 1}</div>
                          <textarea
                            value={ambilArr(hari, cityTour)[i] || ''}
                            onChange={e => ubahTeks(hari, cityTour, i, e.target.value)}
                            rows={2} className={`${inp} text-xs`} placeholder={`Kegiatan hari ke-${i + 1}...`} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
              return elemen;
            })()}
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="text-xs font-bold text-gray-500">Include / Exclude (opsional — tambahan info)</div>
            <div className="text-[10px] text-gray-400">
              Digabung OTOMATIS ke daftar Termasuk/Tidak Termasuk Program begitu modul ini dipilih — gak perlu diketik ulang tiap bikin kalkulator baru.
              {!!value.pakai_city_tour_opsi && ' Boleh beda per City Tour (mis. Full Day include makan siang, Half Day enggak).'}
            </div>
            {cityTourUnikTier(value.tiers, value.pakai_city_tour_opsi).map(cityTour => {
              const entry = value.include_exclude?.[cityTour] || {};
              function ubah(field, teks) {
                onChange({ ...value, include_exclude: { ...(value.include_exclude || {}), [cityTour]: { ...entry, [field]: teks } } });
              }
              return (
                <div key={cityTour || '_default'} className="bg-white border border-gray-200 rounded-lg p-3">
                  {!!value.pakai_city_tour_opsi && (
                    <div className="text-[11px] font-bold text-gray-500 mb-2">🚌 {cityTour || 'Tanpa City Tour spesifik (berlaku semua)'}</div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">✅ Termasuk (1 baris per item)</div>
                      <textarea value={entry.include || ''} onChange={e => ubah('include', e.target.value)} rows={3} className={`${inp} text-xs`} placeholder={'Mis.\nTiket masuk Burj Khalifa\nAC bus'} />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">❌ Tidak Termasuk (1 baris per item)</div>
                      <textarea value={entry.exclude || ''} onChange={e => ubah('exclude', e.target.value)} rows={3} className={`${inp} text-xs`} placeholder={'Mis.\nTips guide\nPengeluaran pribadi'} />
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={onSimpan} disabled={busy} className="bg-[#C9952A] hover:bg-[#a97d20] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">{busy ? 'Menyimpan...' : '💾 Simpan'}</button>
          </div>
        </div>
    </div>
  );
}

// Form tambah/edit Jenis Program (Umroh Regular/Plus/Haji/Wisata dkk) — dulu
// daftar hardcode developer, sekarang admin yang kelola sendiri. `value`
// (slug) diturunkan OTOMATIS dari label pas dibuat, gak bisa diubah lagi
// setelahnya (dipakai sebagai identifier stabil di banyak tabel lain).
function FormJenisProgram({ value, onChange, onSimpan, onBatal, busy }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border-2 border-[#1A4FA0]/30">
      <div>
        <label className={lbl}>Nama Kategori *</label>
        <input value={value.label} onChange={e => onChange({ ...value, label: e.target.value })} placeholder="Mis. Umroh VIP" className={inp} />
        {value.value && <div className="text-[10px] text-gray-400 mt-1">Kode internal: {value.value} (gak bisa diubah setelah dibuat)</div>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.punya_umroh} onChange={e => onChange({ ...value, punya_umroh: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Ada leg Mekkah/Madinah (Umroh)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.boleh_modul_negara} onChange={e => onChange({ ...value, boleh_modul_negara: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Boleh tambah Negara (Turkey/Dubai/dll)
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Tipe Program (buat kategori Program nanti)</label>
          <select value={value.tipe_program} onChange={e => onChange({ ...value, tipe_program: e.target.value })} className={inp}>
            {TIPE_PROGRAM_LIST.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Urutan Tampil</label>
          <input type="number" value={value.urutan} onChange={e => onChange({ ...value, urutan: e.target.value })} className={inp} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">{busy ? 'Menyimpan...' : '💾 Simpan'}</button>
        <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>
    </div>
  );
}

// Pusat data master JM Travel (2026-08-16) — Modul Negara (Dubai/Turkey dkk,
// dulu nempel di /admin/program-costing) + Master Harga Hotel & Tiket
// Pesawat (per periode, dipakai "Isi dari Master" di KalkulatorTerpadu.jsx)
// digabung jadi 1 "cluster" biar admin cuma perlu 1 tempat buat ganti data
// master apapun. Beda level dari data master ini: Modul Negara punya bracket
// tier per-jumlah-jamaah (bisa langsung dipakai program), Hotel/Tiket cuma
// flat rate per periode (dipakai buat "bantu isi form" doang, snapshot).
export default function MasterDataPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Memuat...</div>}>
      <MasterDataInner />
    </Suspense>
  );
}

function MasterDataInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  const [tab, setTab] = useState(searchParams.get('tab') || 'modul'); // 'modul' | 'hotel' | 'tiket' | 'master-item' | 'kurs' | 'jenis-program' — hotel/tiket/master-item/kurs = sub-tab grup "Master" (MASTER_SUBTABS)

  // ===== Modul Negara =====
  const [modulList, setModulList] = useState([]);
  const [formModul, setFormModul] = useState(null);
  const [busyModul, setBusyModul] = useState(false);
  const [busyDuplikat, setBusyDuplikat] = useState(false);

  // ===== Jenis Program (dulu hardcode JENIS_PROGRAM_LIST, sekarang master data) =====
  const [jenisProgramList, setJenisProgramList] = useState([]);
  const [formJenisProgram, setFormJenisProgram] = useState(null);
  const [busyJenisProgram, setBusyJenisProgram] = useState(false);

  // ===== Master Item (daftar harga acuan buat Costing Program) =====
  const [masterList, setMasterList] = useState([]);
  const [formMaster, setFormMaster] = useState(null);

  // ===== Master Harga Hotel (kota+bintang+nama, banyak periode per hotel) =====
  const [hotelList, setHotelList] = useState([]);
  const [hotelFormTerbuka, setHotelFormTerbuka] = useState(false);
  const [editHotelId, setEditHotelId] = useState(null);
  const [formHotel, setFormHotel] = useState(kosongHotel());
  // Periode-periode yang diisi LANGSUNG di form "Tambah Hotel" (sebelum
  // hotelnya kesimpen sama sekali) — admin bisa "+ Tambah Periode Lagi"
  // berkali-kali di sini, semuanya baru beneran di-POST bareng pas Simpan
  // hotel ditekan (dikonfirmasi user 2026-08-18: gak mau nunggu save dulu
  // baru bisa isi periode lain).
  const [formPeriodeBaru, setFormPeriodeBaru] = useState([kosongPeriode()]);
  const [busyHotel, setBusyHotel] = useState(false);
  const [periodeFormUntuk, setPeriodeFormUntuk] = useState(null); // id master_hotel yang lagi dibuka form periode-nya
  const [editPeriodeId, setEditPeriodeId] = useState(null);
  const [formPeriode, setFormPeriode] = useState(kosongPeriode());
  const [busyPeriode, setBusyPeriode] = useState(false);

  // ===== Master Harga Tiket Pesawat =====
  const [tiketList, setTiketList] = useState([]);
  const [editorTerbuka, setEditorTerbuka] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formTiket, setFormTiket] = useState(kosongTiket());
  const [busy, setBusy] = useState(false);

  // ===== Kurs (Master Kurs SAR/USD -> IDR, dipakai Kalkulator Estimasi
  // Publik — lihat KalkulatorTerpadu.jsx#masterKurs) =====
  const [formKurs, setFormKurs] = useState({ kurs_sar_idr: '', kurs_usd_idr: '' });
  const [busyKurs, setBusyKurs] = useState(false);
  const [savedKurs, setSavedKurs] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') router.replace('/admin?tab=dashboard');
  }, [user, router]);

  function muat() {
    Promise.all([
      fetch('/api/admin/modul-negara?semua=1&full=1').then(r => r.json()),
      fetch('/api/admin/master-hotel').then(r => r.json()),
      fetch('/api/admin/master-tiket-rate').then(r => r.json()),
      fetch('/api/admin/biaya-master-item?semua=1').then(r => r.json()),
      fetch('/api/admin/jenis-program?semua=1').then(r => r.json()),
      fetch('/api/admin/pengaturan').then(r => r.json()),
    ]).then(([mn, h, t, m, jp, p]) => {
      setModulList(mn.modul || []);
      setHotelList(h.hotel || []);
      setTiketList(t.rate || []);
      setMasterList(m.item || []);
      setJenisProgramList(jp.jenis_program || []);
      setFormKurs({ kurs_sar_idr: p.pengaturan?.kurs_sar_idr ?? '', kurs_usd_idr: p.pengaturan?.kurs_usd_idr ?? '' });
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  async function simpanKurs() {
    setBusyKurs(true);
    setSavedKurs(false);
    try {
      const res = await fetch('/api/admin/pengaturan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formKurs),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan kurs'); setBusyKurs(false); return; }
      setSavedKurs(true);
    } catch { alert('Terjadi kesalahan'); }
    setBusyKurs(false);
  }
  useEffect(() => { muat(); }, []);

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  // ---- Modul Negara handlers ----
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
      nama: `${m.nama} (Copy)`, mata_uang: m.mata_uang,
      pakai_periode: m.pakai_periode, pakai_hotel_star: m.pakai_hotel_star, info_hotel: m.info_hotel || '', pakai_city_tour_opsi: m.pakai_city_tour_opsi,
      urutan: m.urutan, itinerary_per_hari: m.itinerary_per_hari || {}, include_exclude: m.include_exclude || {}, tl_gratis_min_pax: m.tl_gratis_min_pax ?? '',
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

  // ---- Jenis Program handlers ----
  async function simpanJenisProgram() {
    if (!formJenisProgram.label.trim()) { alert('Nama kategori wajib diisi'); return; }
    setBusyJenisProgram(true);
    const res = await fetch('/api/admin/jenis-program', {
      method: formJenisProgram.value ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formJenisProgram),
    });
    const d = await res.json();
    setBusyJenisProgram(false);
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
    setFormJenisProgram(null);
    muat();
  }
  async function toggleAktifJenisProgram(j) {
    await fetch('/api/admin/jenis-program', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...j, aktif: !j.aktif }),
    });
    muat();
  }
  async function hapusJenisProgram(j) {
    if (!confirm(`Hapus kategori "${j.label}"? Gak bisa dihapus kalau masih dipakai template/program/modul negara manapun.`)) return;
    const res = await fetch(`/api/admin/jenis-program?value=${j.value}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    if (formJenisProgram?.value === j.value) setFormJenisProgram(null);
    muat();
  }

  // ---- Master Item handlers ----
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

  const kelompokMaster = urutkanKelompok([...new Set(masterList.map(m => m.kelompok))]);

  // ---- Master Hotel handlers (kota+bintang+nama, entitas induk) ----
  function mulaiBaruHotel() {
    setEditHotelId(null);
    setFormHotel(kosongHotel());
    setFormPeriodeBaru([kosongPeriode()]);
    setHotelFormTerbuka(true);
  }
  function bukaEditHotel(h) {
    setEditHotelId(h.id);
    setFormHotel({ kota: h.kota, bintang: h.bintang, nama_hotel: h.nama_hotel });
    setHotelFormTerbuka(true);
  }
  function tambahBarisPeriodeBaru() {
    setFormPeriodeBaru([...formPeriodeBaru, kosongPeriode()]);
  }
  function ubahBarisPeriodeBaru(idx, patch) {
    setFormPeriodeBaru(formPeriodeBaru.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }
  function hapusBarisPeriodeBaru(idx) {
    setFormPeriodeBaru(formPeriodeBaru.filter((_, i) => i !== idx));
  }
  async function simpanHotel() {
    setBusyHotel(true);
    try {
      if (!formHotel.nama_hotel.trim()) { alert('Nama hotel wajib diisi'); setBusyHotel(false); return; }
      const res = await fetch('/api/admin/master-hotel', {
        method: editHotelId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editHotelId ? { ...formHotel, id: editHotelId } : formHotel),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyHotel(false); return; }
      // Hotel BARU (bukan edit) — sekalian bikin SEMUA baris periode yang
      // udah diisi admin di form yang sama (bisa lebih dari 1, lihat
      // "+ Tambah Periode Lagi") dalam 1 langkah, biar gak perlu nunggu
      // hotel-nya kesimpen dulu baru bisa isi periode lain (dikonfirmasi
      // user 2026-08-18). Baris kosong (rate semua 0/kosong) di-skip, gak
      // ikut kesimpen jadi periode nyampah. Nambah periode BERIKUTNYA (buat
      // hotel yang udah ada) tetap lewat "+ Tambah Periode" di kartu hotel.
      if (!editHotelId) {
        const periodeDiisi = formPeriodeBaru.filter(p => (Number(p.rate_double) || 0) + (Number(p.rate_triple) || 0) + (Number(p.rate_quad) || 0) > 0);
        const hasilPeriode = await Promise.all(periodeDiisi.map(p => fetch('/api/admin/master-hotel-periode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...p, master_hotel_id: d.id }),
        }).then(r => r.json().then(dp => ({ ok: r.ok, dp })))));
        const gagal = hasilPeriode.find(h => !h.ok);
        if (gagal) alert(gagal.dp.error || 'Hotel tersimpan, tapi ada periode yang gagal kesimpen — buka hotelnya & tambah periode manual.');
      }
      setHotelFormTerbuka(false);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyHotel(false);
  }
  async function toggleAktifHotel(h) {
    await fetch('/api/admin/master-hotel', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: h.id, aktif: !h.aktif }),
    });
    muat();
  }
  async function hapusHotel(h) {
    if (!confirm(`Hapus hotel "${h.nama_hotel}" beserta semua periode harganya?`)) return;
    const res = await fetch(`/api/admin/master-hotel?id=${h.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    muat();
  }

  // ---- Periode-Rate handlers (anak dari Master Hotel) ----
  function mulaiBaruPeriode(hotelId) {
    setEditPeriodeId(null);
    setFormPeriode(kosongPeriode());
    setPeriodeFormUntuk(hotelId);
  }
  function bukaEditPeriode(hotelId, p) {
    setEditPeriodeId(p.id);
    setFormPeriode({
      periode_mulai: p.periode_mulai ? String(p.periode_mulai).slice(0, 10) : '',
      periode_selesai: p.periode_selesai ? String(p.periode_selesai).slice(0, 10) : '',
      berlaku_sampai: p.berlaku_sampai ? String(p.berlaku_sampai).slice(0, 10) : '',
      rate_double: p.rate_double, rate_triple: p.rate_triple, rate_quad: p.rate_quad, mata_uang: p.mata_uang,
    });
    setPeriodeFormUntuk(hotelId);
  }
  async function simpanPeriode(hotelId) {
    setBusyPeriode(true);
    try {
      const payload = { ...formPeriode, master_hotel_id: hotelId };
      const res = await fetch('/api/admin/master-hotel-periode', {
        method: editPeriodeId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPeriodeId ? { ...payload, id: editPeriodeId } : payload),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyPeriode(false); return; }
      setPeriodeFormUntuk(null);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusyPeriode(false);
  }
  async function hapusPeriode(p) {
    if (!confirm('Hapus periode harga ini?')) return;
    const res = await fetch(`/api/admin/master-hotel-periode?id=${p.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    muat();
  }

  // ---- Master Tiket handlers ----
  function mulaiBaruHarga() {
    setEditId(null);
    setFormTiket(kosongTiket());
    setEditorTerbuka(true);
  }
  function bukaTiket(t) {
    setEditId(t.id);
    setFormTiket({
      nama_rute: t.nama_rute, kota_asal: t.kota_asal || '', kota_tujuan: t.kota_tujuan || '',
      rute: t.rute || '', negara_transit_id: t.negara_transit_id || '',
      periode_mulai: t.periode_mulai ? String(t.periode_mulai).slice(0, 10) : '',
      periode_selesai: t.periode_selesai ? String(t.periode_selesai).slice(0, 10) : '',
      berlaku_sampai: t.berlaku_sampai ? String(t.berlaku_sampai).slice(0, 10) : '',
      rate: t.rate, mata_uang: t.mata_uang,
    });
    setEditorTerbuka(true);
  }
  async function simpanHarga() {
    setBusy(true);
    try {
      if (!formTiket.kota_asal.trim() || !formTiket.kota_tujuan.trim()) { alert('Asal dan Tujuan wajib diisi'); setBusy(false); return; }
      // nama_rute (label yang dipakai di mana-mana: list, "Isi dari Master",
      // checklist opsi publik) di-compose otomatis dari Asal + Tujuan — admin
      // gak ngetik langsung lagi, biar strukturnya jelas & konsisten.
      const payload = { ...formTiket, nama_rute: `${formTiket.kota_asal.trim()} - ${formTiket.kota_tujuan.trim()}` };

      const res = await fetch('/api/admin/master-tiket-rate', {
        method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? { ...payload, id: editId } : payload),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
      setEditorTerbuka(false);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }
  async function toggleAktifTiket(item) {
    await fetch('/api/admin/master-tiket-rate', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, aktif: !item.aktif }),
    });
    muat();
  }
  async function hapusTiket(item) {
    if (!confirm(`Hapus "${item.nama_rute}"?`)) return;
    const res = await fetch(`/api/admin/master-tiket-rate?id=${item.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    muat();
  }

  function pindahTab(t) {
    setTab(t);
    setEditorTerbuka(false);
    setHotelFormTerbuka(false);
    setPeriodeFormUntuk(null);
    setFormModul(null);
    setFormMaster(null);
    setFormJenisProgram(null);
  }

  return (
    <Layout title="🗂️ Master Data" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Khusus super admin. Pusat data master JM Travel — Modul Negara (Dubai/Turkey dkk), Master (Hotel/Tiket Pesawat/Item/Kurs), Jenis Program,
        dan Paket Tematik (paket private/custom kayak &quot;Program Umroh Berdua&quot; yang dijual lewat Kalkulator Estimasi Publik),
        semua dipakai bareng oleh <a href="/admin/program-costing" className="text-[#1A4FA0] font-semibold hover:underline">Costing Program</a> —
        1 tempat buat semua data master &amp; paket publik, gak perlu bolak-balik halaman lain (dikonfirmasi user 2026-08-18).
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => pindahTab('modul')} className={`text-sm font-bold px-4 py-2 rounded-xl ${tab === 'modul' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🌍 Modul Negara</button>
        <button onClick={() => pindahTab(MASTER_SUBTABS.includes(tab) ? tab : 'hotel')} className={`text-sm font-bold px-4 py-2 rounded-xl ${MASTER_SUBTABS.includes(tab) ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🗃️ Master</button>
        <button onClick={() => pindahTab('jenis-program')} className={`text-sm font-bold px-4 py-2 rounded-xl ${tab === 'jenis-program' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🗂️ Jenis Program</button>
        <button onClick={() => pindahTab('tematik')} className={`text-sm font-bold px-4 py-2 rounded-xl ${tab === 'tematik' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🎯 Paket Tematik</button>
      </div>

      {MASTER_SUBTABS.includes(tab) && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => pindahTab('hotel')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'hotel' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>🏨 Hotel</button>
          <button onClick={() => pindahTab('tiket')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'tiket' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>✈️ Tiket Pesawat</button>
          <button onClick={() => pindahTab('master-item')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'master-item' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>📋 Master Item</button>
          <button onClick={() => pindahTab('kurs')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'kurs' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>💱 Kurs</button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : tab === 'modul' ? (
        <>
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
                <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 bg-white">
                  <div className="text-sm">
                    <span className="font-semibold text-gray-700">{m.nama}</span>{' '}
                    <span className="text-xs text-gray-400">
                      ({m.mata_uang}, {(m.tiers || []).length} tier)
                    </span>
                    {m.info_hotel && <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🏨 {m.info_hotel}</span>}
                    {!m.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setFormModul({ ...m, tiers: m.tiers || [], addons: m.addons || [], itinerary_per_hari: m.itinerary_per_hari || {}, include_exclude: m.include_exclude || {}, tl_gratis_min_pax: m.tl_gratis_min_pax ?? '' })} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                    <button onClick={() => duplikatModul(m)} disabled={busyDuplikat} className="text-xs font-bold text-emerald-600 hover:underline disabled:opacity-50">{busyDuplikat ? 'Menduplikat...' : 'Duplikat'}</button>
                    <button onClick={() => toggleAktifModul(m)} className="text-xs font-bold text-amber-600 hover:underline">{m.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button onClick={() => hapusModul(m)} className="text-xs font-bold text-red-600 hover:underline">Hapus</button>
                  </div>
                </div>
              )
            ))}
            {modulList.length === 0 && <div className="text-xs text-gray-400">Belum ada modul negara.</div>}
          </div>
        </>
      ) : tab === 'master-item' ? (
        <>
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
                    <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 bg-white">
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
        </>
      ) : tab === 'jenis-program' ? (
        <>
          <div className="text-xs text-gray-400 mb-4">
            Kategori paket (Umroh Regular/Plus/Haji/Wisata dkk) — dipakai di dropdown &quot;Jenis Program&quot; pas bikin Program baru & Template Kalkulator baseline. &quot;Ada leg Mekkah/Madinah&quot; nentuin field-field Umroh (mutawwif, city tour, dst) muncul atau enggak; &quot;Boleh tambah Negara&quot; nentuin bisa nawarin Turkey/Dubai/dll atau enggak.
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#0E2F6E]">Daftar Jenis Program</div>
            {!formJenisProgram && (
              <button onClick={() => setFormJenisProgram(KOSONG_JENIS_PROGRAM)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Jenis Program</button>
            )}
          </div>
          {formJenisProgram && !formJenisProgram.value && (
            <div className="mb-4">
              <FormJenisProgram value={formJenisProgram} onChange={setFormJenisProgram} onSimpan={simpanJenisProgram} onBatal={() => setFormJenisProgram(null)} busy={busyJenisProgram} />
            </div>
          )}
          <div className="space-y-2">
            {jenisProgramList.map(j => (
              formJenisProgram?.value === j.value ? (
                <div key={j.value} className="space-y-3">
                  <FormJenisProgram value={formJenisProgram} onChange={setFormJenisProgram} onSimpan={simpanJenisProgram} onBatal={() => setFormJenisProgram(null)} busy={busyJenisProgram} />
                  <KalkulatorAcuanEditor jenisProgramValue={j.value} jenisProgramLabel={j.label} />
                </div>
              ) : (
                <div key={j.value} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 bg-white">
                  <div className="text-sm">
                    <span className="font-semibold text-gray-700">{j.label}</span>{' '}
                    <span className="text-xs text-gray-400">({j.tipe_program})</span>
                    {!!j.punya_umroh && <span className="ml-2 text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-1.5 py-0.5 rounded">🕌 Umroh</span>}
                    {!!j.boleh_modul_negara && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">🌍 Modul Negara</span>}
                    {!j.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setFormJenisProgram(j)} className="text-xs font-bold text-[#1A4FA0] hover:underline" title={'Edit kategori ini + Kalkulator Acuan (dasar harga jalur "Umroh Private")'}>Edit</button>
                    <button onClick={() => toggleAktifJenisProgram(j)} className="text-xs font-bold text-amber-600 hover:underline">{j.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button onClick={() => hapusJenisProgram(j)} className="text-xs font-bold text-red-600 hover:underline">Hapus</button>
                  </div>
                </div>
              )
            ))}
            {jenisProgramList.length === 0 && <div className="text-xs text-gray-400">Belum ada jenis program.</div>}
          </div>
        </>
      ) : tab === 'kurs' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-md">
          <div className="font-bold text-[#0E2F6E] mb-1">💱 Kurs Kalkulator Publik (Estimasi)</div>
          <div className="text-xs text-gray-400 mb-4">
            Dipakai SEMUA template di Kalkulator Estimasi Publik (Kurasi &amp; Kalkulator Acuan) — ubah di sini otomatis kepakai ke semua, gak perlu edit satu-satu. Kurs di Costing Program internal (per program) TETAP manual &amp; terkunci, gak kepengaruh ini.
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={lbl}>Kurs SAR → IDR</label>
              <input type="number" value={formKurs.kurs_sar_idr} onChange={e => { setFormKurs({ ...formKurs, kurs_sar_idr: e.target.value }); setSavedKurs(false); }} placeholder="5000" className={inp} />
            </div>
            <div>
              <label className={lbl}>Kurs USD → IDR</label>
              <input type="number" value={formKurs.kurs_usd_idr} onChange={e => { setFormKurs({ ...formKurs, kurs_usd_idr: e.target.value }); setSavedKurs(false); }} placeholder="18000" className={inp} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={simpanKurs} disabled={busyKurs} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {busyKurs ? 'Menyimpan...' : '💾 Simpan'}
            </button>
            {savedKurs && <span className="text-sm text-green-600 font-semibold">✅ Tersimpan!</span>}
          </div>
        </div>
      ) : tab === 'hotel' ? (
        <>
          {!hotelFormTerbuka && (
            <button onClick={mulaiBaruHotel} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl mb-6">
              + Tambah Hotel
            </button>
          )}

          {hotelFormTerbuka && (
            <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 mb-6">
              <div className="font-bold text-[#0E2F6E] mb-3">{editHotelId ? 'Edit' : 'Tambah'} Hotel</div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Kota</label>
                  <select value={formHotel.kota} onChange={e => setFormHotel({ ...formHotel, kota: e.target.value })} className={inp}>
                    <option value="mekkah">Mekkah</option>
                    <option value="madinah">Madinah</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Bintang</label>
                  <select value={formHotel.bintang} onChange={e => setFormHotel({ ...formHotel, bintang: Number(e.target.value) })} className={inp}>
                    <option value={3}>Bintang 3</option>
                    <option value={4}>Bintang 4</option>
                    <option value={5}>Bintang 5</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Nama Hotel *</label>
                  <input value={formHotel.nama_hotel} onChange={e => setFormHotel({ ...formHotel, nama_hotel: e.target.value })} placeholder="Mis. Hilton Suites" className={inp} />
                </div>
              </div>

              {!editHotelId && (
                <div className="mt-3 space-y-2">
                  {formPeriodeBaru.map((p, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-gray-500">Harga Periode {idx + 1}</div>
                        {formPeriodeBaru.length > 1 && (
                          <button type="button" onClick={() => hapusBarisPeriodeBaru(idx)} className="text-[10px] font-bold text-red-500 hover:underline">Hapus Baris</button>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
                          <input type="date" value={p.periode_mulai} onChange={e => ubahBarisPeriodeBaru(idx, { periode_mulai: e.target.value })} className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Periode Selesai</label>
                          <input type="date" value={p.periode_selesai} onChange={e => ubahBarisPeriodeBaru(idx, { periode_selesai: e.target.value })} className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
                          <input type="date" value={p.berlaku_sampai} onChange={e => ubahBarisPeriodeBaru(idx, { berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className={lbl}>Rate Double</label>
                          <input type="number" value={p.rate_double} onChange={e => ubahBarisPeriodeBaru(idx, { rate_double: e.target.value })} placeholder="0" className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Rate Triple</label>
                          <input type="number" value={p.rate_triple} onChange={e => ubahBarisPeriodeBaru(idx, { rate_triple: e.target.value })} placeholder="0" className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Rate Quad</label>
                          <input type="number" value={p.rate_quad} onChange={e => ubahBarisPeriodeBaru(idx, { rate_quad: e.target.value })} placeholder="0" className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Mata Uang</label>
                          <select value={p.mata_uang} onChange={e => ubahBarisPeriodeBaru(idx, { mata_uang: e.target.value })} className={inp}>
                            <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={tambahBarisPeriodeBaru} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Periode Lagi</button>
                </div>
              )}
              <div className="text-[10px] text-gray-400 mt-2 mb-3">{editHotelId ? 'Kota/Bintang/Nama Hotel di atas — periode harga dikelola langsung di kartu hotelnya (tutup form ini dulu).' : 'Semua baris periode di atas kesimpen bareng pas Simpan ditekan. Kalau kelewat/mau nambah periode LAGI belakangan (mis. musim baru), tinggal klik "+ Tambah Periode" di kartu hotel — gak perlu bikin ulang hotel baru.'}</div>
              <div className="flex gap-2">
                <button onClick={simpanHotel} disabled={busyHotel} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                  {busyHotel ? 'Menyimpan...' : '💾 Simpan'}
                </button>
                <button onClick={() => setHotelFormTerbuka(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Tutup</button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {hotelList.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">Belum ada hotel tersimpan.</div>}
            {['mekkah', 'madinah'].map(kota => {
              const hotelKota = hotelList.filter(h => h.kota === kota);
              if (hotelKota.length === 0) return null;
              return (
                <div key={kota}>
                  <div className="text-sm font-bold text-[#0E2F6E] mb-2">{KOTA_LABEL[kota]}</div>
                  {[5, 4, 3].map(bintang => {
                    const hotelBintang = hotelKota.filter(h => h.bintang === bintang);
                    if (hotelBintang.length === 0) return null;
                    return (
                      <div key={bintang} className="mb-3">
                        <div className="text-[10px] font-bold text-amber-600 mb-1.5">{'⭐'.repeat(bintang)} Bintang {bintang}</div>
                        <div className="space-y-2">
                          {hotelBintang.map(h => (
                            <div key={h.id} className={`bg-white rounded-xl border border-gray-200 p-3 ${!h.aktif ? 'opacity-50' : ''}`}>
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <button onClick={() => bukaEditHotel(h)} className="font-bold text-[#0E2F6E] hover:underline text-sm text-left">{h.nama_hotel}{!h.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}</button>
                                <div className="flex gap-3 shrink-0">
                                  <button onClick={() => mulaiBaruPeriode(h.id)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Periode</button>
                                  <button onClick={() => toggleAktifHotel(h)} className="text-xs font-bold text-amber-600 hover:underline">{h.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                                  <button onClick={() => hapusHotel(h)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
                                </div>
                              </div>

                              {periodeFormUntuk === h.id && (
                                <div className="bg-gray-50 rounded-lg p-3 mb-2">
                                  <div className="grid sm:grid-cols-3 gap-2 mb-2">
                                    <div>
                                      <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
                                      <input type="date" value={formPeriode.periode_mulai} onChange={e => setFormPeriode({ ...formPeriode, periode_mulai: e.target.value })} className={inp} />
                                    </div>
                                    <div>
                                      <label className={lbl}>Periode Selesai</label>
                                      <input type="date" value={formPeriode.periode_selesai} onChange={e => setFormPeriode({ ...formPeriode, periode_selesai: e.target.value })} className={inp} />
                                    </div>
                                    <div>
                                      <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
                                      <input type="date" value={formPeriode.berlaku_sampai} onChange={e => setFormPeriode({ ...formPeriode, berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                    <div>
                                      <label className={lbl}>Rate Double</label>
                                      <input type="number" value={formPeriode.rate_double} onChange={e => setFormPeriode({ ...formPeriode, rate_double: e.target.value })} placeholder="0" className={inp} />
                                    </div>
                                    <div>
                                      <label className={lbl}>Rate Triple</label>
                                      <input type="number" value={formPeriode.rate_triple} onChange={e => setFormPeriode({ ...formPeriode, rate_triple: e.target.value })} placeholder="0" className={inp} />
                                    </div>
                                    <div>
                                      <label className={lbl}>Rate Quad</label>
                                      <input type="number" value={formPeriode.rate_quad} onChange={e => setFormPeriode({ ...formPeriode, rate_quad: e.target.value })} placeholder="0" className={inp} />
                                    </div>
                                    <div>
                                      <label className={lbl}>Mata Uang</label>
                                      <select value={formPeriode.mata_uang} onChange={e => setFormPeriode({ ...formPeriode, mata_uang: e.target.value })} className={inp}>
                                        <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => simpanPeriode(h.id)} disabled={busyPeriode} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">
                                      {busyPeriode ? 'Menyimpan...' : '💾 Simpan Periode'}
                                    </button>
                                    <button onClick={() => setPeriodeFormUntuk(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-4 py-2 rounded-lg">Tutup</button>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-1">
                                {(h.periode || []).length === 0 && <div className="text-xs text-gray-400">Belum ada periode harga.</div>}
                                {(h.periode || []).map(p => (
                                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 gap-2">
                                    <button onClick={() => bukaEditPeriode(h.id, p)} className="text-left">
                                      <span className={`text-xs ${sudahKadaluarsa(p.periode_selesai, p.berlaku_sampai) ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{labelPeriode(p.periode_mulai, p.periode_selesai, p.berlaku_sampai)}</span>
                                      <span className="text-xs text-gray-500"> · Double {rp(p.rate_double)} / Triple {rp(p.rate_triple)} / Quad {rp(p.rate_quad)} {p.mata_uang}</span>
                                    </button>
                                    <button onClick={() => hapusPeriode(p)} className="text-[10px] font-bold text-red-500 hover:underline shrink-0">Hapus</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      ) : tab === 'tematik' ? (
        <PaketTematikManager />
      ) : (
        <>
          {!editorTerbuka && (
            <button onClick={mulaiBaruHarga} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl mb-6">
              + Tambah Rate Tiket
            </button>
          )}

          {editorTerbuka && (
            <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 mb-6">
              <div className="font-bold text-[#0E2F6E] mb-3">{editId ? 'Edit' : 'Tambah'} Rate Tiket Pesawat</div>

              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={lbl}>Dari (Asal) *</label>
                    <input value={formTiket.kota_asal} onChange={e => setFormTiket({ ...formTiket, kota_asal: e.target.value })} placeholder="Mis. Jakarta" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Ke (Tujuan) *</label>
                    <input value={formTiket.kota_tujuan} onChange={e => setFormTiket({ ...formTiket, kota_tujuan: e.target.value })} placeholder="Mis. Jeddah" className={inp} />
                  </div>
                </div>
                <div className={formTiket.rute === 'transit' ? 'grid sm:grid-cols-2 gap-3' : ''}>
                  <div>
                    <label className={lbl}>Tipe Rute (opsional)</label>
                    <select value={formTiket.rute} onChange={e => setFormTiket({ ...formTiket, rute: e.target.value, negara_transit_id: e.target.value === 'transit' ? formTiket.negara_transit_id : '' })} className={inp}>
                      <option value="">— Gak dibedain —</option>
                      <option value="direct">Direct</option>
                      <option value="transit">Transit</option>
                    </select>
                  </div>
                  {formTiket.rute === 'transit' && (
                    <div>
                      <label className={lbl}>Negara Transit</label>
                      <select value={formTiket.negara_transit_id} onChange={e => setFormTiket({ ...formTiket, negara_transit_id: e.target.value })} className={inp}>
                        <option value="">— Pilih Negara —</option>
                        {modulList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
                  <input type="date" value={formTiket.periode_mulai} onChange={e => setFormTiket({ ...formTiket, periode_mulai: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Periode Selesai</label>
                  <input type="date" value={formTiket.periode_selesai} onChange={e => setFormTiket({ ...formTiket, periode_selesai: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
                  <input type="date" value={formTiket.berlaku_sampai} onChange={e => setFormTiket({ ...formTiket, berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className={lbl}>Rate</label>
                  <input type="number" value={formTiket.rate} onChange={e => setFormTiket({ ...formTiket, rate: e.target.value })} placeholder="0" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Mata Uang</label>
                  <select value={formTiket.mata_uang} onChange={e => setFormTiket({ ...formTiket, mata_uang: e.target.value })} className={inp}>
                    <option value="IDR">IDR</option><option value="SAR">SAR</option><option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={simpanHarga} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
                  {busy ? 'Menyimpan...' : '💾 Simpan'}
                </button>
                <button onClick={() => setEditorTerbuka(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Tutup</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {tiketList.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">Belum ada rate tiket tersimpan.</div>}
            {tiketList.map(t => (
              <div key={t.id} className={`flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 ${!t.aktif ? 'opacity-50' : ''}`}>
                <button onClick={() => bukaTiket(t)} className="text-left">
                  <div className="font-bold text-[#0E2F6E] hover:underline">
                    {t.nama_rute} {t.rute && <span className="text-xs font-normal text-gray-400">({RUTE_LABEL[t.rute]}{t.rute === 'transit' && t.negara_transit_id ? ` via ${modulList.find(m => m.id === t.negara_transit_id)?.nama || '?'}` : ''})</span>}
                  </div>
                  <div className={`text-xs ${sudahKadaluarsa(t.periode_selesai, t.berlaku_sampai) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{labelPeriode(t.periode_mulai, t.periode_selesai, t.berlaku_sampai)} · {rp(t.rate)} {t.mata_uang}</div>
                </button>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => toggleAktifTiket(t)} className="text-xs font-bold text-amber-600 hover:underline">{t.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button onClick={() => hapusTiket(t)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
