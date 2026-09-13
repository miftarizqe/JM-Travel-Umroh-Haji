// Business logic Kalkulator Estimasi Publik — dipisah dari route.js biar
// dipakai bareng GET template (nentuin paket/add-on mana yang relevan
// ditawarkan ke pengunjung) & POST hitung (nentuin state efektif yang
// beneran dihitung). config_json TIDAK PERNAH keluar dari modul ini ke
// caller — cuma hasil turunannya (paket_list, addon_keys, harga_jual).

import { itemPerHari, modulTambahanArray, itineraryHariModul, includeExcludeModul } from '@/lib/kalkulatorBiaya';

export const PAKET_LIST = ['deluxe', 'eksekutif', 'signature'];
export const KAMAR_LIST = ['quad', 'triple', 'double'];

// Vocabulary trigger yang ditawarkan sebagai "add-on" ke pengunjung publik —
// sama persis 6 checkbox TRIGGER_CHECKBOX di KalkulatorTerpadu.jsx, biar
// istilahnya konsisten dengan yang admin pakai pas kurasi template.
export const ADDON_TRIGGER_LIST = [
  { key: 'manasik_umroh', label: 'Manasik Umroh' },
  { key: 'perlengkapan_jamaah', label: 'Perlengkapan Jamaah' },
  { key: 'handling_jeddah', label: 'Handling Jeddah' },
  { key: 'city_tour_mekkah', label: 'City Tour Mekkah' },
  { key: 'city_tour_madinah', label: 'City Tour Madinah' },
  { key: 'city_tour_thaif', label: 'City Tour Thaif' },
  // haramain_express aslinya tri-state ('0'/'1'/'2' = off/one-way/PP di admin,
  // lihat KalkulatorTerpadu.jsx) — di sini dipecah jadi 2 checkbox terpisah:
  // 'haramain_express' (One Way, baseline) + 'haramain_express_pp' (upgrade
  // ke Pulang-Pergi, item cost TAMBAHAN nempel di trigger ini sendiri kalau
  // admin isi — lihat itemAktif di kalkulatorBiaya.js). Centang PP tanpa
  // centang One Way tetap aman, hitungHppKamar() otomatis nganggep PP =
  // Haramain aktif juga (lihat resolveAddonPatch di bawah) — dikonfirmasi
  // user 2026-08-18.
  { key: 'haramain_express', label: 'Haramain Express — One Way (Kereta Cepat Mekkah–Madinah)' },
  { key: 'haramain_express_pp', label: 'Haramain Express — Upgrade PP (Pulang-Pergi)' },
];

function parseConfig(configJson) {
  return typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
}

// Add-on yang BENERAN kepake di template ini — cuma tawarkan toggle yang
// ada item cost-nya nempel ke trigger itu (item.trigger_kunci), biar gak ada
// checkbox yang diklik pengunjung tapi gak ngaruh ke harga sama sekali.
// Trigger yang defaultnya udah "on" di config (admin nyontreng pas kurasi
// template, artinya emang mau selalu termasuk paket ini) DIKECUALIKAN dari
// daftar add-on — biayanya otomatis baked-in ke harga dasar tanpa pengunjung
// perlu centang ulang (lihat stateEfektif di bawah).
export function addonKeysUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  const triggerDipakai = new Set((config?.shared?.items || []).map(it => it.trigger_kunci).filter(Boolean));
  // haramain_express_pp bukan field admin beneran (tri-state-nya nempel di
  // shared.haramain_express, lihat stateEfektif) — kalau admin udah baked-in
  // PP (haramain_express === 2) sebagai default, upgrade-nya udah otomatis
  // termasuk, gak perlu ditawarin lagi sebagai toggle.
  const bakedInPp = Number(shared.haramain_express) === 2;
  return ADDON_TRIGGER_LIST.filter(a => triggerDipakai.has(a.key) && !(Number(shared[a.key]) > 0) && !(a.key === 'haramain_express_pp' && bakedInPp));
}

// Template ini nawarin pilihan Transportasi (Bus/Hi-Ace) ke pengunjung? —
// cuma relevan kalau item-nya beneran ada yang trigger-nya nempel ke
// transport_bus_*/transport_hiace_* (lihat itemAktif di kalkulatorBiaya.js).
// Pilihan pengunjung DIABAIKAN otomatis begitu jumlah pax ketauan — Bus di
// atas 10 pax, Hi-Ace 5-10 pax, Mobil 1-4 pax (lihat transportasiOtomatis
// di kalkulatorBiaya.js) — itu bukan urusan flag ini, itemAktif yang nentuin.
export function transportasiTersediaUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const triggerDipakai = (config?.shared?.items || []).map(it => it.trigger_kunci).filter(Boolean);
  return triggerDipakai.some(t => t.startsWith('transport_bus_') || t.startsWith('transport_hiace_'));
}

// Daftar Maskapai unik dari baris Tiket Pesawat template ini (tag `maskapai`,
// sama pola kayak `rute`/`urutan_umroh` — lihat totalTiketPesawat di
// kalkulatorBiaya.js) — cuma ditawarkan kalau admin BENERAN ngisi beda
// harga per maskapai (>=2 nilai unik). Baris tanpa tag maskapai gak masuk
// daftar (dianggap "semua maskapai", gak perlu dipilih eksplisit).
export function maskapaiListUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const list = config?.shared?.tiket_pesawat_list;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(t => t.maskapai).filter(Boolean))];
}

