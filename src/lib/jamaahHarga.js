// Satu sumber kebenaran buat baca kombo paket/kamar/harga tiap jamaah dalam
// 1 booking. Dulu paket/kamar seragam untuk SEMUA jamaah di booking yang
// sama; sekarang BISA beda per orang (field paket/kamar/harga_jual per
// entry di jamaah_data — schemaless JSON, ditulis pertama kali begitu admin
// edit kombo 1 jamaah spesifik, lihat PATCH /api/bookings/[id]).
//
// Invariant: dalam 1 booking, entry aktif SELALU all-or-nothing — semua
// entry punya paket+kamar+harga_jual, atau semua kosong ("masih seragam").
// Booking lama yang belum pernah diedit per-jamaah gak punya field ini sama
// sekali → resolveJamaahHarga() fallback ke nilai booking-level, HARUS
// menghasilkan angka identik ke perilaku lama (harga rata-rata dari
// total_harga dibagi jumlah jamaah aktif).

export function KAMAR_KEY(kamar) {
  const k = String(kamar || '').toLowerCase();
  if (k.includes('quad')) return 'quad';
  if (k.includes('double')) return 'double';
  return 'triple';
}

export function hargaProgram(program, paket, kamarKey) {
  if (!program) return 0;
  return Number(program[`harga_${paket}_${kamarKey}`] || program[`harga_${paket}`] || 0);
}

// jamaah_data kadang datang mentah dari row SQL (string JSON belum
// di-parse) tergantung caller — semua fungsi di sini toleran ke dua bentuk
// biar gak perlu diinget manual di tiap call site.
function jamaahAktif(booking) {
  let jd = booking?.jamaah_data;
  if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
  const entries = Array.isArray(jd) ? jd : [];
  return entries.filter(e => e?.status_jamaah !== 'dibatalkan');
}

/** Kombo paket/kamar/harga 1 entry jamaah — pakai field per-entry kalau ada, else fallback ke booking-level. */
export function resolveJamaahHarga(booking, jamaahEntry) {
  if (jamaahEntry && jamaahEntry.paket && jamaahEntry.kamar && jamaahEntry.harga_jual != null) {
    return {
      paket: jamaahEntry.paket,
      kamar: jamaahEntry.kamar,
      kamarKey: KAMAR_KEY(jamaahEntry.kamar),
      hargaJual: Number(jamaahEntry.harga_jual) || 0,
    };
  }
  const aktifCount = jamaahAktif(booking).length || Number(booking.jumlah_jamaah) || 1;
  const opsiTotal = Number(booking.opsi_tambahan_total) || 0;
  // total_harga sudah DIKURANGI voucher (lihat src/lib/booking.js), sedangkan
  // harga_jual per-entry itu harga SEBELUM voucher (voucher itu diskon
  // sekali di level booking, gak dipecah per orang) — tambahin lagi biar
  // konsisten sama harga_jual yang disnapshot pas booking dibuat.
  const voucherNominal = Number(booking.voucher_nominal) || 0;
  const hargaRataRata = aktifCount > 0 ? (Number(booking.total_harga) + voucherNominal - opsiTotal) / aktifCount : 0;
  return {
    paket: booking.paket,
    kamar: booking.kamar,
    kamarKey: KAMAR_KEY(booking.kamar),
    hargaJual: Math.round(hargaRataRata),
  };
}

/**
 * Kelompokkan jamaah aktif per kombo (paket+tipe kamar) — dipakai laporan
 * keuangan/komisi yang butuh hitung cost/margin PER KOMBO (HPP beda per
 * paket+kamar), bukan cuma total headcount seragam kayak dulu.
 */
export function groupJamaahAktif(booking) {
  const groups = new Map(); // "paket|kamarKey" -> { paket, kamarKey, count }
  for (const e of jamaahAktif(booking)) {
    const r = resolveJamaahHarga(booking, e);
    const key = `${r.paket}|${r.kamarKey}`;
    const g = groups.get(key) || { paket: r.paket, kamarKey: r.kamarKey, count: 0 };
    g.count++;
    groups.set(key, g);
  }
  // Booking super lama yang jamaah_data-nya kosong/null total (dari sebelum
  // fitur jamaah_data ada) — fallback 1 grup dari kombo+jumlah_jamaah
  // booking-level, biar laporan gak diam-diam nge-nolkan margin booking ini.
  if (groups.size === 0) {
    const count = Number(booking.jumlah_jamaah) || 1;
    if (count > 0) groups.set('_fallback', { paket: booking.paket, kamarKey: KAMAR_KEY(booking.kamar), count });
  }
  return [...groups.values()];
}

/** Label ringkas buat tampilan admin — kombo seragam kalau semua jamaah aktif sama persis (paket+tipe kamar), atau "Campuran". */
export function ringkasanPaketKamar(booking) {
  const aktif = jamaahAktif(booking);
  if (aktif.length === 0) {
    return { campuran: false, paket: booking.paket, kamar: booking.kamar };
  }
  const kombos = aktif.map(e => resolveJamaahHarga(booking, e));
  const first = kombos[0];
  const seragam = kombos.every(k => k.paket === first.paket && k.kamarKey === first.kamarKey);
  return seragam
    ? { campuran: false, paket: first.paket, kamar: first.kamar }
    : { campuran: true, paket: null, kamar: null };
}
