import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { hitungHppKamar, cariTierModulNegara } from '@/lib/kalkulatorBiaya';
import {
  PAKET_LIST, KAMAR_LIST, stateEfektif,
  ruteListUntukTemplate, hotelOpsiUntukTemplate, mutawwifTersediaUntukTemplate,
  mutawwifahTersediaUntukTemplate, malamDefaultUntukTemplate, paxAturanUntukTemplate,
  malamAturanUntukTemplate, mutawwifAturanUntukTemplate, modulPilihanUntukTemplate,
  itineraryUntukTemplate, durasiOpsiUntukTemplate, maskapaiListUntukTemplate,
} from '@/lib/kalkulatorPublik';

const MALAM_MIN = 1, MALAM_MAX = 20;

// POST /api/perwakilan/kalkulator/hitung — mirror
// src/app/api/kalkulator-publik/hitung/route.js (mode tunggal SAJA, mode
// kombinasi kamar campuran di luar scope v1), TAPI:
//   - Khusus role 'perwakilan' (bukan pengunjung publik).
//   - margin_rate DIPAKSA 0 (bukan marginFlatUntukTemplate template) — hasil
//     hitungHppKamar jadi HPP MURNI (cost basis, tanpa margin perusahaan).
//   - HPP diizinkan keluar ke client (beda dari endpoint publik yang comment-
//     nya eksplisit "HPP TIDAK PERNAH keluar" — itu buat pengunjung publik;
//     perwakilan sudah punya presenden lihat HPP sendiri di /perwakilan/harga).
//   - TIDAK insert row apa pun — perwakilan bebas ganti-ganti pilihan dulu,
//     simpan eksplisit lewat /api/perwakilan/kalkulator/simpan kalau sudah pas.
export async function POST(request) {
  const auth = wajibRole(request, ['perwakilan']);
  if (auth.error) return auth.error;
  try {
    const {
      template_id, paket, kamar, tanggal_berangkat, addon_keys,
      rute, hotel_mekkah_opsi_idx, hotel_madinah_opsi_idx,
      malam_mekkah, malam_madinah, mutawwif_hari, pakai_mutawwifah,
      jumlah_cowok, jumlah_cewek, modul_pilihan_dipilih, durasi_dipilih, jumlah_umroh, urutan_dipilih, umroh_dulu_dipilih,
      transportasi_pilihan, maskapai, pax_tl,
    } = await request.json();

    if (!template_id || !paket || !kamar) {
      return Response.json({ error: 'template_id, paket, dan kamar wajib diisi' }, { status: 400 });
    }
    if (!PAKET_LIST.includes(paket)) return Response.json({ error: 'Paket tidak valid' }, { status: 400 });
    if (!KAMAR_LIST.includes(kamar)) return Response.json({ error: 'Tipe kamar tidak valid' }, { status: 400 });

    const [[t]] = await pool.query('SELECT id, config_json FROM kalkulator_template_publik WHERE id = ? AND aktif = 1', [template_id]);
    if (!t) return Response.json({ error: 'Template tidak ditemukan' }, { status: 404 });
    const [katalogJenisProgram] = await pool.query('SELECT * FROM jenis_program_master WHERE aktif = 1');
    const [[pengaturanKurs]] = await pool.query('SELECT kurs_sar_idr, kurs_usd_idr FROM pengaturan WHERE id = 1');

    const paxAturan = paxAturanUntukTemplate(t.config_json);

    const ruteList = ruteListUntukTemplate(t.config_json);
    if (ruteList.length > 0 && !ruteList.includes(rute)) {
      return Response.json({ error: `Rute wajib dipilih: ${ruteList.join(' / ')}` }, { status: 400 });
    }

    const maskapaiList = maskapaiListUntukTemplate(t.config_json);
    if (maskapaiList.length > 0 && !maskapaiList.includes(maskapai)) {
      return Response.json({ error: `Maskapai wajib dipilih: ${maskapaiList.join(' / ')}` }, { status: 400 });
    }

    const opsiHotel = hotelOpsiUntukTemplate(t.config_json, paket);
    const idxValid = (list, idx) => idx != null && Number.isInteger(idx) && idx >= 0 && idx < list.length;
    if (opsiHotel.mekkah.length > 0 && !idxValid(opsiHotel.mekkah, hotel_mekkah_opsi_idx)) {
      return Response.json({ error: 'Pilihan hotel Mekkah wajib diisi' }, { status: 400 });
    }
    if (opsiHotel.madinah.length > 0 && !idxValid(opsiHotel.madinah, hotel_madinah_opsi_idx)) {
      return Response.json({ error: 'Pilihan hotel Madinah wajib diisi' }, { status: 400 });
    }

    const durasiOpsi = durasiOpsiUntukTemplate(t.config_json);
    if (durasiOpsi.length > 0 && !durasiOpsi.some(d => d.hari === Number(durasi_dipilih))) {
      return Response.json({ error: `Durasi wajib dipilih: ${durasiOpsi.map(d => d.hari).join(' / ')} Hari` }, { status: 400 });
    }
    const durasiTerpilih = durasiOpsi.find(d => d.hari === Number(durasi_dipilih)) || null;

    const malamDefault = malamDefaultUntukTemplate(t.config_json);
    const malamAturan = malamAturanUntukTemplate(t.config_json, katalogJenisProgram);
    let malamMekkah, malamMadinah;
    if (malamAturan.mode === 'tidak_ada') {
      malamMekkah = 0;
      malamMadinah = 0;
    } else if (malamAturan.mode === 'fix') {
      malamMekkah = malamDefault.mekkah;
      malamMadinah = malamDefault.madinah;
    } else {
      malamMekkah = malam_mekkah != null ? Number(malam_mekkah) : malamDefault.mekkah;
      malamMadinah = malam_madinah != null ? Number(malam_madinah) : malamDefault.madinah;
      if (!(malamMekkah >= MALAM_MIN && malamMekkah <= MALAM_MAX) || !(malamMadinah >= MALAM_MIN && malamMadinah <= MALAM_MAX)) {
        return Response.json({ error: `Malam Mekkah/Madinah harus antara ${MALAM_MIN}-${MALAM_MAX}` }, { status: 400 });
      }
      if (durasiTerpilih?.malam && malamMekkah + malamMadinah !== durasiTerpilih.malam) {
        return Response.json({ error: `Total malam Mekkah + Madinah harus pas ${durasiTerpilih.malam} malam (durasi ${durasiTerpilih.hari} hari)` }, { status: 400 });
      }
    }

    const totalHariProgram = durasiTerpilih?.hari || (malamMekkah + malamMadinah + 1);
    const mutawwifTersedia = mutawwifTersediaUntukTemplate(t.config_json);
    let mutawwifHari = null;
    if (mutawwifTersedia) {
      const mutawwifAturan = mutawwifAturanUntukTemplate(t.config_json);
      if (mutawwifAturan.mode === 'fix') {
        mutawwifHari = mutawwifAturan.fixHari;
      } else {
        if (mutawwif_hari != null && Number(mutawwif_hari) < 3) {
          return Response.json({ error: 'Hari mutawwif minimal 3 hari (1 hari penjemputan + 2 hari umroh) — kosongkan aja kalau mau sepanjang trip.' }, { status: 400 });
        }
        mutawwifHari = mutawwif_hari != null ? Number(mutawwif_hari) : totalHariProgram;
        if (!(mutawwifHari >= 0 && mutawwifHari <= totalHariProgram)) {
          return Response.json({ error: 'Hari mutawwif tidak boleh melebihi total hari program' }, { status: 400 });
        }
      }
    }

    const mutawwifahTersedia = mutawwifahTersediaUntukTemplate(t.config_json);
    const pakaiMutawwifah = mutawwifahTersedia ? (pakai_mutawwifah !== false) : undefined;

    if (jumlah_umroh != null && (!Number.isInteger(Number(jumlah_umroh)) || Number(jumlah_umroh) < 1)) {
      return Response.json({ error: 'Jumlah Umroh minimal 1 kali' }, { status: 400 });
    }

    const paxJamaah = (Number(jumlah_cowok) || 0) + (Number(jumlah_cewek) || 0);
    if (paxJamaah < 1) {
      return Response.json({ error: 'Jumlah jamaah cowok/cewek wajib diisi minimal 1 orang' }, { status: 400 });
    }
    if (paxAturan.mode === 'fix' && paxJamaah !== paxAturan.fixTotal) {
      return Response.json({ error: `Paket ini khusus ${paxAturan.fixTotal} orang — jumlah jamaah cowok+cewek harus pas ${paxAturan.fixTotal}` }, { status: 400 });
    }
    if (paxAturan.mode === 'dinamis') {
      if (paxAturan.min != null && paxJamaah < paxAturan.min) {
        return Response.json({ error: `Paket ini minimal ${paxAturan.min} orang` }, { status: 400 });
      }
      if (paxAturan.max != null && paxJamaah > paxAturan.max) {
        return Response.json({ error: `Paket ini maksimal ${paxAturan.max} orang` }, { status: 400 });
      }
    }

    const [katalogModul] = await pool.query('SELECT * FROM modul_negara');
    for (const m of katalogModul) {
      const [tiers] = await pool.query('SELECT * FROM modul_negara_tier WHERE modul_negara_id = ?', [m.id]);
      const [addons] = await pool.query('SELECT * FROM modul_negara_addon WHERE modul_negara_id = ?', [m.id]);
      m.tiers = tiers; m.addons = addons;
    }

    const modulPilihanAllowed = modulPilihanUntukTemplate(t.config_json, katalogModul).map(m => String(m.id));
    let modulPilihanDipilih = null;
    if (modulPilihanAllowed.length > 0) {
      const dipilih = Array.isArray(modul_pilihan_dipilih) ? modul_pilihan_dipilih : [];
      if (dipilih.length < 1) {
        return Response.json({ error: 'Pilih minimal 1 negara tambahan dulu.' }, { status: 400 });
      }
      for (const entry of dipilih) {
        if (!modulPilihanAllowed.includes(String(entry?.modul_negara_id))) {
          return Response.json({ error: 'Negara tambahan yang dipilih tidak valid untuk paket ini.' }, { status: 400 });
        }
        const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
        const tier = cariTierModulNegara(modul, { ...entry, tanggal: tanggal_berangkat }, paxJamaah);
        if (!tier) {
          return Response.json({ error: `Kombinasi pilihan untuk ${modul?.nama || 'negara tambahan'} belum tersedia — coba ubah hari/opsi hotel/city tour.` }, { status: 400 });
        }
      }
      modulPilihanDipilih = dipilih;
    }

    const addonKeysDipilih = Array.isArray(addon_keys) ? addon_keys : [];
    const state = stateEfektif(t.config_json, {
      tanggalBerangkat: tanggal_berangkat || null, addonKeysDipilih,
      rute: ruteList.length > 0 ? rute : null,
      malamMekkah, malamMadinah, mutawwifHari, pakaiMutawwifah, paxJamaah, paxTl: pax_tl,
      modulPilihanDipilih, durasiDipilih: durasiOpsi.length > 0 ? durasi_dipilih : null, jumlahUmroh: jumlah_umroh,
      umrohDuluDipilih: umroh_dulu_dipilih,
      transportasiDipilih: transportasi_pilihan, maskapaiDipilih: maskapaiList.length > 0 ? maskapai : null,
      kursSarIdr: pengaturanKurs?.kurs_sar_idr, kursUsdIdr: pengaturanKurs?.kurs_usd_idr,
      paket, hotelMekkahOpsiIdx: opsiHotel.mekkah.length > 0 ? hotel_mekkah_opsi_idx : null,
      hotelMadinahOpsiIdx: opsiHotel.madinah.length > 0 ? hotel_madinah_opsi_idx : null,
      marginFlat: 0, // HPP MURNI — inilah bedanya sama endpoint publik
    });
    const hpp = hitungHppKamar(state, katalogModul);

    const itinerary = itineraryUntukTemplate(t.config_json, katalogModul, modulPilihanDipilih, katalogJenisProgram, { malamMekkah, malamMadinah, urutanDipilih: urutan_dipilih, umrohDuluDipilih: umroh_dulu_dipilih, tanggalBerangkat: tanggal_berangkat || null });

    // addon_config disimpen apa adanya oleh caller (endpoint simpan) — di sini
    // cuma dikembalikan biar client gak perlu rekonstruksi ulang pas nyimpen.
    const pilihanConfig = {
      addon_keys: addonKeysDipilih,
      rute: ruteList.length > 0 ? rute : null,
      hotel_mekkah: opsiHotel.mekkah[hotel_mekkah_opsi_idx]?.nama || null,
      hotel_madinah: opsiHotel.madinah[hotel_madinah_opsi_idx]?.nama || null,
      malam_mekkah: malamMekkah, malam_madinah: malamMadinah,
      mutawwif_hari: mutawwifHari,
      pakai_mutawwifah: pakaiMutawwifah ?? null,
      pax_tl: pax_tl != null ? Number(pax_tl) || 0 : 0,
      jumlah_cowok: jumlah_cowok != null ? Number(jumlah_cowok) || 0 : null,
      jumlah_cewek: jumlah_cewek != null ? Number(jumlah_cewek) || 0 : null,
      modul_pilihan: modulPilihanDipilih ? modulPilihanDipilih.map(m => ({
        nama: katalogModul.find(km => String(km.id) === String(m.modul_negara_id))?.nama || null,
        hari: m.hari, hotel_star: m.hotel_star ?? null, city_tour_opsi: m.city_tour_opsi ?? null,
      })) : null,
      transportasi_pilihan: transportasi_pilihan || null,
      maskapai: maskapaiList.length > 0 ? maskapai : null,
    };

    return Response.json({ hpp, itinerary, addon_config: pilihanConfig });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