// Template ini nawarin "Jumlah Umroh" ke pengunjung? Cuma flag boolean —
// nominal biaya_umroh_tambahan TETAP rahasia (HPP), sama prinsipnya kayak
// mutawwifTersediaUntukTemplate di bawah.
export function umrohTambahanTersediaUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  return Number(config?.shared?.biaya_umroh_tambahan) > 0;
}

// Paket (Deluxe/Eksekutif/Signature) yang relevan ditawarkan — Hotel Mix
// (state.shared.hotel_mode === 'mix') artinya ketiga paket identik (1 harga
// custom), gak masuk akal nawarin 3 pilihan kembar, cukup 1. Hotel Fix ikut
// bintang_aktif (centangan admin "bintang mana yang beneran dijual"), sama
// persis logika paketAktif di KalkulatorTerpadu.jsx.
// Paket Deluxe/Eksekutif/Signature udah gak dipakai buat kalkulator publik
// manapun (kurasi ataupun acuan) — hotel dipilih per Bintang independen
// lewat opsi hotel gabungan (lihat hotelOpsiGabunganUntukTemplate), Margin &
// Komisi flat 1 angka (dikonfirmasi user 2026-08-18). Selalu 1 bucket
// 'deluxe' aja, checklist "Bintang Aktif" tabel lama gak relevan lagi.
export function paketListUntukTemplate() {
  return ['deluxe'];
}

// Malam default yang admin set di template — dipakai buat prefill input
// "hari di Mekkah/Madinah" (bebas diedit pengunjung, ini cuma starting
// point), bukan nilai sensitif jadi aman dibuka ke publik.
export function malamDefaultUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  return { mekkah: Number(config?.malam?.mekkah) || 0, madinah: Number(config?.malam?.madinah) || 0 };
}

// Pilihan durasi umroh (mis. 9/12 hari) — admin isi bebas per template
// (bukan konstanta sistem, dikonfirmasi user). Tiap opsi = { hari, malam }:
// `hari` = total hari trip (dipakai basis hitung item "/Day" & estimasi
// tanggal pulang), `malam` (opsional) = total malam nginep Mekkah+Madinah
// GABUNGAN buat durasi itu (mis. 9 hari = 7 malam, 12 hari = 10 malam —
// selisihnya hari keberangkatan+kepulangan yang gak nginep hotel) — dipakai
// buat NGUNCI total pas jamaah bagi sendiri malam Mekkah vs Madinah (lihat
// malamAturanUntukTemplate & auto-split di kalkulator/[template_id]).
// SAMA buat semua paket, gak beda per Deluxe/Eksekutif/Signature (dikonfirmasi
// user). malam kosong/0 = gak dikunci, jamaah tetap bebas isi 2 field
// terpisah (perilaku lama, gak berubah).
//
// Backward-compat: data lama nyimpen array angka polos ([9, 12]) sebelum
// field malam ada — dinormalisasi jadi {hari, malam: null} di sini, gak
// perlu migrasi data.
export function durasiOpsiUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const arr = config?.shared?.durasi_opsi;
  if (!Array.isArray(arr)) return [];
  return arr
    .map(d => (d && typeof d === 'object') ? { hari: Number(d.hari) || 0, malam: Number(d.malam) > 0 ? Number(d.malam) : null } : { hari: Number(d) || 0, malam: null })
    .filter(d => d.hari > 0);
}

// Total hari program (fallback) yang admin set di KalkulatorTerpadu —
// dipakai server-side buat basis hitung item "/Day" & mutawwif fix (lihat
// kalkulatorBiaya.js/mutawwifAturanUntukTemplate), TAPI sebelumnya gak pernah
// ikut dikirim ke kalkulator publik. Akibatnya halaman kalkulator/[template_id]
// gak punya cara baca nilai ini & fallback nebak dari malam+1 — salah kalau
// travel day (berangkat+pulang non-hotel) lebih dari 1 hari (mis. 9 hari
// trip = 7 malam nginep, bukan 8). Dikirim di sini biar tanggal pulang &
// estimasi hari yang ditampilkan ke jamaah sinkron sama yang admin set.
export function totalHariProgramUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  return Number(config?.shared?.total_hari_program) || 0;
}

// Aturan jumlah pax buat template ini — kalkulator publik ini KHUSUS paket
// private/custom (Umroh Berdua, Besties, Bareng Seangkatan/Sekantor, dst,
// lihat flyer promo), tiap tema punya kebutuhan beda: "Berdua" berbasis
// PASANGAN suami-istri, pengunjung isi "berapa pasang" (kelipatan 2, tiap
// pasang otomatis 1 cowok+1 istri & sekamar berdua) — bukan "fix" total
// mentah, krn total mentah gak ngejamin komposisi gendernya seimbang/
// berpasangan. "Fix" tetap ada buat grup komposisi bebas tapi total pasti
// (mis. 6 orang, gak harus berpasangan). "Bareng Sekantor" bebas berapa aja
// (dinamis, opsional ada batas minimal/maksimal). Default 'dinamis' tanpa
// batas kalau admin belum pernah isi (template baru).
export function paxAturanUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  if (shared.pax_mode === 'pasangan') {
    return {
      mode: 'pasangan', fixTotal: null, min: null, max: null,
      pasanganMax: Number(shared.pax_pasangan_max) > 0 ? Number(shared.pax_pasangan_max) : null,
    };
  }
  if (shared.pax_mode === 'fix') {
    return { mode: 'fix', fixTotal: Number(shared.pax_fix_total) || 1, min: null, max: null, pasanganMax: null };
  }
  return {
    mode: 'dinamis',
    fixTotal: null,
    min: Number(shared.pax_min) > 0 ? Number(shared.pax_min) : null,
    max: Number(shared.pax_max) > 0 ? Number(shared.pax_max) : null,
    pasanganMax: null,
  };
}

