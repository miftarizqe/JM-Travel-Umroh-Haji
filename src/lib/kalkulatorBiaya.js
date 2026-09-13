// Fungsi murni (tanpa hook/DOM) inti kalkulator biaya/budgeting program v2 —
// diekstrak dari src/app/components/KalkulatorBiaya.jsx (yang punya
// 'use client') supaya bisa diimport langsung dari API route (server-side,
// isomorphic). KalkulatorBiaya.jsx re-export semuanya dari sini, jadi import
// existing di KalkulatorTerpadu.jsx & halaman admin lain TIDAK berubah sama
// sekali — murni pindah lokasi, angka hasil hitungan HARUS identik persis
// dengan sebelum ekstraksi ini.
//
// Dipakai server-side pertama kali oleh POST /api/kalkulator-publik/hitung
// (Kalkulator Estimasi Publik) — di situ CUMA hitungHargaJual() (harga final)
// yang boleh dikirim balik ke client, HPP/margin/komisi gak pernah keluar
// dari lapisan API.

export const KAPASITAS_KAMAR = { quad: 4, triple: 3, double: 2 };
// Bulatkan ke atas ke kelipatan `increment` terdekat (mis. 500.000) — dipakai
// buat "Bulatkan Harga Jual" di preview Costing Program, dan juga buat HPP
// yang ditulis ke Program (lihat onUbahKalkulator di admin/programs/page.jsx)
// biar angkanya konsisten rapi, bukan sisa desimal hasil hitungan mentah.
export const bulatkanKeAtas = (n, increment) => increment > 0 ? Math.ceil(n / increment) * increment : Math.round(n);

