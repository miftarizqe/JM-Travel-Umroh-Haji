// Data akun yang disimpan di localStorage browser dan WAJIB dibuang saat logout:
// - `user`: cache data akun (lihat useCurrentUser.js);
// - `draft_form_jamaah_<booking>`: draft formulir jamaah (form-jamaah) — isinya data pribadi
//   (NIK, paspor, orang tua, alamat). Dulu tertinggal sesudah logout, jadi di perangkat bersama
//   akun berikutnya ditawari "lanjutkan draft" berisi data orang lain.
// Referral (`ref_perwakilan`, `ref_agen`) & preferensi tampilan sengaja TIDAK dibuang: itu milik
// perangkat/kunjungan, bukan milik akun (lihat referralCapture.js).
export function bersihkanDataLokalAkun() {
  try {
    localStorage.removeItem('user');
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('draft_form_jamaah_')) localStorage.removeItem(k);
    }
  } catch {}
}