// Aturan malam Mekkah/Madinah — sebagian template (mis. 5 paket flyer
// "Umroh Berdua/Besties/Bareng Seangkatan/Reunian/Sekantor") itinerary-nya
// UDAH FIX (mis. 5N Mekkah + 3N Madinah), cuma tanggal keberangkatan yang
// beda-beda (harga ikut naik-turun rate musiman hotel/tiket) — pengunjung
// GAK PERLU (dan gak boleh) ubah jumlah malamnya. Template lain (mis. nanti
// "Umroh Private" full-custom) malamnya beneran bebas diisi pengunjung.
// Default 'dinamis' (perilaku sebelum toggle ini ada, gak berubah buat
// template yang belum diisi field ini).
// katalogJenisProgram = baris jenis_program_master {value, punya_umroh, ...}
// yang di-query & dipass dari caller (route.js) — pola sama kayak
// katalogModul. Kalau gak dikirim (undefined) ATAU value-nya gak ketemu di
// katalog, dianggap "punya umroh" (perilaku lama/aman, dulu cuma 'wisata'
// doang yang di-exclude). `punya_umroh` dari MySQL balik sebagai angka 0/1
// (bukan boolean asli) — WAJIB di-coerce eksplisit, `0 !== false` itu TRUE
// di JS (beda tipe, strict comparison), jangan bandingin langsung ke `false`.
function punyaUmrohUntukTemplate(shared, katalogJenisProgram) {
  if (!katalogJenisProgram) return true;
  const row = katalogJenisProgram.find(j => j.value === shared.jenis_program);
  return row ? !!row.punya_umroh : true;
}

// Template ini punya itinerary GABUNGAN (leg Umroh + negara tambahan
// sekaligus, mis. "Umroh Plus" Turkey/Dubai) — entah negaranya admin
// fix-kan sendiri (shared.modul_tambahan) atau jamaah pilih sendiri (mode
// "Pilihan Publik", shared.modul_pilihan_publik)? Kalau iya, urutan mana
// duluan (Umroh vs negara tambahan) jadi pilihan yang RELEVAN ditawarkan ke
// pengunjung — beberapa Umroh Plus emang kebalik urutannya, gak selalu
// Umroh duluan (lihat komentar umrohDulu di itineraryUntukTemplate).
export function bisaPilihUrutanUmrohUntukTemplate(configJson, katalogJenisProgram) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  if (!punyaUmrohUntukTemplate(shared, katalogJenisProgram)) return false; // Wisata murni, gak ada leg Umroh buat dibandingin
  const modulPilihanPublik = Array.isArray(shared.modul_pilihan_publik) ? shared.modul_pilihan_publik : [];
  return modulPilihanPublik.length > 0 || modulTambahanArray(shared).length > 0;
}

// Default urutan yang admin set (checkbox "Umroh dulu" di KalkulatorTerpadu)
// — dipakai buat posisi awal toggle di kalkulator publik, jamaah tetap bebas
// gantiin (lihat umroh_dulu_dipilih di POST /hitung).
export function umrohDuluDefaultUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  return config?.shared?.umroh_dulu !== false;
}

export function malamAturanUntukTemplate(configJson, katalogJenisProgram) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  // Kategori tanpa leg Mekkah/Madinah (punya_umroh=false, mis. Program
  // Wisata) GAK PUNYA leg itu sama sekali — itinerary-nya 100% dari modul
  // negara yang dipilih (lihat itineraryUntukTemplate). "Malam Mekkah/
  // Madinah" gak relevan & gak boleh dipaksa wajib diisi buat template ini.
  const punyaUmroh = punyaUmrohUntukTemplate(shared, katalogJenisProgram);
  if (!punyaUmroh) return { mode: 'tidak_ada' };
  return { mode: shared.malam_mode === 'fix' ? 'fix' : 'dinamis' };
}

// Posisi vertikal crop foto kartu (0=rata atas, 50=tengah/default, 100=rata
// bawah) — foto flyer sering lebih tinggi dari kartu h-40 object-cover di
// landing, admin butuh cara geser bagian mana yang kepotong tanpa harus
// crop ulang filenya sendiri.
export function gambarPosisiYUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  const n = Number(shared.gambar_posisi_y);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 50;
}

// Aturan hari mutawwif — sama semangatnya kayak malam: 'fix' = ikut
// itinerary tetap (default: sepanjang total HARI program — persis basis yang
// dipakai mesin hitung biaya buat item "/Day" berbasis mutawwif, lihat
// kalkulatorBiaya.js `totalHari = ... state.total_hari_program`, BUKAN
// jumlah malam — total hari program biasanya lebih besar dari total malam
// krn ngitung hari keberangkatan/kepulangan juga. Admin bisa override
// spesifik lewat `mutawwif_fix_hari` kalau mutawwif-nya cuma ndampingin
// sebagian hari), 'dinamis' = pengunjung bebas pilih (perilaku default,
// gak berubah buat template lama).
export function mutawwifAturanUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  if (shared.mutawwif_mode === 'fix') {
    const malam = malamDefaultUntukTemplate(configJson);
    const fixHari = Number(shared.mutawwif_fix_hari) > 0
      ? Number(shared.mutawwif_fix_hari)
      : (Number(shared.total_hari_program) || (malam.mekkah + malam.madinah));
    return { mode: 'fix', fixHari };
  }
  return { mode: 'dinamis', fixHari: null };
}

