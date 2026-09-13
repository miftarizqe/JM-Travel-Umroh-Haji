const KEY = 'ref_perwakilan';

// Jejak "?ref=<kode_unik_perwakilan>" di link publik (program/[id], programs,
// register) — disimpan ke localStorage biar nyambung sampai ke checkout,
// gak kayak query param yang ilang begitu pindah halaman. Dipakai buat
// auto-fill "Sumber Informasi = Perwakilan" di /checkout tanpa jamaah harus
// pilih manual dari dropdown (dikonfirmasi user 2026-09-02, mirror pola link
// referral sahabat yang sudah ada, tapi target-nya beda: bukan bikin akun
// baru terhubung ke perekrut, cuma nge-tag booking).
// Baca langsung dari window.location.search (BUKAN hook useSearchParams) —
// sengaja, biar bisa dipanggil dari halaman mana pun di dalam useEffect
// tanpa perlu bungkus <Suspense> tambahan yang disyaratkan useSearchParams.
export function tangkapRefPerwakilan() {
  if (typeof window === 'undefined') return;
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) localStorage.setItem(KEY, ref);
}

export function ambilRefPerwakilan() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY) || null;
}
