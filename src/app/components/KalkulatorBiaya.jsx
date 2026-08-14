'use client';
import { useEffect, useRef, useState } from 'react';

// Kalkulator biaya/budgeting program v2 — selaras ke Master Sheet Costing
// asli (multi-currency + daftar harga acuan yang bisa dipilih ulang, bukan
// diketik manual tiap kali). Dipakai di 3 tempat: simulasi bebas
// (program-kalkulator-biaya/page.jsx tanpa simpan), simpan sebagai template
// (halaman yang sama, tombol "Simpan Template"), dan nempel ke program
// beneran (admin/programs/page.jsx, hasilnya ngisi kolom hpp_{paket}_{kamar}).
//
// Hotel dikutip per KAMAR per malam (bukan per orang) — HPP per orang beda
// tergantung isi kamar. Item biaya lain (Cost Saudi via Mutawwif, Cost
// Jakarta via Management, Transportation, dll) dianggap rata flat per orang,
// dikonversi ke Rupiah dulu pakai kurs sebelum dijumlah — item2 ini BISA
// dalam SAR/USD/Rupiah sesuai cara vendor Saudi ngutip harga.
export const KAPASITAS_KAMAR = { quad: 4, triple: 3, double: 2 };
// Bulatkan ke atas ke kelipatan `increment` terdekat (mis. 500.000) — dipakai
// buat "Bulatkan Harga Jual" di preview Costing Program, dan juga buat HPP
// yang ditulis ke Program (lihat onUbahKalkulator di admin/programs/page.jsx)
// biar angkanya konsisten rapi, bukan sisa desimal hasil hitungan mentah.
export const bulatkanKeAtas = (n, increment) => increment > 0 ? Math.ceil(n / increment) * increment : Math.round(n);
const MATA_UANG_LIST = ['IDR', 'SAR', 'USD'];

// Kelompok yang SELALU ada di susunan item tiap kalkulator baru — auto-narik
// semua item aktif dari Master begitu kalkulator dibuat (lihat useEffect
// auto-seed di bawah), gak perlu admin klik "+ Tambah dari Master" manual.
// Program Wisata (non-umroh, murni cost per-negara) cuma butuh Cost Jakarta
// — Cost Saudi/Transportation/Handling Alfiyah semuanya komponen Umroh yang
// gak relevan buat trip tanpa Mekkah/Madinah.
export const KELOMPOK_BASELINE = ['Cost Saudi (Via Mutawwif)', 'Cost Jakarta (Via Management)', 'Cost Transportation', 'Handling Alfiyah', 'Cost Tour Leader'];
const KELOMPOK_BASELINE_WISATA = ['Cost Jakarta (Via Management)'];
// Item Cost Jakarta yang murni Umroh (manasik, akses Haramain, perlengkapan
// jamaah) — di-exclude dari auto-seed Program Wisata (dikonfirmasi user
// 2026-07-27: cuma "Keberangkatan Jakarta - Manasik (Breakfast/Lunch)",
// "Kedatangan Jakarta - Nasi Box + Mineral", "Handling Jakarta", "Asuransi",
// & opsional "Fee Tour Leader" yang kepake). Cuma ngatur auto-seed, bukan
// ngubah trigger_kunci item aslinya — admin tetap bisa tambah/hapus manual.
const ITEM_JAKARTA_KHUSUS_UMROH = ['Fee Ustad Manasik Umroh', 'Akses Mekkah - Madinnah - Haramain Express', 'Perlengkapan Jamaah'];
function kelompokBaselineUntuk(jenisProgram) {
  return jenisProgram === 'wisata' ? KELOMPOK_BASELINE_WISATA : KELOMPOK_BASELINE;
}

export const TRIGGER_KUNCI_LIST = [
  { value: '', label: '— Selalu aktif (baseline) —' },
  { value: 'manasik_umroh', label: 'Manasik Umroh' },
  { value: 'perlengkapan_jamaah', label: 'Perlengkapan Jamaah' },
  { value: 'handling_jeddah', label: 'Handling Jeddah (ON)' },
  { value: 'handling_jeddah_off', label: 'Handling Jeddah (OFF)' },
  { value: 'haramain_express', label: 'Haramain Express' },
  { value: 'city_tour_mekkah', label: 'City Tour Mekkah' },
  { value: 'city_tour_madinah', label: 'City Tour Madinah' },
  { value: 'city_tour_thaif', label: 'City Tour Thaif' },
  { value: 'transport_bus_operasional', label: 'Transport: Bus (Operasional Only)' },
  { value: 'transport_bus_citytourthaif', label: 'Transport: Bus (+ City Tour Thaif)' },
  { value: 'transport_bus_haramain', label: 'Transport: Bus (+ Haramain)' },
  { value: 'transport_bus_allin', label: 'Transport: Bus (All In)' },
  { value: 'transport_hiace_operasional', label: 'Transport: Hi-Ace (Operasional Only)' },
  { value: 'transport_hiace_citytourthaif', label: 'Transport: Hi-Ace (+ City Tour Thaif)' },
  { value: 'transport_hiace_haramain', label: 'Transport: Hi-Ace (+ Haramain)' },
  { value: 'transport_hiace_allin', label: 'Transport: Hi-Ace (All In)' },
  { value: 'jenis_umroh_plus', label: 'Khusus Jenis Program: Umroh Plus' },
];

// Jenis program yang dilayani kalkulator ini. "Umroh Plus" itu SATU payung
// buat semua negara/vendor tambahan (Dubai, Turkey, dan negara lain nanti) —
// pembeda negara/vendornya ada di modul_negara (dropdown "Pilih Modul
// Negara"), BUKAN di jenis_program, biar negara baru cukup nambah baris
// modul_negara, gak perlu nambah jenis_program baru tiap kali.
export const JENIS_PROGRAM_LIST = [
  { value: 'umroh_regular', label: 'Umroh Regular' },
  { value: 'umroh_plus', label: 'Umroh Plus' },
  { value: 'haji', label: 'Haji' },
  { value: 'wisata', label: 'Program Wisata' },
];