// Rute tiket (direct/transit) yang ditawarkan — cuma relevan kalau
// tiket_pesawat_list beneran punya baris ber-`rute` BEDA-BEDA (>1 rute
// unik). Kalau semua baris kosongin `rute` (atau cuma 1 rute), gak perlu
// ditanya ke pengunjung — otomatis semua baris kepake kayak biasa.
export function ruteListUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const list = config?.shared?.tiket_pesawat_list;
  if (!Array.isArray(list)) return [];
  const ruteSet = new Set(list.map(t => t.rute).filter(Boolean));
  return ruteSet.size > 1 ? [...ruteSet] : [];
}

// Opsi hotel alternatif (nama + rate per tipe kamar) per kota, buat 1 paket
// spesifik — array kosong = template ini belum diisi opsi (pengunjung pakai
// 1 hotel default dari config.hotel[paket], perilaku lama).
export function hotelOpsiUntukTemplate(configJson, paket) {
  const config = parseConfig(configJson);
  const hotel = (config?.hotel || {})[paket] || {};
  return {
    mekkah: Array.isArray(hotel.mekkah_opsi) ? hotel.mekkah_opsi : [],
    madinah: Array.isArray(hotel.madinah_opsi) ? hotel.madinah_opsi : [],
  };
}

// Sama kayak hotelOpsiUntukTemplate, TAPI digabung dari SEMUA baris bintang
// (deluxe/eksekutif/signature) jadi 1 daftar per kota — dipakai KHUSUS
// kombinasi kamar campuran (paxAturan.mode 'dinamis'): jamaah pilih Bintang
// Mekkah & Bintang Madinah SECARA INDEPENDEN, gak lagi kebundling jadi 1
// "Paket" buat 2 kota sekaligus (dikonfirmasi user 2026-08-18) — jadi gak
// relevan lagi opsi hotelnya dicentang admin di baris paket yang mana.
// Dedup by master_id (opsi hasil checklist dari Master Hotel) biar gak
// dobel kalau kebetulan hotel yang sama ke-check di >1 baris paket; opsi
// manual (gak ada master_id) selalu ikut apa adanya.
export function hotelOpsiGabunganUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const hotel = config?.hotel || {};
  function gabung(kota) {
    const seen = new Set();
    const hasil = [];
    for (const paket of ['deluxe', 'eksekutif', 'signature']) {
      const arr = Array.isArray(hotel[paket]?.[`${kota}_opsi`]) ? hotel[paket][`${kota}_opsi`] : [];
      for (const o of arr) {
        if (o.master_id != null) {
          if (seen.has(o.master_id)) continue;
          seen.add(o.master_id);
        }
        hasil.push(o);
      }
    }
    return hasil;
  }
  return { mekkah: gabung('mekkah'), madinah: gabung('madinah') };
}

// Template ini nawarin opsi Mutawwif? (ada item biaya "xxx / Day"/"xxx / Hari"
// berbasis mutawwif) — kalau enggak, jangan tampilin field "hari mutawwif"
// ke pengunjung sama sekali.
export function mutawwifTersediaUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  const items = config?.shared?.items || [];
  return items.some(it => (it.basis || '').split('_').includes('mutawwif') && itemPerHari(it.nama));
}

// Template ini nawarin opsi Mutawwifah? (admin udah isi pax_mutawwifah > 0
// di baseline, artinya template ini MEMANG include mutawwifah — pengunjung
// tinggal pilih pakai atau nggak, bukan nentuin dari nol).
export function mutawwifahTersediaUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  return Number(config?.shared?.pax_mutawwifah) > 0;
}

