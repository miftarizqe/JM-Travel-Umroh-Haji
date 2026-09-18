// Konstanta & transformasi data murni (tanpa fetch, tanpa JSX) buat fitur
// Modul Negara — bagian dari "Model" di luar akses API: bentuk data,
// bukan cara ngambilnya.
export const KOSONG_MODUL = { id: null, nama: '', mata_uang: 'USD', pakai_periode: false, pakai_hotel_star: false, info_hotel: '', pakai_city_tour_opsi: false, urutan: 0, aktif: true, tiers: [], addons: [], itinerary_per_hari: {}, include_exclude: {}, tl_gratis_min_pax: '' };
export const KOSONG_ADDON = { nama: '', mata_uang: 'USD', harga_per_unit: '', basis: 'per_pax', sertakan_tl: true, aktif: true };
export const BASIS_ADDON_LIST = [
  { value: 'per_pax', label: 'Per Pax' },
  { value: 'per_pax_hari', label: 'Per Pax × Hari' },
  { value: 'per_hari', label: 'Per Hari (gak dikali pax)' },
  { value: 'flat', label: 'Flat / Per Kloter' },
];
export const KOSONG_BRACKET = { pax_min: '', pax_max: '', harga_per_pax: '' };
export const KOSONG_CLUSTER = { periode_mulai: '', periode_selesai: '', berlaku_sampai: '', hotel_star: '', city_tour_opsi: '', hari: '', brackets: [{ ...KOSONG_BRACKET }] };

// Varian (Hari, City Tour) unik dari tabel tier — dipakai buat itinerary
// per-varian (lihat itineraryHariModul di kalkulatorBiaya.js). City Tour
// beda (mis. "Half Day" vs "Full Day") BISA punya kegiatan beda walau
// jumlah Hari-nya sama, jadi gak cukup dikelompokkan per Hari doang kayak
// hariUnikTier(). Kalau modul ini gak pakai City Tour, city tour disamain
// '' semua (collapse ke perilaku lama — 1 itinerary per Hari).
export function variantUnikTier(tiers, pakaiCityTour) {
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
export function cityTourUnikTier(tiers, pakaiCityTour) {
  if (!pakaiCityTour) return [''];
  const set = new Set(['']);
  for (const t of tiers || []) { if (t.city_tour_opsi) set.add(t.city_tour_opsi); }
  return [...set];
}

// Baris tier flat (dari/ke DB) <-> "cluster" (1 kombinasi periode/bintang/city
// tour/hari + banyak bracket pax) — biar admin isi dimensi yang sama cuma
// SEKALI per cluster, bukan per baris pax kayak sebelumnya.
export function kelompokkanTier(tiers) {
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
export function ratakanCluster(clusters) {
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