export const KOSONG_BREAKDOWN = {
  nama: '', paket: '',
  // modul_tambahan = array [{modul_negara_id, hari, tanggal, hotel_star,
  // city_tour_opsi}, ...] — bisa lebih dari 1 negara sekaligus (mis. Umroh/
  // Wisata + Dubai + Turkey). Data lama nyimpen 1 objek tunggal (bukan
  // array) — dinormalisasi ke array lewat modulTambahanArray() di semua
  // tempat yang bacanya, jadi gak perlu migrasi data lama.
  jenis_program: 'umroh_regular', modul_tambahan: [],
  // Include/Exclude (1 baris = 1 item, sama konvensinya kayak programs.include_items/
  // exclude_items) & itinerary (array of string, index 0 = Hari 1 UMROH) —
  // biar paket dari PDF agen lain (harga + rundown) bisa diinput SEKALIAN di
  // sini, gak cuma di form Program terpisah. itinerary_modul = override teks
  // per-hari buat baris yang ditarik dari Modul Negara (Turkey dkk) — dipakai
  // begitu modul-nya diedit dari sini, biar jadi hak dokumen ini sendiri &
  // gak ikut berubah lagi walau modul.itinerary_per_hari diedit belakangan.
  include_items: '', exclude_items: '', itinerary: [], itinerary_modul: [],
  // Urutan gabungan itinerary kalau ada Umroh + Modul Negara sekaligus (mis.
  // Umroh Plus) — true = Umroh duluan baru negara tambahan, false = negara
  // tambahan duluan baru Umroh. Gak relevan buat Program Wisata murni (gak
  // ada leg Umroh) atau kalau gak ada modul yang dipilih sama sekali.
  umroh_dulu: true,
  kurs_usd_idr: '', kurs_sar_idr: '',
  pax_jamaah: '', pax_tl: '', pax_mutawwif: '', pax_mutawwifah: '', pax_driver: '',
  // Daftar tiket pesawat — bisa lebih dari 1 baris (mis. Jakarta-Dubai +
  // Dubai-Turkey beda harga per rute/negara). tiket_pesawat_rate/mata_uang
  // lama tetap disimpan buat data lama yang belum migrasi ke list.
  tiket_pesawat_list: [], tiket_pesawat_rate: '', tiket_pesawat_mata_uang: 'IDR',
  visa_rate: '', visa_mata_uang: 'IDR',
  biaya_lain_lain: '', biaya_lain_lain_mata_uang: 'IDR',
  // "fix" = 2 slot tetap Mekkah+Madinah, beda rate per paket/bintang (default,
  // sesuai data lama). "mix" = 1 daftar hotel bebas jumlah/kombinasi kota-
  // negara-bintang, DIPAKAI BARENG ketiga paket (Deluxe/Eksekutif/Signature
  // cuma beda Margin & Komisi, bukan hotelnya) — gak masuk akal ngulang input
  // hotel yang sama 3x kalau emang udah custom per-baris.
  hotel_mode: 'fix', hotel_list: [],
  hotel_mekkah_nama: '', hotel_mekkah_rate_double: '', hotel_mekkah_rate_triple: '', hotel_mekkah_rate_quad: '', hotel_mekkah_malam: '', hotel_mekkah_mata_uang: 'SAR',
  hotel_madinah_nama: '', hotel_madinah_rate_double: '', hotel_madinah_rate_triple: '', hotel_madinah_rate_quad: '', hotel_madinah_malam: '', hotel_madinah_mata_uang: 'SAR',
  // Bintang mana yang diaktifkan/ditampilkan di tabel Hasil HPP & PDF — CUMA
  // relevan buat Hotel Fix (3 bintang beneran beda hotel/rate). Hotel Mix
  // gak butuh ini karena ketiga paket udah otomatis dianggap 1 harga aja
  // (lihat paketAktif di KalkulatorTerpadu.jsx). Semua true = perilaku lama
  // gak berubah buat template lama yang belum punya field ini.
  bintang_aktif: { deluxe: true, eksekutif: true, signature: true },
  // Pembulatan Harga Jual (0 = gak dibulatkan) — ikut disimpan per template,
  // BUKAN cuma state lokal komponen (dulu di-reset ke 0 tiap buka ulang
  // template, bikin Harga Jual keliatan "balik ke HPP").
  pembulatan: 0,
  items: [],
};

// Normalisasi state.modul_tambahan ke array — data lama nyimpen 1 objek
// tunggal {modul_negara_id, ...} (bukan array), sekarang bisa lebih dari 1
// negara sekaligus. Dipakai di semua tempat yang perlu iterasi modul yang
// lagi dipilih, biar data lama & baru diperlakukan sama.
export function modulTambahanArray(state) {
  const mt = state?.modul_tambahan;
  if (Array.isArray(mt)) return mt;
  if (mt && mt.modul_negara_id) return [mt];
  return [];
}

// Cari entry dims (hari/tanggal/hotel_star/city_tour_opsi) punya 1 modul
// negara spesifik dari daftar modul_tambahan — dipakai buat resolve tier
// item lama yang masih nempel manual ke modul_negara_id (lihat nilaiItem).
export function dimsUntukModul(state, modulId) {
  return modulTambahanArray(state).find(m => String(m.modul_negara_id) === String(modulId)) || null;
}

function konversi(nominal, mataUang, kurs) {
  const n = Number(nominal) || 0;
  if (mataUang === 'SAR') return n * (Number(kurs.kurs_sar_idr) || 0);
  if (mataUang === 'USD') return n * (Number(kurs.kurs_usd_idr) || 0);
  return n;
}