// State efektif yang dihitung server-side — gabungan config_json (dasar
// biaya kurasi admin, TIDAK diketik ulang di sini) + pilihan pengunjung
// (tanggal berangkat, add-on yang dicentang, paket, dan sekarang rute/hotel/
// malam/mutawwif/mutawwifah). Persis logika yang KalkulatorTerpadu.jsx pakai
// buat hppPerPaket[paket] (lihat komentar di sana), diterapkan di server
// supaya HPP/margin/komisi gak pernah nyampe ke browser pengunjung.
//
// Semua parameter baru (rute, hotelMekkahOpsiIdx, dst) OPSIONAL — kalau gak
// dikirim, fallback ke nilai default template (persis perilaku sebelum
// field-field ini ada).
export function stateEfektif(configJson, {
  paket, tanggalBerangkat, addonKeysDipilih,
  rute, hotelMekkahOpsiIdx, hotelMadinahOpsiIdx,
  malamMekkah, malamMadinah, mutawwifHari, pakaiMutawwifah, paxJamaah, paxTl,
  modulPilihanDipilih, durasiDipilih, jumlahUmroh, umrohDuluDipilih,
  transportasiDipilih, maskapaiDipilih, kursSarIdr, kursUsdIdr,
  // Kombinasi kamar campuran (bintang Mekkah/Madinah independen, lihat
  // hotelOpsiGabunganUntukTemplate) — kirim hotelMekkahRate/hotelMadinahRate
  // LANGSUNG (bukan opsi-idx per paket) + marginFlat, karena paket udah gak
  // relevan buat nentuin hotel/margin di jalur ini sama sekali.
  hotelMekkahRate, hotelMadinahRate, marginFlat,
}) {
  const config = parseConfig(configJson);
  const shared = config.shared || {};
  const hotel = (config.hotel || {})[paket] || {};
  const malam = config.malam || {};
  const margin = config.margin || {};

  const addonValid = new Set(addonKeysUntukTemplate(configJson).map(a => a.key));
  const addonAktif = new Set((addonKeysDipilih || []).filter(k => addonValid.has(k)));
  const addonPatch = {};
  for (const a of ADDON_TRIGGER_LIST) {
    // Baked-in (default admin udah "on" & dikecualikan dari addonKeysUntukTemplate
    // di atas) selalu aktif — gak ditentuin lagi sama toggle pengunjung.
    const bakedIn = Number(shared[a.key]) > 0;
    addonPatch[a.key] = bakedIn ? 1 : (addonAktif.has(a.key) ? 1 : 0);
  }
  // haramain_express (tri-state 0/1/2 di hitungHppKamar/itemAktif) dipecah
  // jadi 2 checkbox terpisah di publik (One Way + upgrade PP) — gabungin
  // balik ke 1 angka di sini: PP dicentang (baik sendiri ATAUPUN baked-in
  // shared.haramain_express === 2) = otomatis anggep One Way ikut aktif
  // juga (PP emang nyakup One Way-nya, jamaah gak perlu centang dua-duanya).
  if (Number(shared.haramain_express) === 2 || addonPatch.haramain_express_pp) {
    addonPatch.haramain_express = 2;
  }

  // modulPilihanDipilih (pilihan PENGUNJUNG sendiri, mode "Pilihan Publik")
  // GANTI shared.modul_tambahan (kombinasi TETAP admin) kalau dikirim —
  // biarpun array kosong, itu tetap "override aktif" (caller di route.js
  // udah validasi minimal 1 negara wajib diisi kalau template nawarin mode
  // ini, jadi array kosong di sini gak akan kejadian buat template yang
  // beneran pakai mode publik).
  const modulSumber = modulPilihanDipilih || (Array.isArray(shared.modul_tambahan) ? shared.modul_tambahan : []);
  const modulTambahan = modulSumber.map(m => ({ ...m, tanggal: tanggalBerangkat || m.tanggal || null }));

  const pakaiHotelMix = shared.hotel_mode === 'mix';

  // Opsi hotel spesifik (kalau pengunjung milih salah satu) nimpa rate
  // default paket ini — hitungHppKamar() TIDAK TAHU & TIDAK PEDULI datanya
  // dari mana, tetap baca hotel_mekkah_rate_* apa adanya kayak biasa.
  const opsiHotel = hotelOpsiUntukTemplate(configJson, paket);
  const mekkahOpsi = hotelMekkahRate || (hotelMekkahOpsiIdx != null ? opsiHotel.mekkah[hotelMekkahOpsiIdx] : null);
  const madinahOpsi = hotelMadinahRate || (hotelMadinahOpsiIdx != null ? opsiHotel.madinah[hotelMadinahOpsiIdx] : null);

  return {
    ...shared,
    ...addonPatch,
    // Kurs kalkulator publik narik dari Master Kurs (tabel `pengaturan`),
    // BUKAN dari kurs yang kesimpen di config_json template — kalkulator ini
    // estimasi & bisa berubah seiring waktu (dikonfirmasi user 2026-08-18).
    // caller (hitung/route.js) yang query live dari DB & kirim ke sini;
    // fallback ke shared.kurs_* (nilai lama tersimpan) kalau somehow gak
    // dikirim, biar gak collapse ke 0.
    kurs_sar_idr: kursSarIdr ?? shared.kurs_sar_idr,
    kurs_usd_idr: kursUsdIdr ?? shared.kurs_usd_idr,
    modul_tambahan: modulTambahan,
    hotel_mekkah_rate_double: mekkahOpsi?.rate_double ?? hotel.mekkah_rate_double,
    hotel_mekkah_rate_triple: mekkahOpsi?.rate_triple ?? hotel.mekkah_rate_triple,
    hotel_mekkah_rate_quad: mekkahOpsi?.rate_quad ?? hotel.mekkah_rate_quad,
    hotel_mekkah_malam: malamMekkah ?? malam.mekkah,
    hotel_mekkah_mata_uang: mekkahOpsi?.mata_uang ?? hotel.mekkah_mata_uang,
    hotel_madinah_rate_double: madinahOpsi?.rate_double ?? hotel.madinah_rate_double,
    hotel_madinah_rate_triple: madinahOpsi?.rate_triple ?? hotel.madinah_rate_triple,
    hotel_madinah_rate_quad: madinahOpsi?.rate_quad ?? hotel.madinah_rate_quad,
    hotel_madinah_malam: malamMadinah ?? malam.madinah,
    hotel_madinah_mata_uang: madinahOpsi?.mata_uang ?? hotel.madinah_mata_uang,
    hotel_list: pakaiHotelMix ? (shared.hotel_list || []) : null,
    margin_rate: marginFlat != null ? (Number(marginFlat) || 0) : (Number(margin[paket]) || 0),
    rute_tiket_dipilih: rute || null,
    // Sama pola kayak rute_tiket_dipilih — resolve pilihan Umroh dulu/negara
    // dulu jamaah (fallback ke default admin, lihat umrohDulu di
    // itineraryUntukTemplate) jadi tag buat filter totalTiketPesawat()
    // kalau admin isi harga tiket beda per urutan.
    urutan_umroh_tiket_dipilih: (umrohDuluDipilih != null ? umrohDuluDipilih !== false : shared.umroh_dulu !== false) ? 'umroh_dulu' : 'negara_dulu',
    // Sama pola lagi — tag maskapai buat filter totalTiketPesawat() kalau
    // admin isi harga tiket beda per maskapai (lihat maskapaiListUntukTemplate).
    maskapai_tiket_dipilih: maskapaiDipilih || null,
    // transportasi_pilihan pengunjung GANTI default admin (shared.transportasi_pilihan,
    // udah ke-spread otomatis dari ...shared di atas) kalau dikirim — dibaca
    // langsung sama itemAktif() buat trigger transport_bus_*/transport_hiace_*,
    // TETAP diabaikan otomatis begitu jumlah pax ketauan (lihat transportasiOtomatis
    // di kalkulatorBiaya.js — Bus >10, Hi-Ace 5-10, Mobil 1-4).
    transportasi_pilihan: transportasiDipilih || shared.transportasi_pilihan,
    mutawwif_hari: mutawwifHari != null ? mutawwifHari : null,
    // Durasi pilihan jamaah (mis. 9/12 Hari, lihat durasiOpsiUntukTemplate)
    // GANTI total_hari_program tunggal template kalau dikirim — dasar hitung
    // item "/Day" (mis. Mutawwif) ikut nyesuain otomatis (lihat
    // kalkulatorBiaya.js#totalHari). Gak dikirim = perilaku lama, tetap 1
    // angka tunggal dari shared.
    total_hari_program: durasiDipilih != null ? Number(durasiDipilih) : shared.total_hari_program,
    // Jumlah kali Umroh (min 1, default 1) — cuma dipakai buat biaya umroh
    // tambahan (lihat hitungHppKamar), gak ngaruh ke item lain sama sekali.
    jumlah_umroh: Number(jumlahUmroh) > 0 ? Number(jumlahUmroh) : 1,
    pax_mutawwifah: pakaiMutawwifah === false ? 0 : shared.pax_mutawwifah,
    // Kalkulator publik ini KHUSUS paket private/custom (lihat migration-
    // kalkulator-publik.sql) — bukan program reguler yang biayanya disebar
    // ke 1 rombongan besar keberangkatan. Jumlah pax yang beneran REQUEST
    // trip inilah yang jadi basis pembagi biaya bersama (transport/handling/
    // dst — lihat hitungHppKamar#perPaxItems), BUKAN asumsi rombongan admin.
    // paxJamaah <=0/gak dikirim → fallback ke baseline template (perilaku
    // lama, dipakai juga sama preview admin kalau nanti butuh).
    pax_jamaah: Number(paxJamaah) > 0 ? Number(paxJamaah) : shared.pax_jamaah,
    // Jumlah TL (Tour Leader) — jamaah yang jawab sendiri "pakai TL atau
    // enggak" (lihat halaman publik), GANTI default statis admin
    // (shared.pax_tl) begitu jamaah eksplisit ngirim (termasuk 0 = gak
    // pakai TL sama sekali). Ngaruh ke free-threshold Modul Negara
    // (paxBerbayarModul) & share tiket/visa/hotel TL (tlShareTiket/
    // tlShareVisa di kalkulatorBiaya.js) — dikonfirmasi user 2026-08-18.
    pax_tl: paxTl != null ? (Number(paxTl) || 0) : shared.pax_tl,
  };
}

