import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { hitungHppKamar, hitungHargaJual, cariTierModulNegara, rincianHppLengkap } from '@/lib/kalkulatorBiaya';
import {
  PAKET_LIST, KAMAR_LIST, stateEfektif, pembulatanTemplate,
  ruteListUntukTemplate, hotelOpsiUntukTemplate, hotelOpsiGabunganUntukTemplate, mutawwifTersediaUntukTemplate,
  mutawwifahTersediaUntukTemplate, malamDefaultUntukTemplate, paxAturanUntukTemplate,
  malamAturanUntukTemplate, mutawwifAturanUntukTemplate, modulPilihanUntukTemplate,
  itineraryUntukTemplate, durasiOpsiUntukTemplate, maskapaiListUntukTemplate,
  marginFlatUntukTemplate, komisiFlatUntukTemplate,
} from '@/lib/kalkulatorPublik';

const MALAM_MIN = 1, MALAM_MAX = 20;

// POST /api/kalkulator-publik/hitung — wajib login (ini gerbang lead capture:
// pengunjung bisa isi form apa aja TANPA login, tapi baru bisa lihat angka
// begitu login/daftar). Setiap panggilan sukses = 1 baris BARU di
// kalkulator_lead (bukan upsert) — riwayat tiap eksplorasi tetap kesimpen,
// itu yang jadi database follow-up admin.
//
// Response CUMA berisi harga_jual final — HPP/komisi/margin/config_json
// TIDAK PERNAH keluar dari sini.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const {
      template_id, paket, kamar, tanggal_berangkat, addon_keys,
      rute, hotel_mekkah_opsi_idx, hotel_madinah_opsi_idx,
      malam_mekkah, malam_madinah, mutawwif_hari, pakai_mutawwifah,
      jumlah_cowok, jumlah_cewek, modul_pilihan_dipilih, durasi_dipilih, jumlah_umroh, urutan_dipilih, umroh_dulu_dipilih,
      transportasi_pilihan, maskapai, kombinasi, pax_tl,
    } = await request.json();
    // Mode "kombinasi" — 1 grup private, tapi paket/kamar BEDA per sub-grup
    // (mis. 3 orang Quad Signature + 4 orang Triple Deluxe). Cuma masuk akal
    // buat paket private/custom (paxAturan.mode 'dinamis', dicek di bawah
    // begitu config template kebaca) — Umroh Berdua/paket fix tetap 1
    // paket+kamar seragam kayak sebelumnya, jalur itu SAMA SEKALI gak
    // disentuh (lihat percabangan pakaiKombinasi).
    const pakaiKombinasiRaw = Array.isArray(kombinasi) && kombinasi.length > 0;
    if (!pakaiKombinasiRaw && (!template_id || !paket || !kamar)) {
      return Response.json({ error: 'template_id, paket, dan kamar wajib diisi' }, { status: 400 });
    }
    if (pakaiKombinasiRaw && !template_id) {
      return Response.json({ error: 'template_id wajib diisi' }, { status: 400 });
    }
    if (!pakaiKombinasiRaw && !PAKET_LIST.includes(paket)) return Response.json({ error: 'Paket tidak valid' }, { status: 400 });
    if (!pakaiKombinasiRaw && !KAMAR_LIST.includes(kamar)) return Response.json({ error: 'Tipe kamar tidak valid' }, { status: 400 });
    if (pakaiKombinasiRaw) {
      for (const k of kombinasi) {
        if (!KAMAR_LIST.includes(k.kamar)) return Response.json({ error: 'Tipe kamar tidak valid di salah satu baris kombinasi' }, { status: 400 });
        if ((Number(k.jumlah_cowok) || 0) + (Number(k.jumlah_cewek) || 0) < 1) {
          return Response.json({ error: 'Tiap baris kombinasi wajib diisi minimal 1 orang' }, { status: 400 });
        }
      }
    }

    const [[t]] = await pool.query('SELECT id, config_json FROM kalkulator_template_publik WHERE id = ? AND aktif = 1', [template_id]);
    if (!t) return Response.json({ error: 'Template tidak ditemukan' }, { status: 404 });
    const [katalogJenisProgram] = await pool.query('SELECT * FROM jenis_program_master WHERE aktif = 1');
    // Kurs SAR/USD->IDR ambil LIVE dari Master Kurs (pengaturan), bukan dari
    // config_json template — lihat stateEfektif#kurs_sar_idr.
    const [[pengaturanKurs]] = await pool.query('SELECT kurs_sar_idr, kurs_usd_idr FROM pengaturan WHERE id = 1');

    // Kombinasi cuma masuk akal buat paket private/custom (mode 'dinamis') —
    // Umroh Berdua (pasangan) & paket fix emang harus seragam by design.
    const paxAturan = paxAturanUntukTemplate(t.config_json);
    if (pakaiKombinasiRaw && paxAturan.mode !== 'dinamis') {
      return Response.json({ error: 'Kombinasi kamar campuran cuma tersedia untuk paket private/custom.' }, { status: 400 });
    }
    const pakaiKombinasi = pakaiKombinasiRaw && paxAturan.mode === 'dinamis';

    // Rute — WAJIB dipilih kalau template ini beneran nawarin >1 rute (direct
    // vs transit beda harga), diabaikan kalau template cuma punya 1/gak ada
    // pembeda rute sama sekali.
    const ruteList = ruteListUntukTemplate(t.config_json);
    if (ruteList.length > 0 && !ruteList.includes(rute)) {
      return Response.json({ error: `Rute wajib dipilih: ${ruteList.join(' / ')}` }, { status: 400 });
    }

    // Maskapai — WAJIB dipilih kalau admin beneran ngisi harga tiket beda
    // per maskapai (>=2 nilai unik di tiket_pesawat_list), sama pola kayak
    // Rute di atas.
    const maskapaiList = maskapaiListUntukTemplate(t.config_json);
    if (maskapaiList.length > 0 && !maskapaiList.includes(maskapai)) {
      return Response.json({ error: `Maskapai wajib dipilih: ${maskapaiList.join(' / ')}` }, { status: 400 });
    }

    // Opsi hotel — buat mode tunggal: per PAKET (WAJIB dipilih kalau template
    // nawarin opsi buat kota itu, diabaikan kalau cuma punya 1 hotel default).
    const opsiHotel = pakaiKombinasi ? { mekkah: [], madinah: [] } : hotelOpsiUntukTemplate(t.config_json, paket);
    const idxValid = (list, idx) => idx != null && Number.isInteger(idx) && idx >= 0 && idx < list.length;
    if (!pakaiKombinasi && opsiHotel.mekkah.length > 0 && !idxValid(opsiHotel.mekkah, hotel_mekkah_opsi_idx)) {
      return Response.json({ error: 'Pilihan hotel Mekkah wajib diisi' }, { status: 400 });
    }
    if (!pakaiKombinasi && opsiHotel.madinah.length > 0 && !idxValid(opsiHotel.madinah, hotel_madinah_opsi_idx)) {
      return Response.json({ error: 'Pilihan hotel Madinah wajib diisi' }, { status: 400 });
    }
    // Kombinasi (kamar campuran): Bintang Mekkah & Bintang Madinah dipilih
    // INDEPENDEN per baris (bukan 1 "Paket" buat 2 kota lagi — dikonfirmasi
    // user 2026-08-18), narik dari daftar GABUNGAN semua bintang (lihat
    // hotelOpsiGabunganUntukTemplate). WAJIB dipilih per baris kalau
    // template nawarin opsi buat kota itu — beda dari sebelumnya (opsional
    // dengan fallback ke rate default paket), sekarang gak ada lagi "rate
    // default" buat difallback-in karena paket udah gak dipakai sama sekali
    // di jalur ini.
    const opsiHotelGabungan = pakaiKombinasi ? hotelOpsiGabunganUntukTemplate(t.config_json) : { mekkah: [], madinah: [] };
    if (pakaiKombinasi) {
      for (const k of kombinasi) {
        if (opsiHotelGabungan.mekkah.length > 0 && !idxValid(opsiHotelGabungan.mekkah, k.hotel_mekkah_idx)) {
          return Response.json({ error: 'Pilih Bintang/Hotel Mekkah di setiap baris kombinasi dulu.' }, { status: 400 });
        }
        if (opsiHotelGabungan.madinah.length > 0 && !idxValid(opsiHotelGabungan.madinah, k.hotel_madinah_idx)) {
          return Response.json({ error: 'Pilih Bintang/Hotel Madinah di setiap baris kombinasi dulu.' }, { status: 400 });
        }
      }
    }

    // Durasi Umroh pilihan (mis. 9/12 Hari, lihat durasiOpsiUntukTemplate) —
    // WAJIB dipilih dari daftar admin kalau template ini nawarin opsi durasi,
    // gak boleh diketik bebas (biar HPP tetap match sama basis hitung item
    // "/Day" yang admin siapkan buat tiap opsi). Dicek DULUAN sebelum Malam
    // di bawah — kalau opsi ini punya `malam` (total malam gabungan), itu
    // jadi BATAS yang ngunci total Malam Mekkah+Madinah, gak boleh beda.
    const durasiOpsi = durasiOpsiUntukTemplate(t.config_json);
    if (durasiOpsi.length > 0 && !durasiOpsi.some(d => d.hari === Number(durasi_dipilih))) {
      return Response.json({ error: `Durasi wajib dipilih: ${durasiOpsi.map(d => d.hari).join(' / ')} Hari` }, { status: 400 });
    }
    const durasiTerpilih = durasiOpsi.find(d => d.hari === Number(durasi_dipilih)) || null;

    // Malam Mekkah/Madinah — Fix = ikut itinerary tetap template (input
    // pengunjung DIABAIKAN, gak divalidasi), Dinamis = bebas diisi
    // pengunjung dalam batas wajar (perilaku sebelum toggle ini ada) — TAPI
    // kalau durasi terpilih punya total malam terkunci, jumlahnya WAJIB
    // pas segitu (client seharusnya udah auto-split, ini jaring pengaman
    // server-side kalau ada yang bypass/modif request mentah), Tidak Ada =
    // Program Wisata murni (gak ada leg Mekkah/Madinah sama sekali,
    // itinerary 100% dari modul negara) — 0/0, gak divalidasi.
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

    // Hari mutawwif — cuma relevan kalau template ini nawarin mutawwif sama
    // sekali. Fix = ikut itinerary tetap (input pengunjung diabaikan),
    // Dinamis = bebas dipilih pengunjung, gak boleh lebih lama dari total
    // HARI trip (bukan malam — mutawwif kerja dari hari kedatangan sampai
    // kepulangan, TERMASUK hari city-to-city/berangkat-pulang yang gak
    // nginep, jadi total hari SELALU 1 lebih banyak dari total malam,
    // dikonfirmasi user 2026-08-18 "mutawwif dihitung total hari bukan
    // total malam"). totalHariProgram sama persis logic klien (lihat
    // kalkulator/[template_id]/page.jsx#totalHariProgram) — durasi yang
    // beneran dipilih kalau ada, fallback malam+1.
    const totalHariProgram = durasiTerpilih?.hari || (malamMekkah + malamMadinah + 1);
    const mutawwifTersedia = mutawwifTersediaUntukTemplate(t.config_json);
    let mutawwifHari = null;
    if (mutawwifTersedia) {
      const mutawwifAturan = mutawwifAturanUntukTemplate(t.config_json);
      if (mutawwifAturan.mode === 'fix') {
        mutawwifHari = mutawwifAturan.fixHari;
      } else {
        // Kosong (gak dikirim) = sepanjang trip, gak kena minimal. Kalau
        // jamaah EKSPLISIT milih sendiri jumlah harinya, minimal 3 hari (1
        // hari penjemputan + 2 hari umroh) — dikonfirmasi user 2026-08-18.
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

    // Jumlah kali Umroh (min 1) — cuma relevan kalau template ini punya leg
    // Umroh sama sekali, divalidasi longgar (integer >= 1) di sini, biaya
    // tambahannya dihitung server-side lewat hitungHppKamar.
    if (jumlah_umroh != null && (!Number.isInteger(Number(jumlah_umroh)) || Number(jumlah_umroh) < 1)) {
      return Response.json({ error: 'Jumlah Umroh minimal 1 kali' }, { status: 400 });
    }

    // Kalkulator ini KHUSUS paket private/custom — jumlah pax yang beneran
    // request trip inilah yang jadi basis pembagi biaya bersama (bukan
    // asumsi rombongan besar kayak program reguler, lihat
    // kalkulatorPublik.js#stateEfektif). Tiap tema (Umroh Berdua/Besties/
    // Bareng Seangkatan dkk) punya aturan beda: Fix = harus PAS sekian
    // orang, Dinamis = bebas (opsional dibatasi min/maks).
    // Kombinasi: total pax = jumlah SEMUA baris digabung (satu rombongan
    // yang sama, cuma beda preferensi kamar/paket per sub-grup — bus/tour
    // guide/dll tetap dipakai bareng, biaya pooled tetap dibagi ke TOTAL
    // pax ini, bukan per-baris, lihat perhitungan hppByPaket di bawah).
    const paxJamaah = pakaiKombinasi
      ? kombinasi.reduce((s, k) => s + (Number(k.jumlah_cowok) || 0) + (Number(k.jumlah_cewek) || 0), 0)
      : (Number(jumlah_cowok) || 0) + (Number(jumlah_cewek) || 0);
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

    // Negara tambahan "Pilihan Publik" (lihat modulPilihanUntukTemplate) —
    // kalau template ini nawarin mode ini, pengunjung WAJIB pilih minimal 1
    // negara dari daftar yang admin izinkan, dan tiap kombinasi hari/hotel
    // star/city tour HARUS resolve ke tier yang beneran ada tarifnya (pakai
    // cariTierModulNegara yang sama dgn yang dipakai admin) — jangan sampai
    // diam-diam kehitung Rp 0 gara-gara kombinasi gak ketemu tier.
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
    const pembulatan = pembulatanTemplate(t.config_json);
    // Bahan stateEfektif yang SAMA buat semua paket (kombinasi ataupun
    // tunggal) — cuma `paket` & opsi hotel yang beda per baris kombinasi.
    const stateBahanBersama = {
      tanggalBerangkat: tanggal_berangkat || null, addonKeysDipilih,
      rute: ruteList.length > 0 ? rute : null,
      malamMekkah, malamMadinah, mutawwifHari, pakaiMutawwifah, paxJamaah, paxTl: pax_tl,
      modulPilihanDipilih, durasiDipilih: durasiOpsi.length > 0 ? durasi_dipilih : null, jumlahUmroh: jumlah_umroh,
      umrohDuluDipilih: umroh_dulu_dipilih,
      transportasiDipilih: transportasi_pilihan, maskapaiDipilih: maskapaiList.length > 0 ? maskapai : null,
      kursSarIdr: pengaturanKurs?.kurs_sar_idr, kursUsdIdr: pengaturanKurs?.kurs_usd_idr,
    };

    // Margin & Komisi FLAT (1 angka, bukan per-paket/bintang lagi) — berlaku
    // buat SEMUA pax_mode (dinamis/pasangan/fix), gak cuma kombinasi kamar
    // campuran — paket Deluxe/Eksekutif/Signature udah gak dipakai buat
    // nentuin margin/komisi di kalkulator publik manapun (dikonfirmasi user
    // 2026-08-18, "disesuaikan miripin sama Umroh Full Customized").
    const marginFlat = marginFlatUntukTemplate(t.config_json);
    const komisiFlat = komisiFlatUntukTemplate(t.config_json);

    let hargaJual, kombinasiHasil = null, rincianSnapshot = null;
    if (pakaiKombinasi) {
      // 1 hitungHppKamar per KOMBINASI UNIK (bintang/hotel Mekkah + Madinah)
      // yang beneran dipakai — bukan per baris mentah, biar baris yang
      // hotelnya SAMA gak dihitung ulang percuma. paxJamaah (pembagi biaya
      // pooled) SELALU total gabungan semua baris, gak pernah per-baris
      // (lihat komentar paxJamaah di atas). Bintang Mekkah & Madinah
      // INDEPENDEN per baris (bukan 1 "Paket" lagi) — Margin & Komisi FLAT,
      // gak per-bintang (dikonfirmasi user 2026-08-18).
      const hppCache = new Map();
      function hppUntuk(mekkahIdx, madinahIdx) {
        const key = `${mekkahIdx ?? ''}::${madinahIdx ?? ''}`;
        if (!hppCache.has(key)) {
          const mekkahOpsi = idxValid(opsiHotelGabungan.mekkah, mekkahIdx) ? opsiHotelGabungan.mekkah[mekkahIdx] : null;
          const madinahOpsi = idxValid(opsiHotelGabungan.madinah, madinahIdx) ? opsiHotelGabungan.madinah[madinahIdx] : null;
          const state = stateEfektif(t.config_json, {
            ...stateBahanBersama, paket: 'deluxe',
            hotelMekkahRate: mekkahOpsi, hotelMadinahRate: madinahOpsi, marginFlat,
          });
          // rincian (rincianHppLengkap) ikut disimpen di sini (BUKAN cuma
          // hpp[kamar]) — item per item TERMASUK hotel/tiket/visa/margin,
          // dasar buat rincian_snapshot super_admin-only di bawah (lihat
          // /api/admin/kalkulator-leads/[id]/rincian), TIDAK PERNAH dikirim
          // balik ke pengunjung (cuma hargaJual final yang masuk response,
          // lihat komentar header file ini).
          hppCache.set(key, { hpp: hitungHppKamar(state, katalogModul), rincian: rincianHppLengkap(state, katalogModul) });
        }
        return hppCache.get(key);
      }
      kombinasiHasil = kombinasi.map(k => {
        const jumlah = (Number(k.jumlah_cowok) || 0) + (Number(k.jumlah_cewek) || 0);
        const { hpp } = hppUntuk(k.hotel_mekkah_idx, k.hotel_madinah_idx);
        const hargaPerOrang = hitungHargaJual(hpp[k.kamar], komisiFlat, pembulatan);
        return {
          kamar: k.kamar,
          jumlah_cowok: Number(k.jumlah_cowok) || 0, jumlah_cewek: Number(k.jumlah_cewek) || 0,
          jumlah_pasangan: Number(k.jumlah_pasangan) || 0,
          hotel_mekkah: opsiHotelGabungan.mekkah[k.hotel_mekkah_idx]?.nama || null,
          hotel_madinah: opsiHotelGabungan.madinah[k.hotel_madinah_idx]?.nama || null,
          bintang_mekkah: opsiHotelGabungan.mekkah[k.hotel_mekkah_idx]?.bintang ?? null,
          bintang_madinah: opsiHotelGabungan.madinah[k.hotel_madinah_idx]?.bintang ?? null,
          jumlah, harga_per_orang: hargaPerOrang, subtotal: hargaPerOrang * jumlah,
        };
      });
      hargaJual = kombinasiHasil.reduce((s, k) => s + k.subtotal, 0);
      rincianSnapshot = {
        mode: 'kombinasi', margin_flat: marginFlat, komisi_flat: komisiFlat, pembulatan,
        baris: kombinasi.map((k, i) => {
          const { hpp, rincian } = hppUntuk(k.hotel_mekkah_idx, k.hotel_madinah_idx);
          return { ...kombinasiHasil[i], hpp, rincian };
        }),
        total: hargaJual,
      };
    } else {
      const state = stateEfektif(t.config_json, {
        ...stateBahanBersama, paket,
        hotelMekkahOpsiIdx: opsiHotel.mekkah.length > 0 ? hotel_mekkah_opsi_idx : null,
        hotelMadinahOpsiIdx: opsiHotel.madinah.length > 0 ? hotel_madinah_opsi_idx : null,
        marginFlat,
      });
      const hpp = hitungHppKamar(state, katalogModul);
      hargaJual = hitungHargaJual(hpp[kamar], komisiFlat, pembulatan);
      rincianSnapshot = {
        mode: 'tunggal', margin_flat: marginFlat, komisi_flat: komisiFlat, pembulatan,
        kamar, hpp,
        harga_jual: Object.fromEntries(KAMAR_LIST.map(k => [k, hitungHargaJual(hpp[k], komisiFlat, pembulatan)])),
        rincian: rincianHppLengkap(state, katalogModul),
        total: hargaJual,
      };
    }

    // addon_config nyimpen SEMUA pilihan pengunjung (bukan cuma add-on lagi)
    // — dipakai admin follow-up di /admin/kalkulator-leads, biar tau persis
    // apa yang diminati, TANPA perlu migrasi schema (kolom JSON udah ada).
    const pilihanConfig = {
      addon_keys: addonKeysDipilih,
      rute: ruteList.length > 0 ? rute : null,
      hotel_mekkah: opsiHotel.mekkah[hotel_mekkah_opsi_idx]?.nama || null,
      hotel_madinah: opsiHotel.madinah[hotel_madinah_opsi_idx]?.nama || null,
      malam_mekkah: malamMekkah, malam_madinah: malamMadinah,
      mutawwif_hari: mutawwifHari,
      pakai_mutawwifah: pakaiMutawwifah ?? null,
      pax_tl: pax_tl != null ? Number(pax_tl) || 0 : 0,
      jumlah_cowok: pakaiKombinasi ? null : (jumlah_cowok != null ? Number(jumlah_cowok) || 0 : null),
      jumlah_cewek: pakaiKombinasi ? null : (jumlah_cewek != null ? Number(jumlah_cewek) || 0 : null),
      // Rincian per baris (paket/kamar/jumlah/harga) — WAJIB ada begitu mode
      // kombinasi, itu satu-satunya tempat admin bisa lihat komposisi
      // sebenarnya (kolom paket/kamar di kalkulator_lead cuma "campuran").
      kombinasi: kombinasiHasil,
      modul_pilihan: modulPilihanDipilih ? modulPilihanDipilih.map(m => ({
        nama: katalogModul.find(km => String(km.id) === String(m.modul_negara_id))?.nama || null,
        hari: m.hari, hotel_star: m.hotel_star ?? null, city_tour_opsi: m.city_tour_opsi ?? null,
      })) : null,
      transportasi_pilihan: transportasi_pilihan || null,
      maskapai: maskapaiList.length > 0 ? maskapai : null,
    };

    const [hasil] = await pool.query(
      `INSERT INTO kalkulator_lead (user_id, template_id, paket, kamar, tanggal_berangkat, addon_config, rincian_snapshot, harga_jual, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'estimasi')`,
      [auth.user.id, template_id, pakaiKombinasi ? 'campuran' : paket, pakaiKombinasi ? 'campuran' : kamar, tanggal_berangkat || null, JSON.stringify(pilihanConfig), JSON.stringify(rincianSnapshot), hargaJual]
    );

    // Itinerary hasil akhir — day-by-day sesuai negara+hari yang dipilih
    // (kalau mode "Pilihan Publik") DAN/ATAU label Mekkah/Madinah sesuai
    // malam & urutan yang beneran dipilih pengunjung (beda dari preview di
    // GET /template yang masih pakai malam DEFAULT template).
    const itinerary = itineraryUntukTemplate(t.config_json, katalogModul, modulPilihanDipilih, katalogJenisProgram, { malamMekkah, malamMadinah, urutanDipilih: urutan_dipilih, umrohDuluDipilih: umroh_dulu_dipilih, tanggalBerangkat: tanggal_berangkat || null });

    return Response.json({ lead_id: hasil.insertId, harga_jual: hargaJual, itinerary, kombinasi: kombinasiHasil });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