// Qty tiap item ikut kombinasi headcount yang beneran konsumsi biaya itu (lihat
// formula asli Excel) — bukan selalu "per jamaah". Mis. ongkos mutawwif sendiri
// qty-nya jumlah mutawwif, tapi tetap displit ke jamaah pas dibagi di akhir.
//
// `basis` disimpen sebagai string token digabung "_" (mis. "jamaah_tl"), urutan
// token SELALU ikut urutan BASIS_KATEGORI di bawah (lihat toggleBasisToken) —
// atau "flat" (qty selalu 1, headcount diabaikan). Dulu ini dropdown isinya 10
// kombinasi pre-baked yang harus nambah 1 opsi lagi tiap ada headcount baru;
// sekarang tiap kategori independen (dicentang combine bebas, lihat BasisPicker).
export const BASIS_KATEGORI = [
  { token: 'jamaah', key: 'pax_jamaah', label: 'Jamaah' },
  { token: 'tl', key: 'pax_tl', label: 'TL' },
  { token: 'mutawwif', key: 'pax_mutawwif', label: 'Mutawwif' },
  { token: 'mutawwifah', key: 'pax_mutawwifah', label: 'Mutawwifah' },
  { token: 'driver', key: 'pax_driver', label: 'Driver' },
];
function qtyUntukBasis(basis, state) {
  if (basis === 'flat') return 1;
  if (!basis) return Number(state.pax_jamaah) || 0; // basis kosong (data lama) = default Jamaah
  const tokens = basis.split('_');
  return BASIS_KATEGORI.reduce((s, k) => tokens.includes(k.token) ? s + (Number(state[k.key]) || 0) : s, 0);
}

// Toggle 1 kategori di basis string, jaga urutan token tetap konsisten (biar
// gak ada "tl_jamaah" vs "jamaah_tl" yang maknanya sama tapi beda string).
// Klik "Flat" reset ke 'flat' & lepas semua kategori lain (dua-duanya gak
// bisa nyala bareng — Flat artinya headcount-nya diabaikan total).
export function toggleBasisToken(basis, token) {
  if (token === 'flat') return basis === 'flat' ? 'jamaah' : 'flat';
  const tokens = new Set(basis === 'flat' || !basis ? [] : basis.split('_'));
  if (tokens.has(token)) tokens.delete(token); else tokens.add(token);
  const urut = BASIS_KATEGORI.filter(k => tokens.has(k.token)).map(k => k.token);
  return urut.length > 0 ? urut.join('_') : 'jamaah';
}

// Pill toggle compact buat pilih basis — dipakai di baris Item (tight inline
// row) & Form Item Master (form biasa), satu tampilan konsisten di dua tempat.
export function BasisPicker({ value, onChange }) {
  const basis = value || 'jamaah';
  const tokenAktif = basis === 'flat' ? [] : basis.split('_');
  const pill = (aktif) => `text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 whitespace-nowrap transition-colors ${aktif ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`;
  return (
    <div className="flex flex-wrap gap-1 items-center" title="Qty item ini ngikut headcount apa">
      {BASIS_KATEGORI.map(k => (
        <button key={k.token} type="button" onClick={() => onChange(toggleBasisToken(basis, k.token))} className={pill(tokenAktif.includes(k.token))}>
          {k.label}
        </button>
      ))}
      <button type="button" onClick={() => onChange(toggleBasisToken(basis, 'flat'))} className={pill(basis === 'flat')}>
        Flat (1x)
      </button>
    </div>
  );
}

// Item dgn nama diakhiri "/ Day" atau "/ Hari" (mis. "Mutawwif / Day") itu
// tarif HARIAN — otomatis kekali Total Hari Program, gak perlu toggle
// manual. Konvensi ini emang udah dipakai sendiri di master price list asli
// (satu-satunya item "/Day" di situ ya "Mutawwif / Day", sisanya "/Pax" dst).
function itemPerHari(nama) {
  return /\/\s*(day|hari)\s*$/i.test(nama || '');
}

// Item dgn nama diakhiri "/ N Pax" (mis. "Nasi Mandhi Nampan & Mineral Water
// / 4 Pax") itu harga PER PORSI/NAMPAN yang dibagi rame-rame N orang — qty-nya
// jadi headcount/N (PECAHAN, gak dibulatkan — samain ke formula asli Excel
// master sheet, alokasi biaya proporsional bukan hitungan beli nampan
// beneran), BUKAN dikali headcount mentah kayak item "/ Pax" biasa (gak
// match regex ini, N tetap 1).
function porsiPerUnit(nama) {
  const m = /\/\s*(\d+)\s*pax\s*$/i.exec(nama || '');
  return m ? Number(m[1]) : 1;
}

// Trigger => item Master ke-narik/gak otomatis (diverifikasi dari formula
// asli Excel). null/'' = baseline, selalu aktif. Transportasi udah
// termasuk aturan "pax >= 15 wajib Bus" (lihat KalkulatorTerpadu.jsx).
export function itemAktif(triggerKunci, state) {
  if (!triggerKunci) return true;
  if (triggerKunci === 'handling_jeddah_off') return Number(state.handling_jeddah) <= 0;
  if (triggerKunci === 'haramain_express') return Number(state.haramain_express) > 0;
  if (triggerKunci.startsWith('jenis_')) return state.jenis_program === triggerKunci.slice('jenis_'.length);
  if (triggerKunci.startsWith('transport_')) {
    const [, vehicle, variant] = triggerKunci.split('_');
    const transportasiEfektif = (Number(state.pax_jamaah) || 0) >= 15 ? 'bus' : state.transportasi_pilihan;
    if (transportasiEfektif !== vehicle) return false;
    const haramainOn = Number(state.haramain_express) > 0;
    const thaifOn = Number(state.city_tour_thaif) > 0;
    if (variant === 'operasional') return !haramainOn && !thaifOn;
    if (variant === 'haramain') return haramainOn && !thaifOn;
    if (variant === 'citytourthaif') return !haramainOn && thaifOn;
    if (variant === 'allin') return haramainOn && thaifOn;
    return false;
  }
  // Item paket Dubai/Turkey dkk — aktif kalau modul negara yang bersangkutan
  // ADA di daftar modul_tambahan (bisa lebih dari 1 negara sekaligus).
  if (triggerKunci.startsWith('modul_negara_')) {
    const id = triggerKunci.slice('modul_negara_'.length);
    return modulTambahanArray(state).some(m => String(m.modul_negara_id ?? '') === id);
  }
  // manasik_umroh, perlengkapan_jamaah, handling_jeddah, city_tour_mekkah/madinah/thaif
  return Number(state[triggerKunci]) > 0;
}