// Margin & Komisi FLAT (khusus kombinasi kamar campuran, lihat
// hotelOpsiGabunganUntukTemplate) — bukan per paket/bintang lagi, 1 angka
// rata buat kombinasi manapun yang dipilih jamaah.
export function marginFlatUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  return Number(config?.shared?.margin_flat) || 0;
}
export function komisiFlatUntukTemplate(configJson) {
  const config = parseConfig(configJson);
  return Number(config?.shared?.komisi_flat) || 0;
}

export function pembulatanTemplate(configJson) {
  const config = parseConfig(configJson);
  return Number(config?.shared?.pembulatan) || 0;
}

// Include/exclude — 1 baris = 1 item, aman dikirim apa adanya ke publik
// (cuma daftar fasilitas, bukan angka HPP/margin). DIGABUNG sama include/
// exclude yang nempel di Modul Negara terpilih (lihat includeExcludeModul
// di kalkulatorBiaya.js) — katalogModul/modulPilihanOverride opsional, pola
// sama kayak itineraryUntukTemplate (kosong = perilaku lama, cuma dari
// shared.include_items/exclude_items).
export function includeExcludeUntukTemplate(configJson, katalogModul = [], modulPilihanOverride = null) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  const toList = (text) => String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const modulTerpilih = modulPilihanOverride || modulTambahanArray(shared);
  const includeModul = modulTerpilih.flatMap(entry => includeExcludeModul(katalogModul.find(m => String(m.id) === String(entry.modul_negara_id)), entry.city_tour_opsi).include);
  const excludeModul = modulTerpilih.flatMap(entry => includeExcludeModul(katalogModul.find(m => String(m.id) === String(entry.modul_negara_id)), entry.city_tour_opsi).exclude);
  return { include: [...toList(shared.include_items), ...includeModul], exclude: [...toList(shared.exclude_items), ...excludeModul] };
}