export const TRIGGER_KUNCI_LIST = [
  { value: '', label: '— Selalu aktif (baseline) —' },
  { value: 'manasik_umroh', label: 'Manasik Umroh' },
  { value: 'perlengkapan_jamaah', label: 'Perlengkapan Jamaah' },
  { value: 'handling_jeddah', label: 'Handling Jeddah (ON)' },
  { value: 'handling_jeddah_off', label: 'Handling Jeddah (OFF)' },
  { value: 'haramain_express', label: 'Haramain Express (One Way)' },
  { value: 'haramain_express_pp', label: 'Haramain Express — Tambahan PP (Pulang-Pergi)' },
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
//
// Daftar jenis_program ITU SENDIRI (dulu di-hardcode JENIS_PROGRAM_LIST di
// sini) sekarang master data admin-managed — tabel `jenis_program_master`,
// lihat /api/admin/jenis-program. Konsumen di client fetch dinamis dari API
// itu; server-side (route.js) query tabelnya langsung. `punya_umroh` (flag)
// gantiin cek string `jenis_program === 'wisata'`, `boleh_modul_negara`
// gantiin cek `jenis_program === 'umroh_regular'`.

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

// Itinerary 1 varian Hari punya 1 modul negara — city tour beda (mis. "Half
// Day" vs "Full Day") BISA punya kegiatan beda walau jumlah Hari-nya sama,
// jadi itinerary_per_hari[hari] BOLEH berupa:
//   - array (format lama, SATU itinerary buat semua city tour — modul yang
//     gak pakai_city_tour_opsi tetap format ini, gak berubah)
//   - object { [nama_city_tour_atau_'']: array } (format baru, per city
//     tour) — key '' = "berlaku semua city tour" (SAMA prinsipnya kayak
//     city_tour_opsi kosong di tier = wildcard, lihat cariTierModulNegara),
//     dipakai kalau city tour yang dipilih gak punya override sendiri.
export function itineraryHariModul(modul, hari, cityTour) {
  const data = modul?.itinerary_per_hari?.[hari];
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return data[cityTour || ''] ?? data[''] ?? [];
  return [];
}

// Include/Exclude 1 modul negara — beda per City Tour (mis. Full Day include
// makan siang, Half Day enggak), TAPI SAMA buat semua Hari (beda dari
// itineraryHariModul di atas — include/exclude gak sedetail itu bedanya per
// hari, dikonfirmasi user). Key '' = berlaku SEMUA city tour, dipakai juga
// buat modul yang gak pakai_city_tour_opsi. Dipakai buat GABUNGIN otomatis
// ke include/exclude Program pas modul ini dipilih (lihat KalkulatorTerpadu.jsx
// & kalkulatorPublik.js#includeExcludeUntukTemplate) — bukan gantiin yang
// diketik manual admin di shared.include_items/exclude_items, cuma nambahin.
export function includeExcludeModul(modul, cityTour) {
  const data = modul?.include_exclude;
  const entry = (data && typeof data === 'object') ? (data[cityTour || ''] || data['']) : null;
  const toList = (text) => String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  return { include: toList(entry?.include), exclude: toList(entry?.exclude) };
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

// Item dgn nama diakhiri "/ Day" atau "/ Hari" (mis. "Mutawwif / Day") itu
// tarif HARIAN — otomatis kekali Total Hari Program, gak perlu toggle
// manual. Konvensi ini emang udah dipakai sendiri di master price list asli
// (satu-satunya item "/Day" di situ ya "Mutawwif / Day", sisanya "/Pax" dst).
export function itemPerHari(nama) {
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
// asli Excel). null/'' = baseline, selalu aktif. Transportasi otomatis
// nentuin sendiri dari jumlah pax (jamaah/publik gak selalu milih manual,
// terutama di kalkulator publik yang pax-nya baru ketauan pas jamaah submit)
// — Bus di atas 10 pax, Hi-Ace 5-10 pax, sisanya (1-4 pax) Mobil. Kalau pax
// belum ketauan sama sekali (0), fallback ke pilihan manual admin
// (dikonfirmasi user 2026-08-18, gantiin aturan lama "pax >= 15 wajib Bus").
export function transportasiOtomatis(paxJamaah) {
  const n = Number(paxJamaah) || 0;
  if (n > 10) return 'bus';
  if (n > 4) return 'hiace';
  if (n > 0) return 'mobil';
  return null;
}
export function itemAktif(triggerKunci, state) {
  if (!triggerKunci) return true;
  if (triggerKunci === 'handling_jeddah_off') return Number(state.handling_jeddah) <= 0;
  if (triggerKunci === 'haramain_express') return Number(state.haramain_express) > 0;
  // Item cost TAMBAHAN yang cuma nyala kalau Haramain Express-nya PP
  // (Pulang-Pergi, value 2) — bukan sekadar One Way (value 1). Ditumpuk di
  // ATAS item 'haramain_express' (One Way) yang tetap aktif juga, biar admin
  // bisa pisahin harga dasar One Way vs biaya tambahan buat upgrade PP.
  if (triggerKunci === 'haramain_express_pp') return Number(state.haramain_express) === 2;
  if (triggerKunci.startsWith('jenis_')) return state.jenis_program === triggerKunci.slice('jenis_'.length);
  if (triggerKunci.startsWith('transport_')) {
    const [, vehicle, variant] = triggerKunci.split('_');
    const transportasiEfektif = transportasiOtomatis(state.pax_jamaah) || state.transportasi_pilihan;
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
  // Item "/Day" yang basis-nya kaitan Mutawwif pakai `state.mutawwif_hari`
  // KALAU eksplisit di-set (bukan null/undefined) — dipakai Kalkulator
  // Estimasi Publik biar hari pakai mutawwif bisa dipilih independen dari
  // lama total program (lihat kalkulatorPublik.js#stateEfektif). Kalkulator
  // internal admin gak pernah nyetel field ini, jadi tetap fallback ke
  // total_hari_program, gak berubah perilakunya sama sekali.
  const pakaiMutawwifHari = (it.basis || '').split('_').includes('mutawwif') && state.mutawwif_hari != null;
  const totalHari = pakaiMutawwifHari ? (Number(state.mutawwif_hari) || 0) : (Number(state.total_hari_program) || 0);
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
//
// Tiap baris opsional punya `rute` ('direct'/'transit'/kosong=semua rute) —
// dipakai Kalkulator Estimasi Publik biar pengunjung bisa pilih direct vs
// transit (beda harga tiket). `state.rute_tiket_dipilih` CUMA di-set dari
// jalur publik (lihat kalkulatorPublik.js#stateEfektif) — kalkulator internal
// admin gak pernah nyetel field ini, jadi tetap jumlahin SEMUA baris kayak
// sebelumnya, gak berubah perilakunya sama sekali.
// `urutan_umroh_tiket_dipilih` ('umroh_dulu'/'negara_dulu', dari kalkulator
// publik — lihat kalkulatorPublik.js#stateEfektif) sama pola persis kayak
// `rute_tiket_dipilih`: baris tiket boleh ditag `urutan_umroh` kalau
// harganya BEDA tergantung Umroh Plus-nya Umroh dulu atau negara tambahan
// dulu (rute penerbangan gabungan beda mahal). Baris tanpa tag = berlaku
// buat urutan manapun (perilaku lama, gak berubah).
// `maskapai_tiket_dipilih` — tag ke-3 (maskapai), pola sama persis, buat
// admin yang harga tiketnya beda per maskapai (Saudia/Garuda/Lion/dll).
export function totalTiketPesawat(state) {
  if (Array.isArray(state.tiket_pesawat_list) && state.tiket_pesawat_list.length > 0) {
    const ruteDipilih = state.rute_tiket_dipilih;
    const urutanDipilih = state.urutan_umroh_tiket_dipilih;
    const maskapaiDipilih = state.maskapai_tiket_dipilih;
    const list = state.tiket_pesawat_list.filter(t =>
      (!ruteDipilih || !t.rute || t.rute === ruteDipilih) &&
      (!urutanDipilih || !t.urutan_umroh || t.urutan_umroh === urutanDipilih) &&
      (!maskapaiDipilih || !t.maskapai || t.maskapai === maskapaiDipilih)
    );
    return list.reduce((s, t) => s + konversi(t.rate, t.mata_uang, state), 0);
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

  // Jumlah kali Umroh (min 1, dari kalkulator publik — lihat stateEfektif) —
  // 2x umroh PERTAMA udah otomatis termasuk baseline (gak kena biaya
  // tambahan sama sekali), umroh EKSTRA (di luar 2x itu, mis. umroh ke-3
  // dst) baru kena biaya tambahan flat per pax yang admin set (mis. transport
  // ulang ke miqat) — dikonfirmasi user 2026-08-18. jumlah_umroh 1 atau 2 =
  // Rp 0, gak ngaruh ke template lama sama sekali.
  const umrohEkstra = Math.max(0, (Number(state.jumlah_umroh) || 1) - 2);
  const biayaUmrohTambahanRp = umrohEkstra * konversi(state.biaya_umroh_tambahan, state.biaya_umroh_tambahan_mata_uang, state);

  // Margin ikut masuk ke HPP (bukan ditambahin belakangan) — sesuai formula
  // asli Excel: "HPP Bintang X" = ...+Margin*X, baru "Harga Jual" = HPP + Komisi.
  const tambahan = (tiketRp + visaRp) * faktorTl
    + konversi(state.biaya_lain_lain, state.biaya_lain_lain_mata_uang, state)
    + biayaUmrohTambahanRp
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

// Rincian LENGKAP pembentuk HPP — item per item (bukan cuma total per
// kelompok kayak subtotalPerKelompok), TERMASUK hotel/tiket/visa/biaya
// lain-lain/umroh tambahan/margin yang sebelumnya cuma nempel diam-diam di
// dalam angka HPP glondongan (lihat "tambahan" di hitungHppKamar). Dipakai
// buat PDF rincian super_admin-only Kalkulator Estimasi Publik (dikonfirmasi
// user 2026-08-18, "bukan cuma angka glondongan perorang tapi juga rincian
// per kategorinya... gada margin?") — bukan buat hitungan (hitungHppKamar
// tetap satu-satunya sumber angka final), murni presentasi ulang komponen
// yang SAMA biar totalnya cross-check pas sama hpp[kamar].
export function rincianHppLengkap(state, katalogModul = null) {
  const kelompokList = [...new Set((state.items || []).map(it => it.kelompok))];
  const tlTiket = tlShareTiket(state);
  const tlVisa = tlShareVisa(state);
  const kelompok = kelompokList.map(k => {
    const items = (state.items || [])
      .filter(it => !it.modul_negara_id)
      .map(it => ({ nama: it.nama || '(tanpa nama)', nilai: nilaiItem(it, state, katalogModul), kelompok: it.kelompok, aktif: itemAktif(it.trigger_kunci, state) }))
      .filter(it => it.kelompok === k && it.aktif && it.nilai !== 0)
      .map(it => ({ nama: it.nama, nilai: it.nilai }));
    if (k === 'Cost Tour Leader') {
      if (tlTiket > 0) items.push({ nama: 'Tiket Flight TL', nilai: tlTiket });
      if (tlVisa > 0) items.push({ nama: 'Visa Umroh TL', nilai: tlVisa });
    }
    return { kelompok: k, items, subtotal: items.reduce((s, it) => s + it.nilai, 0) };
  }).filter(k => k.items.length > 0);
  // Tiket/Visa TL share WAJIB masuk pool (dibagi paxJamaah) biar totalnya
  // cross-check ke hpp[kamar] (lihat faktorTl di hitungHppKamar) — kalau
  // admin gak punya item ber-kelompok "Cost Tour Leader" sama sekali,
  // bucket-nya gak kebentuk dari loop di atas, jadi ditambahin manual di
  // sini biar TETAP kehitung (beda dari subtotalPerKelompok/Costing PDF
  // yang diam-diam ngilangin baris ini kalau kelompoknya gak ada).
  if (!kelompok.some(k => k.kelompok === 'Cost Tour Leader') && (tlTiket > 0 || tlVisa > 0)) {
    const items = [
      tlTiket > 0 ? { nama: 'Tiket Flight TL', nilai: tlTiket } : null,
      tlVisa > 0 ? { nama: 'Visa Umroh TL', nilai: tlVisa } : null,
    ].filter(Boolean);
    kelompok.push({ kelompok: 'Cost Tour Leader', items, subtotal: items.reduce((s, it) => s + it.nilai, 0) });
  }

  const modulTambahan = modulTambahanArray(state);
  const modul = modulTambahan.map(entry => {
    const m = katalogModul?.find(km => String(km.id) === String(entry.modul_negara_id));
    if (!m) return null;
    const tier = cariTierModulNegara(m, entry, Number(state.pax_jamaah) || 0);
    if (!tier) return null;
    const nilaiTarif = nilaiTarifModul(m, state, entry);
    const addon = rincianAddonModul(m, state, entry).filter(r => r.nilai !== 0);
    const items = [
      { nama: `Tarif dasar (${m.mata_uang} ${Number(tier.harga_per_pax).toLocaleString('id-ID')}/pax)`, nilai: nilaiTarif },
      ...addon.map(r => ({ nama: `${r.nama} (${r.mata_uang} ${Number(r.harga_per_unit).toLocaleString('id-ID')} × ${r.qtyLabel}${r.sertakan_tl ? ', termasuk TL' : ', tanpa TL'})`, nilai: r.nilai })),
    ];
    return { nama: `${m.nama} (${entry.hari} Hari)`, items, subtotal: items.reduce((s, it) => s + it.nilai, 0) };
  }).filter(Boolean);

  const tiketRp = totalTiketPesawat(state);
  const visaRp = konversi(state.visa_rate, state.visa_mata_uang, state);
  const biayaLainLainRp = konversi(state.biaya_lain_lain, state.biaya_lain_lain_mata_uang, state);
  const umrohEkstra = Math.max(0, (Number(state.jumlah_umroh) || 1) - 2);
  const biayaUmrohTambahanRp = umrohEkstra * konversi(state.biaya_umroh_tambahan, state.biaya_umroh_tambahan_mata_uang, state);
  const marginRp = Number(state.margin_rate) || 0;
  const paxJamaah = Number(state.pax_jamaah) || 0;

  // kelompok/modul itemnya POOLED (total rombongan, SEBELUM dibagi jamaah —
  // sama konvensi kayak subtotalPerKelompok, biar admin bisa cross-check ke
  // Excel lama), jadi WAJIB dibagi paxJamaah dulu buat dapet porsi per
  // orang — beda dari tiket/visa/biayaLainLain/margin yang emang UDAH per
  // orang dari sononya (gak perlu dibagi lagi). Lihat hitungHppKamar buat
  // formula aslinya (pooledRp/paxJamaah + tambahan), disalin persis di sini
  // biar totalnya cross-check pas ke hpp[kamar].
  const poolTotal = kelompok.reduce((s, k) => s + k.subtotal, 0) + modul.reduce((s, m) => s + m.subtotal, 0);
  const poolPerPax = paxJamaah > 0 ? poolTotal / paxJamaah : 0;
  const biayaTetapPerPax = poolPerPax + tiketRp + visaRp + biayaLainLainRp + biayaUmrohTambahanRp + marginRp;

  const malamMekkah = Number(state.hotel_mekkah_malam) || 0;
  const malamMadinah = Number(state.hotel_madinah_malam) || 0;
  const paxTl = Number(state.pax_tl) || 0;
  const faktorTl = paxJamaah > 0 ? (paxJamaah + paxTl) / paxJamaah : 1;
  const pakaiMix = Array.isArray(state.hotel_list) && state.hotel_list.length > 0;
  const hotel = {};
  for (const [kamar, kapasitas] of Object.entries(KAPASITAS_KAMAR)) {
    if (pakaiMix) {
      hotel[kamar] = state.hotel_list.filter(h => h.nama).map(h => ({
        nama: h.nama, nilai: Math.round((konversi(h[`rate_${kamar}`], h.mata_uang, state) * (Number(h.malam) || 0) / kapasitas) * faktorTl),
      }));
    } else {
      const baris = [];
      if (malamMekkah > 0) baris.push({ nama: `Hotel Mekkah (${malamMekkah} malam)`, nilai: Math.round((konversi(state[`hotel_mekkah_rate_${kamar}`], state.hotel_mekkah_mata_uang, state) * malamMekkah / kapasitas) * faktorTl) });
      if (malamMadinah > 0) baris.push({ nama: `Hotel Madinah (${malamMadinah} malam)`, nilai: Math.round((konversi(state[`hotel_madinah_rate_${kamar}`], state.hotel_madinah_mata_uang, state) * malamMadinah / kapasitas) * faktorTl) });
      hotel[kamar] = baris;
    }
  }

  return {
    kelompok, modul, pool_total: poolTotal, pool_per_pax: poolPerPax, pax_jamaah: paxJamaah,
    tiket: tiketRp, visa: visaRp, biaya_lain_lain: biayaLainLainRp, biaya_umroh_tambahan: biayaUmrohTambahanRp,
    margin: marginRp, biaya_tetap_per_pax: biayaTetapPerPax, hotel,
  };
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

// Harga Jual final per kamar = HPP + Komisi paket, dibulatkan — formula yang
// sama persis dipakai inline di tabel Hasil HPP & PDF KalkulatorTerpadu.jsx
// (`bulatkanKeAtas(hpp[kamar] + komisiPaket, pembulatan)`), diekstrak jadi
// fungsi murni di sini supaya bisa dipanggil server-side (Kalkulator Estimasi
// Publik) TANPA harus reuse komponen React yang selalu render HPP/Ujroh/Jual
// bersamaan.
export function hitungHargaJual(hppKamar, komisiPaket, pembulatan) {
  return bulatkanKeAtas((Number(hppKamar) || 0) + (Number(komisiPaket) || 0), Number(pembulatan) || 0);
}
