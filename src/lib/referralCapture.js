const KEY = 'ref_perwakilan';

// Jejak "?ref=<kode_unik_perwakilan>" di link publik (program/[id], programs,
// register) — disimpan ke localStorage biar nyambung sampai ke checkout,
// gak kayak query param yang ilang begitu pindah halaman. Dipakai buat
// auto-fill "Sumber Informasi = Perwakilan" di /checkout tanpa jamaah harus
// pilih manual dari dropdown (dikonfirmasi user 2026-09-02, mirror pola link
// referral sahabat yang sudah ada, tapi target-nya beda: bukan bikin akun
// baru terhubung ke perekrut, cuma nge-tag booking). PERMANEN (localStorage,
// gak expired) -- SENGAJA, dipakai buat atribusi booking/registrasi yang
// bisa kejadian hari lain, beda urusan dari WA-switching session di bawah.
export function tangkapRefPerwakilan() {
  if (typeof window === 'undefined') return;
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (!ref) return;
  localStorage.setItem(KEY, ref);
  resolveWaDisplay(ref, '/api/referral-wa/');
}

export function ambilRefPerwakilan() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY) || null;
}

const KEY_AGEN = 'ref_agen';

// Link referral akun "agen" (dikonfirmasi user 2026-10-17) — dipanggil dari
// /a/[kode] setelah fetch identitas agen-nya ke server (BUKAN baca ?ref=
// langsung kayak perwakilan, karena perlu nomor WA-nya juga buat nge-swap
// tombol WA di landing page, bukan cuma kode). `id` disimpan PERMANEN
// (localStorage) -- dipakai ambilRefAgenId() buat kunci referral_agen_id
// pas registrasi (migration 240, bisa kejadian hari lain). wa/nama/jenis_
// kelamin TERPISAH (lihat simpanWaDisplay di bawah) -- display doang,
// sengaja gak permanen.
export function tangkapRefAgen({ id, wa, nama, jenis_kelamin }) {
  if (typeof window === 'undefined') return;
  if (!id) return;
  localStorage.setItem(KEY_AGEN, JSON.stringify({ id }));
  simpanWaDisplay({ wa, nama, jenis_kelamin });
}

export function ambilRefAgenId() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(KEY_AGEN) || 'null')?.id || null;
  } catch {
    return null;
  }
}

// --- WA-switching & sapaan personal (SESSION, bukan permanen) ----------
// Dikonfirmasi user 2026-10-21: nomor WA & sapaan yang di-swap pas
// pengunjung datang lewat link referral (agen/perwakilan/sahabat) HARUS
// gak nyangkut selamanya kayak atribusi id di atas -- tab/sesi browser
// baru (ganti tab, buka lagi besok) harus balik netral ke WA kantor kalau
// kali ini bukan lewat link lagi. sessionStorage (bukan localStorage)
// otomatis clear begitu tab ditutup, jadi gak perlu TTL manual.
const KEY_WA_DISPLAY = 'ref_wa_display_session';
const KEY_WA_RESOLVED_KODE = 'ref_wa_resolved_kode_session';

function simpanWaDisplay({ wa, nama, jenis_kelamin }) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY_WA_DISPLAY, JSON.stringify({ wa: wa || null, nama: nama || null, jenis_kelamin: jenis_kelamin || null }));
}

function ambilWaDisplayObjek() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(sessionStorage.getItem(KEY_WA_DISPLAY) || 'null');
  } catch {
    return null;
  }
}

// Resolve kode (Perwakilan/Sahabat) jadi identitas WA-display lewat
// endpoint publik — dipanggil dari tangkapRefPerwakilan() tiap ada ?ref=
// baru. Di-skip kalau kode yang sama udah pernah di-resolve DI SESI INI
// (hindari fetch berulang tiap pindah halaman selama kode-nya gak ganti).
// Best-effort, gagal/404 dibiarkan diam-diam (kode salah ketik/bukan
// Perwakilan-Sahabat — tetap biarin ambilRefPerwakilan() jalan apa adanya
// buat atribusi booking, cuma WA-switch-nya yang gak aktif).
function resolveWaDisplay(kode, endpointPrefix) {
  if (typeof window === 'undefined' || !kode) return;
  if (sessionStorage.getItem(KEY_WA_RESOLVED_KODE) === kode) return;
  fetch(`${endpointPrefix}${encodeURIComponent(kode)}`)
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (d?.wa) simpanWaDisplay(d);
      sessionStorage.setItem(KEY_WA_RESOLVED_KODE, kode);
    })
    .catch(() => {});
}

export function ambilWaReferral() {
  return ambilWaDisplayObjek()?.wa || null;
}

// Sapaan pembuka pesan WA (dikonfirmasi user 2026-10-19, diperluas ke
// Perwakilan/Sahabat 2026-10-21) — "Assalamualaikum Ibu/Bapak <nama>" kalau
// ada referral ter-capture SESI INI, fallback "Assalamualaikum" polos kalau
// enggak (Perempuan->Ibu, selain itu->Bapak).
export function salamReferral() {
  const d = ambilWaDisplayObjek();
  if (!d?.nama) return 'Assalamualaikum';
  const sapaan = d.jenis_kelamin === 'Perempuan' ? 'Ibu' : 'Bapak';
  return `Assalamualaikum ${sapaan} ${d.nama}`;
}