// Itinerary gabungan buat kalkulator publik — REPLIKASI 3-cabang logic yang
// dipakai KalkulatorTerpadu.jsx buat cetak PDF admin (isWisata murni modul /
// gabungan Umroh+Modul Negara mis. "Umroh + Turkey" / manual polos Umroh
// doang), MINUS kolom tanggal (pengunjung publik belum tentu udah pilih
// tanggal berangkat pas baru liat info paket). katalogModul = baris
// modul_negara {id, nama, itinerary_per_hari} yang di-query & dipass dari
// caller (route.js) — modul ini sengaja gak query DB sendiri biar tetap
// murni/gampang ditest. modulPilihanOverride (opsional) = pilihan PENGUNJUNG
// sendiri (mode "Pilihan Publik", lihat modulPilihanUntukTemplate) — dipakai
// GANTI shared.modul_tambahan (kombinasi tetap admin) kalau dikirim. Override
// gak ikutan itinerary_modul (teks hand-edit admin itu nempel ke kombinasi
// TETAP, gak relevan buat kombinasi dinamis pilihan pengunjung).
// katalogJenisProgram (opsional) = pola sama malamAturanUntukTemplate — kalau
// gak dikirim, dianggap "punya umroh" (perilaku lama/aman). opsi.malamMekkah/
// opsi.malamMadinah/opsi.urutanDipilih (semua opsional) = pilihan PENGUNJUNG
// buat label "Mekkah dulu"/"Madinah dulu" — cuma pengaruh ke LABEL hari
// (bukan harga, itu tetap dari hotel_mekkah/madinah_rate terpisah kayak
// biasa). Kosong = perilaku lama (blok Umroh polos tanpa label kota).
export function itineraryUntukTemplate(configJson, katalogModul = [], modulPilihanOverride = null, katalogJenisProgram, opsi = {}) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  const isWisata = !punyaUmrohUntukTemplate(shared, katalogJenisProgram);
  const modulTerpilih = modulPilihanOverride || modulTambahanArray(shared);
  const pakaiOverride = !!modulPilihanOverride;

  const itineraryDariModul = modulTerpilih.flatMap(entry => {
    const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
    const arr = itineraryHariModul(modul, entry.hari, entry.city_tour_opsi);
    if (Array.isArray(arr) && arr.length > 0) return arr;
    return Array.from({ length: Number(entry.hari) || 0 }, () => '');
  });
  const negaraDariModul = modulTerpilih.flatMap(entry => {
    const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
    const arrModul = itineraryHariModul(modul, entry.hari, entry.city_tour_opsi);
    const jumlahHari = arrModul.length > 0 ? arrModul.length : (Number(entry.hari) || 0);
    return Array.from({ length: jumlahHari }, () => modul?.nama || 'Negara Tambahan');
  });
  const teksModulHari = (i, fallback) => {
    if (pakaiOverride) return fallback;
    const override = shared.itinerary_modul;
    return Array.isArray(override) && override[i] !== undefined && override[i] !== null ? override[i] : fallback;
  };

  const totalHariUmroh = Number(shared.total_hari_program) || 0;
  const malamMekkahN = Number(opsi.malamMekkah) || 0, malamMadinahN = Number(opsi.malamMadinah) || 0;
  // umrohDuluDipilih (opsional) = pilihan PENGUNJUNG ("mau Umroh dulu atau ke
  // negara tambahan dulu?") — GANTI shared.umroh_dulu (default admin) kalau
  // dikirim. Beberapa Umroh Plus emang kebalik urutannya (negara dulu baru
  // Umroh), bukan selalu Umroh duluan.
  const umrohDulu = opsi.umrohDuluDipilih != null ? opsi.umrohDuluDipilih !== false : shared.umroh_dulu !== false;
  const pakaiGabungan = !isWisata && modulTerpilih.length > 0;
  // Malam Mekkah/Madinah "Dinamis" (jamaah bebas isi sendiri berapa malam,
  // lihat malamAturanUntukTemplate) — gak mungkin admin nulis itinerary
  // day-by-day yang match SEMUA kombinasi malam yang mungkin dipilih jamaah.
  // Kalau leg Umroh-nya BERDIRI SENDIRI (gak ada negara tambahan), itinerary
  // section-nya SENGAJA gak ditampilin sama sekali — percuma cuma jadi 1
  // baris kosong makna. Kalau DIGABUNG sama modul negara (mis. Umroh Plus),
  // leg Umroh-nya diringkas 1 baris rentang tanggal "Program Umroh — ibadah
  // di Mekkah & Madinah", baru diikuti itinerary Modul Negara hari-demi-hari
  // apa adanya (dikonfirmasi user 2026-08-18). Mode "Fix" (malam udah pasti
  // per itinerary tetap) TETAP day-by-day kayak biasa, gak kena ini sama
  // sekali.
  const malamModeDinamis = (shared.malam_mode || 'dinamis') === 'dinamis';
  const totalHariUmrohLeg = malamMekkahN + malamMadinahN > 0 ? malamMekkahN + malamMadinahN : totalHariUmroh;
  // opsi.tanggalBerangkat (opsional, dari POST /hitung) — kalau ada, rentang
  // tanggal leg Umroh dihitung dari situ + offset (kalau negara dulu baru
  // Umroh, offset-nya sepanjang itinerary modul). Gak ada tanggal (mis.
  // preview GET /template) = teks tanpa tanggal, cuma deskripsi umum.
  let rentangTanggalUmroh = null;
  if (opsi.tanggalBerangkat && totalHariUmrohLeg > 0) {
    const offset = umrohDulu ? 0 : itineraryDariModul.length;
    const mulai = new Date(`${opsi.tanggalBerangkat}T00:00:00`);
    if (!isNaN(mulai)) {
      mulai.setDate(mulai.getDate() + offset);
      const selesai = new Date(mulai);
      selesai.setDate(selesai.getDate() + totalHariUmrohLeg - 1);
      const f = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      rentangTanggalUmroh = `${f(mulai)} – ${f(selesai)}`;
    }
  }
  // Label per-kota cuma dipasang kalau pengunjung beneran kirim jumlah malam
  // Mekkah/Madinah-nya (mis. dari POST /hitung) — teks per-hari TETAP dari
  // shared.itinerary[i] yang sama (admin gak perlu isi ulang per kota).
  const blokUmroh = malamModeDinamis
    ? [{
        label: null,
        teks: `${rentangTanggalUmroh ? `${rentangTanggalUmroh}: ` : ''}Program Umroh — ibadah di Mekkah & Madinah.`,
        hariCount: totalHariUmrohLeg > 0 ? totalHariUmrohLeg : 1,
      }]
    : malamMekkahN + malamMadinahN > 0
      ? (shared.urutan_default === 'madinah' || opsi.urutanDipilih === 'madinah'
          ? [
              ...Array.from({ length: malamMadinahN }, (_, i) => ({ label: 'Madinah', teks: (shared.itinerary && shared.itinerary[i]) || '' })),
              ...Array.from({ length: malamMekkahN }, (_, i) => ({ label: 'Mekkah', teks: (shared.itinerary && shared.itinerary[malamMadinahN + i]) || '' })),
            ]
          : [
              ...Array.from({ length: malamMekkahN }, (_, i) => ({ label: 'Mekkah', teks: (shared.itinerary && shared.itinerary[i]) || '' })),
              ...Array.from({ length: malamMadinahN }, (_, i) => ({ label: 'Madinah', teks: (shared.itinerary && shared.itinerary[malamMekkahN + i]) || '' })),
            ])
      : Array.from({ length: totalHariUmroh }, (_, i) => ({
          label: null, teks: (shared.itinerary && shared.itinerary[i]) || '',
        }));
  const blokModul = itineraryDariModul.map((teksDefault, i) => ({
    label: negaraDariModul[i] || 'Negara Tambahan', teks: teksModulHari(i, teksDefault),
  }));
  const gabunganHari = pakaiGabungan
    ? (umrohDulu ? [...blokUmroh, ...blokModul] : [...blokModul, ...blokUmroh])
    : [];

  const hari = isWisata
    ? itineraryDariModul.map((teksDefault, i) => ({ label: negaraDariModul[i] || null, teks: teksModulHari(i, teksDefault) }))
    : pakaiGabungan
      ? gabunganHari
      : malamModeDinamis
        ? [] // Umroh dinamis berdiri sendiri (gak ada negara tambahan) — gak usah tampilin itinerary sama sekali
        : blokUmroh;

  // hariCount (cuma dipasang di blok Umroh yang diringkas) bikin nomor Hari
  // buat blok SESUDAHNYA (mis. Modul Negara) tetap lanjut dari hari
  // sebenarnya (mis. Hari 8), bukan ngitung blok ringkasan itu cuma 1 hari.
  let hariKe = 0;
  return hari.map((h) => {
    const mulai = hariKe + 1;
    hariKe += h.hariCount || 1;
    return { hari: mulai, label: h.label, teks: h.teks };
  }).filter(h => h.teks);
}

