// Kolom JSON di biaya_breakdown (modul_tambahan/bintang_aktif/
// tiket_pesawat_list/hotel_list/itinerary/itinerary_modul) disimpan sebagai
// LONGTEXT di DB (bukan tipe native JSON) — driver DB SELALU balikin string
// mentah, gak pernah otomatis ke-parse. Pola lama `b.field || fallback`
// nganggep string JSON non-kosong itu truthy & dipakai apa adanya (bukan
// di-parse), bikin downstream (mis. `.map()` di tiket_pesawat_list) meledak
// — ketemu nyata di production 2026-10-02: admin/program-costing gagal total
// ("couldn't load") pas buka Costing Program template yang punya isian
// tiket_pesawat_list. Dua helper ini jaga-jaga terima dua bentuk (sudah
// objek/array ATAU masih string JSON), fallback ke kosong kalau parse gagal.
export function keArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
export function keObjek(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch { return {}; } }
  return {};
}
