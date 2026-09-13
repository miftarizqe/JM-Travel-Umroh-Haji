import pool from '@/lib/db';
import {
  addonKeysUntukTemplate, paketListUntukTemplate, ruteListUntukTemplate,
  hotelOpsiUntukTemplate, hotelOpsiGabunganUntukTemplate, mutawwifTersediaUntukTemplate, mutawwifahTersediaUntukTemplate,
  malamDefaultUntukTemplate, paxAturanUntukTemplate, malamAturanUntukTemplate, mutawwifAturanUntukTemplate,
  gambarPosisiYUntukTemplate, includeExcludeUntukTemplate, itineraryUntukTemplate,
  modulPilihanUntukTemplate, opsiModulNegara, durasiOpsiUntukTemplate, totalHariProgramUntukTemplate, umrohTambahanTersediaUntukTemplate,
  bisaPilihUrutanUmrohUntukTemplate, umrohDuluDefaultUntukTemplate,
  transportasiTersediaUntukTemplate, maskapaiListUntukTemplate,
} from '@/lib/kalkulatorPublik';

// GET /api/kalkulator-publik/template            -> daftar template aktif (publik, tanpa login)
// GET /api/kalkulator-publik/template?id=xxx     -> detail 1 template
//
// config_json TIDAK PERNAH ikut di response — cuma turunannya (paket_list,
// addon_list, rute_list, hotel_opsi, dst) yang aman dibuka ke publik (nama
// pilihan/opsi, bukan HPP/margin/komisi mentah).
// hotelOpsiUntukTemplate() balikin rate mentah (dipakai server-side buat
// hitungan di stateEfektif) — JANGAN dikirim apa adanya ke publik, cuma
// nama+index-nya yang aman (pengunjung pilih dari nama, harga dihitung
// server-side pas POST /hitung berdasar index yang dipilih).
function hotelOpsiPublik(configJson, paket) {
  const opsi = hotelOpsiUntukTemplate(configJson, paket);
  const strip = (list) => list.map((o, idx) => ({ idx, nama: o.nama }));
  return { mekkah: strip(opsi.mekkah), madinah: strip(opsi.madinah) };
}

// Sama kayak hotelOpsiPublik, TAPI dari daftar GABUNGAN semua bintang (lihat
// hotelOpsiGabunganUntukTemplate) — dipakai KHUSUS kombinasi kamar campuran,
// bintang-nya IKUT dikirim (bukan data sensitif, jamaah emang milih dari
// situ) — HPP/rate mentah tetap gak pernah dikirim.
function hotelOpsiGabunganPublik(configJson) {
  const opsi = hotelOpsiGabunganUntukTemplate(configJson);
  const strip = (list) => list.map((o, idx) => ({ idx, nama: o.nama, bintang: o.bintang ?? null }));
  return { mekkah: strip(opsi.mekkah), madinah: strip(opsi.madinah) };
}