// Daftar negara tambahan yang admin BOLEHKAN dipilih pengunjung sendiri (mode
// "Pilihan Publik") — beda dari modul_tambahan (kombinasi TETAP 1 admin
// tentuin). Cuma id+nama yang dibalikin (aman ke publik), opsi hari/hotel
// star/city tour dihitung terpisah lewat opsiModulNegara() per modul begitu
// pengunjung pilih negaranya.
export function modulPilihanUntukTemplate(configJson, katalogModul = []) {
  const config = parseConfig(configJson);
  const shared = config?.shared || {};
  const idList = Array.isArray(shared.modul_pilihan_publik) ? shared.modul_pilihan_publik : [];
  return idList
    .map(id => katalogModul.find(m => String(m.id) === String(id)))
    .filter(Boolean)
    .map(m => ({ id: m.id, nama: m.nama }));
}

// Opsi dropdown (hari/hotel_star/city_tour_opsi) buat 1 modul negara,
// diturunkan dari tiers-nya — REPLIKASI opsiUnik() yang dipakai
// KalkulatorTerpadu.jsx client-side, dipindah ke sini biar bisa dipanggil
// server-side juga (isi dropdown pengunjung publik). Cuma opsi yang BENERAN
// ada tarifnya yang ditawarkan — gak ada "hari bebas ketik" krn tier dicari
// exact match (lihat cariTierModulNegara di kalkulatorBiaya.js).
export function opsiModulNegara(modul) {
  const tiers = Array.isArray(modul?.tiers) ? modul.tiers : [];
  const uniqSorted = (values) => [...new Set(values.filter(v => v !== null && v !== undefined && v !== ''))].sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
  return {
    hari_opsi: uniqSorted(tiers.map(t => t.hari)).map(Number),
    pakai_hotel_star: !!modul?.pakai_hotel_star,
    hotel_star_opsi: uniqSorted(tiers.map(t => t.hotel_star)),
    pakai_city_tour_opsi: !!modul?.pakai_city_tour_opsi,
    city_tour_opsi_opsi: uniqSorted(tiers.map(t => t.city_tour_opsi)),
  };
}