// "YYYY-MM-DD" dari Date (kalau mysql2 balikin objek Date) atau string apa
// adanya. PAKAI FIELD LOKAL (getFullYear/getMonth/getDate), BUKAN
// toISOString() — toISOString() convert ke UTC dan bisa geser mundur 1 hari
// kalau timezone server bukan UTC (mis. WIB = UTC+7), padahal field lokal
// Date-nya mysql2 emang udah dikonstruksi biar match tanggal DATE aslinya.
function tanggalStr(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

// Cari baris tier yang cocok buat 1 modul negara (Dubai/Turkey/dst) — satu
// fungsi ini yang dipakai BAIK di kalkulasi (nilaiItem) MAUPUN di UI (badge
// preview/warning), biar dua-duanya gak mungkin nunjukkin angka beda.
// `dims` = state.modul_tambahan (tanggal/hotel_star/city_tour_opsi/hari yang
// lagi dipilih admin) — periode sekarang dicocokkan dari TANGGAL keberangkatan
// yang dipilih admin, jatuh di rentang periode_mulai..periode_selesai tier
// mana. Cocokkan berdasar apa yang BENERAN keisi di baris tier itu sendiri
// (bukan flag pakai_* level modul) — soalnya dalam 1 modul yang sama, gak
// semua kombinasi hari ikut pakai semua dimensi (mis. Arrayan hari=4 gak
// punya city_tour_opsi walau modulnya overall pakai_city_tour_opsi=1 buat
// baris hari=3-nya). Flag pakai_* di modul cuma dipakai buat UI (field mana
// yang perlu ditampilkan), bukan buat filter di sini.
export function cariTierModulNegara(modul, dims, paxJamaah) {
  if (!modul || !Array.isArray(modul.tiers)) return null;
  const tanggal = tanggalStr(dims?.tanggal);
  return modul.tiers.find(t => {
    if (t.periode_mulai != null) {
      if (!tanggal) return false;
      const mulai = tanggalStr(t.periode_mulai), selesai = tanggalStr(t.periode_selesai);
      if (tanggal < mulai || tanggal > selesai) return false;
    }
    return (
      (t.hotel_star == null || Number(t.hotel_star) === Number(dims?.hotel_star)) &&
      (t.city_tour_opsi == null || String(t.city_tour_opsi) === String(dims?.city_tour_opsi)) &&
      Number(t.hari) === Number(dims?.hari) &&
      paxJamaah >= Number(t.pax_min) && (t.pax_max == null || paxJamaah <= Number(t.pax_max))
    );
  }) || null;
}

// Qty 1 addon biaya modul negara (Visa/Tips/Porter dkk) sesuai basis-nya —
// beda dari qtyUntukBasis item biasa karena "hari" di sini hari MODUL (mis.
// hari di Dubai/Turkey), bukan total_hari_program-nya Umroh. `sertakanTl`
// per-addon — sebagian addon (mis. Porter Airport/Hotel) beneran ditanggung
// TL juga, sebagian lain (mis. Tips Guide) cuma ditanggung jamaah, gak bisa
// digebyah-uyah semua addon per_pax/per_pax_hari otomatis include TL.
function qtyAddonModul(basis, paxJamaah, paxTl, hariModul, sertakanTl) {
  const pax = sertakanTl ? paxJamaah + paxTl : paxJamaah;
  switch (basis) {
    case 'per_pax_hari': return pax * hariModul;
    case 'per_hari': return hariModul;
    case 'flat': return 1;
    default: return pax; // 'per_pax'
  }
}

// Label komposisi qty addon buat UI — JANGAN cuma tampilin qty yang udah
// dikali jadi 1 angka gelondongan (mis. "× 60"), soalnya nyamarin asalnya
// dari mana (20 pax × 3 hari?) dan bikin susah dicek manual. Basis
// 'per_pax_hari' PERLU dipecah "pax × hari", basis lain qty-nya udah jelas
// tanpa perkalian tersembunyi.
function labelQtyAddonModul(basis, paxJamaah, paxTl, hariModul, sertakanTl) {
  const pax = sertakanTl ? paxJamaah + paxTl : paxJamaah;
  switch (basis) {
    case 'per_pax_hari': return `${pax} pax × ${hariModul} hari`;
    case 'per_hari': return `${hariModul} hari`;
    case 'flat': return '1x (flat)';
    default: return `${pax} pax`; // 'per_pax'
  }
}

// Total semua addon AKTIF 1 modul negara (Visa/Tips/Porter dkk) dalam
// Rupiah — dipakai bareng tarif bracket (nilaiItem) DAN preview di UI, biar
// gak bisa beda hasil. `dims` = entry modul_tambahan modul INI spesifik
// (bukan seluruh state.modul_tambahan — bisa ada beberapa negara sekaligus).
export function totalAddonModul(modul, state, dims) {
  const paxJamaah = Number(state.pax_jamaah) || 0;
  const paxTl = Number(state.pax_tl) || 0;
  const hariModul = Number(dims?.hari) || 0;
  return (modul?.addons || []).filter(a => a.aktif).reduce(
    (s, a) => s + konversi(a.harga_per_unit, a.mata_uang, state) * qtyAddonModul(a.basis, paxJamaah, paxTl, hariModul, a.sertakan_tl !== 0 && a.sertakan_tl !== false),
    0
  );
}

// Rincian tiap baris addon AKTIF 1 modul negara (dipakai UI buat nunjukkin
// breakdown, bukan cuma total gelondongan — biar admin bisa lacak sendiri
// baris mana yang nyumbang berapa kalau ada selisih). Angka `nilai` di sini
// SELALU sama kayak yang dijumlah totalAddonModul, cuma dipecah per-baris.
export function rincianAddonModul(modul, state, dims) {
  const paxJamaah = Number(state.pax_jamaah) || 0;
  const paxTl = Number(state.pax_tl) || 0;
  const hariModul = Number(dims?.hari) || 0;
  return (modul?.addons || []).filter(a => a.aktif).map(a => {
    const sertakanTl = a.sertakan_tl !== 0 && a.sertakan_tl !== false;
    const qty = qtyAddonModul(a.basis, paxJamaah, paxTl, hariModul, sertakanTl);
    const qtyLabel = labelQtyAddonModul(a.basis, paxJamaah, paxTl, hariModul, sertakanTl);
    return {
      nama: a.nama, basis: a.basis, sertakan_tl: sertakanTl, qty, qtyLabel,
      harga_per_unit: a.harga_per_unit, mata_uang: a.mata_uang,
      nilai: konversi(a.harga_per_unit, a.mata_uang, state) * qty,
    };
  });
}

// Jumlah pax yang KENA TARIF PER-PAX modul negara — skema umum vendor tour
// "20 jamaah + 1 TL gratis": TL cuma bebas biaya kalau rombongan udah capai
// jumlah minimal (modul.tl_gratis_min_pax), di bawah itu TL kena tarif penuh
// kayak jamaah. Field itu OPSIONAL — kosong/0 = perilaku lama gak berubah
// (TL selalu gratis, gak pernah masuk hitungan), biar template lama yang
// belum diisi gak tiba-tiba berubah harganya.
export function paxBerbayarModul(modul, paxJamaah, paxTl) {
  const minGratis = Number(modul?.tl_gratis_min_pax) || 0;
  if (minGratis <= 0) return paxJamaah;
  if (paxJamaah >= minGratis) return paxJamaah + Math.max(0, paxTl - 1);
  return paxJamaah + paxTl;
}

// Nilai Rupiah TARIF DASAR (bracket tier) 1 modul negara — TANPA addon, dipakai
// UI buat mecah rincian "Tarif dasar" vs tiap baris addon (lihat rincianAddonModul).
export function nilaiTarifModul(modul, state, dims) {
  const tier = cariTierModulNegara(modul, dims, Number(state.pax_jamaah) || 0);
  if (!tier) return 0;
  const paxBerbayar = paxBerbayarModul(modul, Number(state.pax_jamaah) || 0, Number(state.pax_tl) || 0);
  return konversi(tier.harga_per_pax, modul.mata_uang, state) * paxBerbayar;
}

// Nilai rupiah 1 item biaya — trigger OFF => 0. Kalau item ini terhubung ke
// modul negara (`modul_negara_id`, mis. paket Dubai/Turkey), nominalnya BUKAN
// diketik manual — di-resolve dari tabel tier (harga per-pax lookup, TL ikut
// kena tarif kalau belum capai syarat gratis — lihat paxBerbayarModul)
// DITAMBAH semua addon aktif modul itu (Visa/Tips/Porter dkk). Kalau bukan
// item modul negara, jalur lama: qty basis (headcount), dibagi porsi-per-unit
// kalau nama-nya "/ N Pax" (mis. nampan buat 4 orang), dikali Total Hari
// kalau nama-nya "/ Day"/"/ Hari". Satu fungsi ini dipakai di pool HPP,
// subtotal per kelompok, DAN tampilan per-item di editor — biar 3 tempat itu
// gak bisa saling beda hasil.
export function nilaiItem(it, state, katalogModul = null) {
  if (!itemAktif(it.trigger_kunci, state)) return 0;
  if (it.modul_negara_id) {
    const modul = katalogModul?.find(m => String(m.id) === String(it.modul_negara_id));
    if (!modul) return 0;
    const dims = dimsUntukModul(state, it.modul_negara_id);
    const tier = cariTierModulNegara(modul, dims, Number(state.pax_jamaah) || 0);
    if (!tier) return 0;
    const paxBerbayar = paxBerbayarModul(modul, Number(state.pax_jamaah) || 0, Number(state.pax_tl) || 0);
    const rateRp = konversi(tier.harga_per_pax, modul.mata_uang, state) * paxBerbayar;
    return rateRp + totalAddonModul(modul, state, dims);
  }
  const qtyRaw = qtyUntukBasis(it.basis, state);
  const porsi = porsiPerUnit(it.nama);
  const qty = porsi > 1 ? qtyRaw / porsi : qtyRaw;
  const totalHari = Number(state.total_hari_program) || 0;
  return konversi(it.nominal, it.mata_uang, state) * qty * (itemPerHari(it.nama) ? totalHari : 1);
}

// Total cost SEMUA modul negara yang lagi dipilih (bisa lebih dari 1 negara
// sekaligus, mis. Dubai + Turkey) — LANGSUNG dari tabel tier + addon modul,
// TANPA butuh Item Master perantara yang nempel modul_negara_id (mekanisme
// lama). Dipakai di hitungHppKamar (pool utama) & subtotalPerKelompok
// (badge "Modul Negara Terpilih").
export function totalModulNegaraTerpilih(state, katalogModul = null) {
  const paxJamaah = Number(state.pax_jamaah) || 0;
  const paxTl = Number(state.pax_tl) || 0;
  return modulTambahanArray(state).reduce((sum, dims) => {
    const modul = katalogModul?.find(m => String(m.id) === String(dims.modul_negara_id));
    if (!modul) return sum;
    const tier = cariTierModulNegara(modul, dims, paxJamaah);
    if (!tier) return sum;
    const paxBerbayar = paxBerbayarModul(modul, paxJamaah, paxTl);
    const rateRp = konversi(tier.harga_per_pax, modul.mata_uang, state) * paxBerbayar;
    return sum + rateRp + totalAddonModul(modul, state, dims);
  }, 0);
}

// Total semua baris Tiket Pesawat (Rupiah) — bisa lebih dari 1 baris (mis.
// Jakarta-Dubai + Dubai-Turkey beda harga). Fallback ke field tunggal lama
// (tiket_pesawat_rate) buat data yang disimpan sebelum fitur multi-tiket ada.
export function totalTiketPesawat(state) {
  if (Array.isArray(state.tiket_pesawat_list) && state.tiket_pesawat_list.length > 0) {
    return state.tiket_pesawat_list.reduce((s, t) => s + konversi(t.rate, t.mata_uang, state), 0);
  }
  return konversi(state.tiket_pesawat_rate, state.tiket_pesawat_mata_uang, state);
}

export function hitungHppKamar(state, katalogModul = null) {
  const malamMekkah = Number(state.hotel_mekkah_malam) || 0;
  const malamMadinah = Number(state.hotel_madinah_malam) || 0;

  // Item dgn modul_negara_id (mekanisme lama: Item Master nempel ke modul
  // negara) di-exclude dari sini — cost modul sekarang dihitung LANGSUNG dari
  // modul_tambahan lewat totalModulNegaraTerpilih, biar gak dobel-hitung
  // kalau item lama itu masih nempel di data kalkulator lama.
  const pooledItemsRp = (state.items || []).reduce((s, it) => s + (it.modul_negara_id ? 0 : nilaiItem(it, state, katalogModul)), 0);
  const pooledRp = pooledItemsRp + totalModulNegaraTerpilih(state, katalogModul);
  const paxJamaah = Number(state.pax_jamaah) || 0;
  const paxTl = Number(state.pax_tl) || 0;
  const perPaxItems = paxJamaah > 0 ? pooledRp / paxJamaah : 0;

  // TL numpang tiket, visa, & hotel dgn tarif yg SAMA kayak jamaah (bukan
  // kamar/harga terpisah) — total qty jadi jamaah+TL, tapi tetep disebar ke
  // pax jamaah aja (yg bayar). faktorTl ini yg dipake ke tiket/visa/hotel.
  const faktorTl = paxJamaah > 0 ? (paxJamaah + paxTl) / paxJamaah : 1;
  const tiketRp = totalTiketPesawat(state);
  const visaRp = konversi(state.visa_rate, state.visa_mata_uang, state);

  // Margin ikut masuk ke HPP (bukan ditambahin belakangan) — sesuai formula
  // asli Excel: "HPP Bintang X" = ...+Margin*X, baru "Harga Jual" = HPP + Komisi.
  const tambahan = (tiketRp + visaRp) * faktorTl
    + konversi(state.biaya_lain_lain, state.biaya_lain_lain_mata_uang, state)
    + (Number(state.margin_rate) || 0);

  // Rate hotel dikuotasi TERPISAH per tipe kamar (Double/Triple/Quad, gak
  // selalu kelipatan rapi) — bukan 1 rate yg dibagi kapasitas, lihat
  // migration-biaya-breakdown-hotel-rate-per-kamar.sql. TL gak dapet kamar
  // penuh terpisah — dia numpang share di tarif/kapasitas kamar yg sama kayak
  // jamaah, makanya dikali faktorTl juga (bukan ditambah 1 kamar utuh).
  //
  // Mode "mix" (state.hotel_list terisi) — daftar hotel bebas jumlah &
  // kombinasi kota/negara/bintang (buat Wisata atau Umroh yang hotelnya
  // kebetulan mixed), tiap entry punya rate & malam sendiri. Mode "fix"
  // (default, data lama) — 2 slot tetap Mekkah+Madinah kayak sebelumnya.
  const pakaiMix = Array.isArray(state.hotel_list) && state.hotel_list.length > 0;
  const hasil = {};
  for (const [kamar, kapasitas] of Object.entries(KAPASITAS_KAMAR)) {
    let hotelPerOrang;
    if (pakaiMix) {
      hotelPerOrang = state.hotel_list.reduce((s, h) => {
        const rateRp = konversi(h[`rate_${kamar}`], h.mata_uang, state) * (Number(h.malam) || 0);
        return s + rateRp / kapasitas;
      }, 0);
    } else {
      const hotelMekkahRp = konversi(state[`hotel_mekkah_rate_${kamar}`], state.hotel_mekkah_mata_uang, state) * malamMekkah;
      const hotelMadinahRp = konversi(state[`hotel_madinah_rate_${kamar}`], state.hotel_madinah_mata_uang, state) * malamMadinah;
      hotelPerOrang = (hotelMekkahRp / kapasitas) + (hotelMadinahRp / kapasitas);
    }
    hasil[kamar] = Math.round(hotelPerOrang * faktorTl + perPaxItems + tambahan);
  }
  return hasil;
}

// Share tiket & visa yang ditanggung jamaah demi numpangin TL ikut dengan
// tarif yang sama (lihat komentar faktorTl di hitungHppKamar) — SELAMA INI
// nempel diam-diam di dalam "tambahan" tanpa kelihatan sebagai baris
// tersendiri. Dipisah ke sini biar keliatan eksplisit & TERPISAH (Tiket
// Flight vs Visa Umroh) di rincian "Cost Tour Leader" — item Cost Saudi/
// Jakarta/Transportation/modul negara lain TL-nya udah ke-cover lewat
// mekanisme basis (jamaah_tl dkk) & toggle sertakan_tl, cuma tiket+visa yang
// belum pernah kelihatan eksplisit sebagai biaya TL. BUKAN nominal baru yang
// ditambah — cuma motong porsi yang udah ada di dalam faktorTl biar gak
// dobel-hitung ke hasil akhir hitungHppKamar.
export function tlShareTiket(state) {
  const paxJamaah = Number(state.pax_jamaah) || 0;
  const paxTl = Number(state.pax_tl) || 0;
  if (paxJamaah <= 0 || paxTl <= 0) return 0;
  return totalTiketPesawat(state) * paxTl;
}
export function tlShareVisa(state) {
  const paxJamaah = Number(state.pax_jamaah) || 0;
  const paxTl = Number(state.pax_tl) || 0;
  if (paxJamaah <= 0 || paxTl <= 0) return 0;
  return konversi(state.visa_rate, state.visa_mata_uang, state) * paxTl;
}
export function tlShareTiketVisa(state) {
  return tlShareTiket(state) + tlShareVisa(state);
}

/** Subtotal pool per kelompok (dalam Rupiah, sebelum dibagi jamaah, item trigger-OFF di-skip) — buat cross-check ke total di Excel lama. */
export function subtotalPerKelompok(state, katalogModul = null) {
  const map = new Map();
  for (const it of state.items || []) {
    if (it.modul_negara_id) continue; // dihitung terpisah di baris "Modul Negara Terpilih" — lihat totalModulNegaraTerpilih
    const rp = nilaiItem(it, state, katalogModul);
    if (rp === 0 && !itemAktif(it.trigger_kunci, state)) continue;
    map.set(it.kelompok, (map.get(it.kelompok) || 0) + rp);
  }
  const tlShare = tlShareTiketVisa(state);
  if (tlShare > 0) map.set('Cost Tour Leader', (map.get('Cost Tour Leader') || 0) + tlShare);
  const hasil = [...map.entries()].map(([kelompok, total]) => ({ kelompok, total }));
  const modulRp = totalModulNegaraTerpilih(state, katalogModul);
  if (modulRp > 0) hasil.push({ kelompok: 'Modul Negara Terpilih', total: modulRp });
  return hasil;
}

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const inpSm = "px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

/**
 * @param {object} value - shape KOSONG_BREAKDOWN
 * @param {(v: object) => void} onChange
 * @param {boolean} [showNama] - tampilkan input nama (disembunyikan kalau nama diatur di luar, mis. form program)
 * @param {boolean} [hideHotel] - sembunyikan box Hotel Mekkah/Madinah (dipakai kalau hotel diatur terpisah di luar, mis. tabel 3-tier bintang)
 */
export default function KalkulatorBiaya({ value, onChange, showNama = true, hideHotel = false }) {
  const [masterList, setMasterList] = useState([]);
  const [katalogModul, setKatalogModul] = useState([]); // modul negara (Dubai/Turkey dkk) + tiers-nya, buat resolve item yg modul_negara_id-nya keisi
  const [tambahKelompok, setTambahKelompok] = useState({}); // { [kelompok]: masterItemId terpilih di dropdown }
  // Item auto-seed beda per Jenis Program (Wisata cuma Cost Jakarta, Umroh 4
  // kelompok) — dua ref ini yang bikin auto-seed BISA re-jalan pas admin
  // ganti dropdown Jenis Program, TAPI cuma selama items masih "bersih" (belum
  // diapa-apain manual: belum tambah/hapus/edit item apapun). Begitu admin
  // sentuh item apapun, autoSeedBersih jadi false selamanya buat kalkulator
  // ini — ganti Jenis Program sesudahnya gak lagi nimpa item yang udah
  // dikustomisasi.
  const seededUntuk = useRef(null);
  const autoSeedBersih = useRef(false);

  useEffect(() => {
    fetch('/api/admin/biaya-master-item').then(r => r.json()).then(d => setMasterList(d.item || [])).catch(() => {});
    fetch('/api/admin/modul-negara?full=1').then(r => r.json()).then(d => setKatalogModul(d.modul || [])).catch(() => {});
  }, []);

  // Auto-narik semua item aktif dari kelompok baseline (beda-beda per Jenis
  // Program, lihat kelompokBaselineUntuk) begitu kalkulator BENER2 baru
  // dibuat atau begitu admin ganti Jenis Program SEBELUM item apapun
  // disentuh manual — biar admin gak perlu klik "+ Tambah dari Master"
  // satu-satu buat item2 standar ini.
  useEffect(() => {
    if (masterList.length === 0) return;
    if (value.items.length > 0 && !autoSeedBersih.current) return; // sudah dikustomisasi manual, jangan ditimpa
    if (seededUntuk.current === value.jenis_program) return; // udah pas, gak perlu seed ulang
    seededUntuk.current = value.jenis_program;
    const grup = kelompokBaselineUntuk(value.jenis_program);
    const baseline = masterList.filter(m => grup.includes(m.kelompok) && m.aktif
      && !(value.jenis_program === 'wisata' && ITEM_JAKARTA_KHUSUS_UMROH.includes(m.nama)));
    autoSeedBersih.current = true;
    onChange({
      ...value,
      items: baseline.map(m => ({ master_item_id: m.id, kelompok: m.kelompok, nama: m.nama, nominal: m.harga_default, mata_uang: m.mata_uang, basis: m.basis_default || 'jamaah', trigger_kunci: m.trigger_kunci || null, modul_negara_id: m.modul_negara_id || null })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterList, value.jenis_program]);

  function set(patch) { onChange({ ...value, ...patch }); }
  function ubahItem(idx, patch) {
    autoSeedBersih.current = false;
    onChange({ ...value, items: value.items.map((it, i) => i === idx ? { ...it, ...patch } : it) });
  }
  function hapusItem(idx) {
    autoSeedBersih.current = false;
    onChange({ ...value, items: value.items.filter((_, i) => i !== idx) });
  }

  function tambahDariMaster(kelompok, masterItemId) {
    const m = masterList.find(x => String(x.id) === String(masterItemId));
    if (!m) return;
    autoSeedBersih.current = false;
    onChange({ ...value, items: [...value.items, { master_item_id: m.id, kelompok: m.kelompok, nama: m.nama, nominal: m.harga_default, mata_uang: m.mata_uang, basis: m.basis_default || 'jamaah', trigger_kunci: m.trigger_kunci || null, modul_negara_id: m.modul_negara_id || null }] });
    setTambahKelompok(prev => ({ ...prev, [kelompok]: '' }));
  }

  function tambahCustom(kelompok) {
    autoSeedBersih.current = false;
    onChange({ ...value, items: [...value.items, { master_item_id: null, kelompok, nama: '', nominal: '', mata_uang: 'IDR', basis: 'jamaah', trigger_kunci: null }] });
  }

  const kelompokList = [...new Set([...masterList.map(m => m.kelompok), ...value.items.map(it => it.kelompok)])];
  if (kelompokList.length === 0) kelompokList.push('Lain-lain');

  return (
    <div className="space-y-4">
      {showNama && (
        <div>
          <label className={lbl}>Nama Costing Program/Template</label>
          <input value={value.nama} onChange={e => set({ nama: e.target.value })} placeholder="Mis. Umroh 9 Hari Regular" className={inp} />
        </div>
      )}

      {!hideHotel && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-gray-500">🕋 Hotel Mekkah (per kamar/malam)</div>
          <input value={value.hotel_mekkah_nama} onChange={e => set({ hotel_mekkah_nama: e.target.value })} placeholder="Nama hotel" className={inp} />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={value.hotel_mekkah_rate_double} onChange={e => set({ hotel_mekkah_rate_double: e.target.value })} placeholder="Rate Double" className={inp} />
            <input type="number" value={value.hotel_mekkah_rate_triple} onChange={e => set({ hotel_mekkah_rate_triple: e.target.value })} placeholder="Rate Triple" className={inp} />
            <input type="number" value={value.hotel_mekkah_rate_quad} onChange={e => set({ hotel_mekkah_rate_quad: e.target.value })} placeholder="Rate Quad" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={value.hotel_mekkah_malam} onChange={e => set({ hotel_mekkah_malam: e.target.value })} placeholder="Jml malam" className={inp} />
            <select value={value.hotel_mekkah_mata_uang} onChange={e => set({ hotel_mekkah_mata_uang: e.target.value })} className={inp}>
              {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-gray-500">🕌 Hotel Madinah (per kamar/malam)</div>
          <input value={value.hotel_madinah_nama} onChange={e => set({ hotel_madinah_nama: e.target.value })} placeholder="Nama hotel" className={inp} />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={value.hotel_madinah_rate_double} onChange={e => set({ hotel_madinah_rate_double: e.target.value })} placeholder="Rate Double" className={inp} />
            <input type="number" value={value.hotel_madinah_rate_triple} onChange={e => set({ hotel_madinah_rate_triple: e.target.value })} placeholder="Rate Triple" className={inp} />
            <input type="number" value={value.hotel_madinah_rate_quad} onChange={e => set({ hotel_madinah_rate_quad: e.target.value })} placeholder="Rate Quad" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={value.hotel_madinah_malam} onChange={e => set({ hotel_madinah_malam: e.target.value })} placeholder="Jml malam" className={inp} />
            <select value={value.hotel_madinah_mata_uang} onChange={e => set({ hotel_madinah_mata_uang: e.target.value })} className={inp}>
              {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>}

      {kelompokList.map(kelompok => {
        const itemsKelompok = value.items.map((it, idx) => ({ ...it, idx })).filter(it => it.kelompok === kelompok);
        const pilihanMaster = masterList.filter(m => m.kelompok === kelompok);
        const totalItem = (it) => nilaiItem(it, value, katalogModul);
        const subtotalKelompok = itemsKelompok.reduce((s, it) => s + totalItem(it), 0);
        return (
          <div key={kelompok} className="border border-gray-200 rounded-xl p-3">
            <div className="text-xs font-bold text-[#0E2F6E] mb-2">{kelompok}</div>
            <div className="space-y-2 mb-2">
              {itemsKelompok.map(it => {
                const aktifTrigger = itemAktif(it.trigger_kunci, value);
                const modul = it.modul_negara_id ? katalogModul.find(m => String(m.id) === String(it.modul_negara_id)) : null;
                const tierKetemu = modul ? cariTierModulNegara(modul, dimsUntukModul(value, it.modul_negara_id), Number(value.pax_jamaah) || 0) : null;
                return (
                  <div key={it.idx} className={`flex flex-wrap gap-2 items-center ${!aktifTrigger ? 'opacity-50' : ''}`}>
                    <input value={it.nama} onChange={e => ubahItem(it.idx, { nama: e.target.value })} placeholder="Nama item" className={`${inpSm} flex-1 min-w-[140px]`} />
                    {modul ? (
                      <>
                        <span className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2 py-1.5 rounded-lg shrink-0 whitespace-nowrap" title="Nominal item ini otomatis dari tabel tier modul negara, bukan diketik manual">
                          📦 {modul.nama}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-500 shrink-0 whitespace-nowrap" title="Total dari tabel tier (harga per-pax × pax jamaah)">
                          = Rp {Math.round(totalItem(it)).toLocaleString('id-ID')}
                        </span>
                        {aktifTrigger && !tierKetemu && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-red-100 text-red-700">
                            ⚠ Tidak ada tarif utk kombinasi ini — cek tabel tier
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <input type="number" value={it.nominal} onChange={e => ubahItem(it.idx, { nominal: e.target.value })} placeholder="Nominal" className={`${inpSm} w-24`} />
                        <select value={it.mata_uang} onChange={e => ubahItem(it.idx, { mata_uang: e.target.value })} className={inpSm}>
                          {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <BasisPicker value={it.basis} onChange={v => ubahItem(it.idx, { basis: v })} />
                        <span className="text-[10px] font-semibold text-gray-500 shrink-0 whitespace-nowrap" title="Total gelondongan item ini (nominal × qty)">
                          = Rp {Math.round(totalItem(it)).toLocaleString('id-ID')}
                        </span>
                        <select value={it.trigger_kunci || ''} onChange={e => ubahItem(it.idx, { trigger_kunci: e.target.value || null })} className={inpSm} title="Trigger yang nentuin item ini ke-hitung atau enggak">
                          {TRIGGER_KUNCI_LIST.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {it.trigger_kunci && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${aktifTrigger ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            {aktifTrigger ? 'ON' : 'trigger OFF'}
                          </span>
                        )}
                      </>
                    )}
                    <button type="button" onClick={() => hapusItem(it.idx)} className="text-red-500 text-xs font-bold hover:underline shrink-0">Hapus</button>
                  </div>
                );
              })}
              {itemsKelompok.length === 0 && <div className="text-xs text-gray-400">Belum ada item di kelompok ini.</div>}
            </div>
            {itemsKelompok.length > 0 && (
              <div className="text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] rounded-lg px-2.5 py-1.5 mb-2">
                Subtotal {kelompok}: Rp {Math.round(subtotalKelompok).toLocaleString('id-ID')}
              </div>
            )}
            <div className="flex gap-2 items-center">
              {pilihanMaster.length > 0 && (
                <select value={tambahKelompok[kelompok] || ''} onChange={e => tambahDariMaster(kelompok, e.target.value)} className={`${inpSm} flex-1`}>
                  <option value="">+ Tambah dari Master...</option>
                  {pilihanMaster.map(m => <option key={m.id} value={m.id}>{m.nama} ({m.mata_uang} {Number(m.harga_default).toLocaleString('id-ID')})</option>)}
                </select>
              )}
              <button type="button" onClick={() => tambahCustom(kelompok)} className="text-xs font-bold text-[#1A4FA0] hover:underline shrink-0">+ Custom</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => {
        const nama = prompt('Nama kelompok biaya baru (mis. "Handling Alfiyah"):');
        if (nama?.trim()) tambahCustom(nama.trim());
      }} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Kelompok Biaya Baru</button>
    </div>
  );
}