function ringkasanTemplate(t, katalogJenisProgram) {
  const paketList = paketListUntukTemplate(t.config_json);
  return {
    id: t.id, nama: t.nama, deskripsi: t.deskripsi, gambar: t.gambar,
    gambar_posisi_y: gambarPosisiYUntukTemplate(t.config_json),
    paket_list: paketList,
    addon_list: addonKeysUntukTemplate(t.config_json),
    rute_list: ruteListUntukTemplate(t.config_json),
    hotel_opsi: Object.fromEntries(paketList.map(p => [p, hotelOpsiPublik(t.config_json, p)])),
    hotel_opsi_gabungan: hotelOpsiGabunganPublik(t.config_json),
    mutawwif_tersedia: mutawwifTersediaUntukTemplate(t.config_json),
    mutawwifah_tersedia: mutawwifahTersediaUntukTemplate(t.config_json),
    malam_default: malamDefaultUntukTemplate(t.config_json),
    malam_aturan: malamAturanUntukTemplate(t.config_json, katalogJenisProgram),
    mutawwif_aturan: mutawwifAturanUntukTemplate(t.config_json),
    pax_aturan: paxAturanUntukTemplate(t.config_json),
    durasi_opsi: durasiOpsiUntukTemplate(t.config_json),
    total_hari_program: totalHariProgramUntukTemplate(t.config_json),
    umroh_tambahan_tersedia: umrohTambahanTersediaUntukTemplate(t.config_json),
    bisa_pilih_urutan_umroh: bisaPilihUrutanUmrohUntukTemplate(t.config_json, katalogJenisProgram),
    umroh_dulu_default: umrohDuluDefaultUntukTemplate(t.config_json),
    transportasi_tersedia: transportasiTersediaUntukTemplate(t.config_json),
    maskapai_list: maskapaiListUntukTemplate(t.config_json),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const [katalogJenisProgram] = await pool.query('SELECT * FROM jenis_program_master WHERE aktif = 1 ORDER BY urutan ASC');

    if (id) {
      const [[t]] = await pool.query('SELECT id, nama, deskripsi, gambar, config_json FROM kalkulator_template_publik WHERE id = ? AND aktif = 1', [id]);
      if (!t) return Response.json({ error: 'Template tidak ditemukan' }, { status: 404 });
      // Itinerary gabungan (mis. "Umroh + Turkey") & opsi negara tambahan
      // "Pilihan Publik" butuh katalog modul_negara + tiers-nya — cuma
      // di-query di sini (halaman detail), bukan di daftar/list di bawah,
      // biar list ringan.
      const [katalogModulRaw] = await pool.query('SELECT id, nama, pakai_hotel_star, pakai_city_tour_opsi, itinerary_per_hari, include_exclude FROM modul_negara');
      const [tiersRaw] = await pool.query('SELECT * FROM modul_negara_tier');
      const katalogModul = katalogModulRaw.map(m => ({
        ...m,
        itinerary_per_hari: typeof m.itinerary_per_hari === 'string' ? JSON.parse(m.itinerary_per_hari) : m.itinerary_per_hari,
        include_exclude: typeof m.include_exclude === 'string' ? JSON.parse(m.include_exclude) : m.include_exclude,
        tiers: tiersRaw.filter(tier => tier.modul_negara_id === m.id),
      }));
      const { include, exclude } = includeExcludeUntukTemplate(t.config_json, katalogModul);
      const modulPilihan = modulPilihanUntukTemplate(t.config_json, katalogModul).map(m => ({
        ...m, ...opsiModulNegara(katalogModul.find(km => km.id === m.id)),
      }));
      const malamDefault = malamDefaultUntukTemplate(t.config_json);
      return Response.json({
        template: {
          ...ringkasanTemplate(t, katalogJenisProgram),
          include_list: include, exclude_list: exclude,
          // Preview pakai malam DEFAULT template (belum tentu final — jamaah
          // masih bisa ubah di form) biar section Itinerary gak kosong dari
          // awal buat template mode dinamis yang udah ada teks per-hari.
          itinerary: itineraryUntukTemplate(t.config_json, katalogModul, null, katalogJenisProgram, { malamMekkah: malamDefault.mekkah, malamMadinah: malamDefault.madinah }),
          modul_pilihan: modulPilihan,
        },
      });
    }

    // Cuma baris tipe='kurasi' yang di-browse sebagai "paket bernama" — baris
    // tipe='baseline' (jalur "Umroh Private") DIPISAH ke bawah, di-lookup by
    // jenis_program bukan browse by id, biar gak nyampur di grid paket.
    const [rows] = await pool.query("SELECT id, nama, deskripsi, gambar, config_json FROM kalkulator_template_publik WHERE aktif = 1 AND tipe = 'kurasi' ORDER BY urutan ASC, created_at DESC");

    const [baselineRows] = await pool.query("SELECT id, jenis_program FROM kalkulator_template_publik WHERE aktif = 1 AND tipe = 'baseline'");
    const baseline = baselineRows.map(b => ({
      id: b.id, jenis_program: b.jenis_program,
      label: katalogJenisProgram.find(j => j.value === b.jenis_program)?.label || b.jenis_program,
    }));

    return Response.json({ template: rows.map(t => ringkasanTemplate(t, katalogJenisProgram)), baseline });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
