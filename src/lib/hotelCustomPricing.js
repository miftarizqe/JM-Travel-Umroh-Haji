// Custom Hotel per Kota (checkout program reguler) — jamaah pilih Bintang
// Mekkah & Madinah SECARA TERPISAH (bukan checklist hotel spesifik — desain
// awal dengan Master Hotel checklist SUDAH DIGANTI, dikonfirmasi user
// 2026-08-20: cukup reuse 3 baris paket Deluxe/Eksekutif/Signature = Bintang
// 3/4/5 yang SUDAH ADA, gak perlu data opsi terpisah). 3 paket tetap itu
// SAMA SEKALI TIDAK BERUBAH — ini murni opsi tambahan yang dihitung
// proporsional dari rate hotel per-kota milik baris paket yang bersangkutan.
//
// Prinsip yang dipegang (sama kayak kalkulatorPublik.js): resolusi
// paket->rate & mode-persen SELALU terjadi di sini/di caller, TIDAK PERNAH
// mengubah hitungHppKamar/hitungHargaJual di kalkulatorBiaya.js.
import { hitungHppKamar, hitungHargaJual, KAPASITAS_KAMAR } from './kalkulatorBiaya';

const KAMAR = Object.keys(KAPASITAS_KAMAR); // ['quad','triple','double']
export const PAKET = ['deluxe', 'eksekutif', 'signature'];
export const BINTANG_PAKET = { deluxe: 3, eksekutif: 4, signature: 5 };

// Ambil baris biaya_breakdown (program_id=X, is_template=0) utk SEMUA paket
// yang ada, plus item Master-nya (identik di ketiga baris — dikumpulkan
// sekali dari baris pertama, lihat komentar di caller). Dipakai bareng oleh
// endpoint hitung-hotel-custom & booking.js.
async function ambilBarisPaket(db, progId) {
  const [rows] = await db.query('SELECT * FROM biaya_breakdown WHERE program_id = ? AND is_template = 0', [progId]);
  const perPaket = {};
  for (const r of rows) if (r.paket) perPaket[r.paket] = r;
  return perPaket;
}

// Hitung harga jual per tipe kamar buat kombinasi (mekkahPaket, madinahPaket)
// — kalau SAMA (bukan mix beneran), balikin harga programs.harga_{paket}_*
// APA ADANYA (exact match sama tampilan paket biasa, gak lewat kalkulator
// ulang sama sekali, biar gak ada risiko selisih pembulatan). Kalau BEDA
// (mix sungguhan), base cost (tiket/visa/item master/pax/kurs) diambil dari
// baris mekkahPaket (identik di ketiga baris by construction — semua field
// itu bagian dari `shared` KalkulatorTerpadu yang di-duplikasi ke 3 baris
// paket saat admin simpan), rate hotel Mekkah dari baris mekkahPaket & rate
// hotel Madinah dari baris madinahPaket, margin/komisi PERSEN dari HPP
// (bukan flat Rp milik salah satu baris — gak ada cara adil milih flat Rp
// siapa yang dipakai kalau 2 paket beda dikombinasikan).
export async function hitungHargaCustomHotelDenganDb(db, progId, { mekkahPaket, madinahPaket }) {
  if (!PAKET.includes(mekkahPaket)) throw Object.assign(new Error('Pilih Bintang Mekkah dulu'), { status: 400 });
  if (!PAKET.includes(madinahPaket)) throw Object.assign(new Error('Pilih Bintang Madinah dulu'), { status: 400 });

  const [[prog]] = await db.query(
    `SELECT margin_mode, margin_persen, komisi_mode, komisi_persen,
            harga_deluxe_quad, harga_deluxe_triple, harga_deluxe_double,
            harga_eksekutif_quad, harga_eksekutif_triple, harga_eksekutif_double,
            harga_signature_quad, harga_signature_triple, harga_signature_double
     FROM programs WHERE id = ? AND active = 1`,
    [progId]
  );
  if (!prog) throw Object.assign(new Error('Program tidak ditemukan'), { status: 404 });
  if (prog.margin_mode !== 'persen') {
    throw Object.assign(new Error('Program ini belum menyediakan Custom Hotel per Kota'), { status: 400 });
  }

  // Kombinasi MURNI (bukan mix) — pakai harga paket yang sudah ada apa
  // adanya, gak usah dihitung ulang sama sekali.
  if (mekkahPaket === madinahPaket) {
    const perKamar = {};
    for (const kamar of KAMAR) perKamar[kamar] = Number(prog[`harga_${mekkahPaket}_${kamar}`]) || 0;
    return { perKamar, bintangMekkah: BINTANG_PAKET[mekkahPaket], bintangMadinah: BINTANG_PAKET[madinahPaket] };
  }

  const perPaket = await ambilBarisPaket(db, progId);
  const rowMekkah = perPaket[mekkahPaket];
  const rowMadinah = perPaket[madinahPaket];
  if (!rowMekkah || !rowMadinah) {
    throw Object.assign(new Error('Data costing program ini belum lengkap, hubungi admin'), { status: 404 });
  }
  const [items] = await db.query('SELECT * FROM biaya_breakdown_item WHERE breakdown_id = ?', [rowMekkah.id]);

  const [katalogModul] = await db.query('SELECT * FROM modul_negara');
  for (const m of katalogModul) {
    const [tiers] = await db.query('SELECT * FROM modul_negara_tier WHERE modul_negara_id = ?', [m.id]);
    const [addons] = await db.query('SELECT * FROM modul_negara_addon WHERE modul_negara_id = ?', [m.id]);
    m.tiers = tiers; m.addons = addons;
  }

  const stateDasar = {
    ...rowMekkah, items,
    hotel_madinah_rate_double: rowMadinah.hotel_madinah_rate_double,
    hotel_madinah_rate_triple: rowMadinah.hotel_madinah_rate_triple,
    hotel_madinah_rate_quad: rowMadinah.hotel_madinah_rate_quad,
    hotel_madinah_mata_uang: rowMadinah.hotel_madinah_mata_uang,
    hotel_madinah_malam: rowMadinah.hotel_madinah_malam,
    hotel_list: null, // Custom Hotel per Kota selalu mode 'fix' 2-slot, bukan Hotel Mix
    margin_rate: 0,
  };
  const hppMentah = hitungHppKamar(stateDasar, katalogModul);

  const marginPersen = Number(prog.margin_persen) || 0;
  const komisiPersen = prog.komisi_mode === 'persen' ? (Number(prog.komisi_persen) || 0) : 0;

  const perKamar = {};
  for (const kamar of KAMAR) {
    const hppTermasukMargin = Math.round(hppMentah[kamar] * (1 + marginPersen / 100));
    const komisiRp = Math.round(hppMentah[kamar] * (komisiPersen / 100));
    perKamar[kamar] = hitungHargaJual(hppTermasukMargin, komisiRp, rowMekkah.pembulatan);
  }

  return { perKamar, bintangMekkah: BINTANG_PAKET[mekkahPaket], bintangMadinah: BINTANG_PAKET[madinahPaket] };
}
