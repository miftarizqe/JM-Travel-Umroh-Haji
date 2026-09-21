'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import DaftarEditor from '@/app/components/DaftarEditor';
import { KOSONG_BREAKDOWN, hitungHppKamar, modulTambahanArray, KAPASITAS_KAMAR, bulatkanKeAtas } from '@/app/components/KalkulatorBiaya';
import KalkulatorTerpadu from '@/app/components/KalkulatorTerpadu';
import { kamarKeyOf } from '@/app/components/CartPaketKamar';
import { resolveJamaahHarga } from '@/lib/jamaahHarga';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad (4/kamar)', triple: 'Triple (3/kamar)', double: 'Double (2/kamar)' };
// `type` (label kategori buat tampilan publik, "Umroh · 9 Hari" dkk di kartu
// program) diturunin otomatis dari Jenis Program — cuma 1 field yang admin
// pilih (Jenis Program), gak ada 2 dropdown yang isinya tumpang tindih lagi.
// Dulu hardcode TYPE_DARI_JENIS_PROGRAM di sini, sekarang field
// `tipe_program` di jenis_program_master (lihat jenisProgramList state).

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Hitung label tanggal untuk Hari ke-(idx) dihitung dari tanggal_berangkat.
// idx 0 = hari pertama. Return "" jika tanggal_berangkat kosong/invalid.
function labelHari(tglBerangkat, idx) {
  if (!tglBerangkat) return '';
  const base = new Date(tglBerangkat + 'T00:00:00');
  if (isNaN(base.getTime())) return '';
  const d = new Date(base);
  d.setDate(d.getDate() + idx);
  return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// Draft otomatis (localStorage) — form ini paling berat (30+ field), jadi
// keluar tanpa klik Simpan gak bikin ilang, tinggal dibuka lagi nanti.
function draftKeyFor(id) {
  return id ? `draft_admin_program_${id}` : 'draft_admin_program_new';
}

function emptyProgram() {
  const p = {
    name: '', type: 'Umroh', jenis_program: '', durasi: 9, tanggal: '', tanggal_berangkat: '', total_seat: 20,
    dp: 5000000, highlight: '', publish_type: 'public', active: true,
    // Rekomendasi default (dikonfirmasi user 2026-09-06, bisa diedit) buat
    // program baru publish_type='public' — nominal Sahabat Baitullah
    // closing-in jamaah lain ke program ini, lihat section Costing di bawah.
    sahabat_closing_langsung_hop_nominal: 2000000, sahabat_closing_nominal_closer: 1000000,
    include_items: '', exclude_items: '', itinerary: [],
    manasik_tanggal: '', manasik_lokasi: '', manasik_catatan: '',
    perw_ids: [], private_ids: [],
  };
  for (const paket of PAKET) for (const kamar of KAMAR) {
    p[`harga_${paket}_${kamar}`] = 0;
    p[`hpp_${paket}_${kamar}`] = 0;
    p[`ujroh_${paket}_${kamar}`] = 0;
  }
  // Ujroh mulai dari 0 (sama kayak HPP) — TIDAK ada default "pintar" yang
  // diam-diam sudah termasuk angka lain. Ujroh = margin per jamaah persis apa
  // yang diketik admin, titik.
  p.kategori = 'group_resmi';
  return p;
}

export default function ProgramsPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [tabProgram, setTabProgram] = useState('detail'); // 'detail' | 'realisasi' — lihat RealisasiCosting
  const [saving, setSaving] = useState(false);
  const [opsiTambahanBaru, setOpsiTambahanBaru] = useState([]); // staging lokal Opsi Tambahan buat Program yang belum pernah disimpan

  // Filter kategori publikasi (tab di atas daftar) — filter list ke kategori
  // itu aja + jadi default pas bikin program baru dari sini. `?publish_type=`
  // di URL (link lama/bookmark) tetap dibaca sebagai nilai awal. Dibaca dari
  // window.location langsung (bukan useSearchParams) biar gak perlu bungkus
  // Suspense buat halaman sebesar ini.
  const [filterPublishType, setFilterPublishType] = useState(null);
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search).get('publish_type');
    if (qp) setFilterPublishType(qp);
  }, []);
  const visiblePrograms = filterPublishType ? programs.filter(p => p.publish_type === filterPublishType) : programs;

  // Entry point dari tombol "Buat Program Eksklusif dari Quote Ini" di halaman
  // detail Ajuan Kalkulator Perwakilan (?from_lead=<id>) — buka langsung form
  // Program Baru dengan publish_type/perw_ids/HPP/Ujroh diprefill dari quote
  // yang sudah disetujui admin, biar gak diketik ulang manual (dikonfirmasi
  // user 2026-09-03). Otorisasi checkout eksklusif TETAP lewat sinkronPerwIds
  // di server begitu program ini disimpan (sama seperti isi perw_ids manual).
  const [fromLeadId, setFromLeadId] = useState(null);
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search).get('from_lead');
    if (qp) setFromLeadId(qp);
  }, []);
  useEffect(() => {
    if (!fromLeadId || !user) return;
    fetch(`/api/admin/kalkulator-perwakilan?id=${fromLeadId}`).then(r => r.json()).then(d => {
      const lead = d.lead;
      if (!lead) { alert('Quote tidak ditemukan.'); return; }
      const base = emptyProgram();
      base.name = lead.nama_quote || `Quote ${lead.template_nama || ''}`.trim();
      base.tanggal_berangkat = lead.tanggal_berangkat ? String(lead.tanggal_berangkat).slice(0, 10) : '';
      base.publish_type = 'perwakilan';
      base.perw_ids = [lead.perwakilan_id];
      base.from_lead_id = lead.id;
      base[`hpp_${lead.paket}_${lead.kamar}`] = Number(lead.hpp_snapshot) || 0;
      base[`ujroh_${lead.paket}_${lead.kamar}`] = Number(lead.margin_perwakilan) || 0;
      setEditing(base);
      setHargaDataMap({}); perwFetchedRef.current = new Set(); fetchPerwList();
      resetKalkulator();
      setTabProgram('detail');
    }).catch(() => alert('Gagal memuat quote.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLeadId, user]);

  // Entry point dari tombol "Buat Program Eksklusif dari Target Ini" di
  // Database Jamaah Sahabat Baitullah (?from_sahabat=<user_id>) — mirror
  // fromLeadId di atas, bedanya sahabat_pendaftaran gak punya snapshot
  // HPP/margin (target cuma perkiraan bebas), jadi harga TETAP diisi
  // manual oleh admin, cuma nama/publish_type/whitelist yang diprefill
  // (dikonfirmasi user 2026-09-19). Otorisasi checkout tetap lewat
  // program_private_akun di server begitu program ini disimpan.
  const [fromSahabatId, setFromSahabatId] = useState(null);
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search).get('from_sahabat');
    if (qp) setFromSahabatId(qp);
  }, []);
  useEffect(() => {
    if (!fromSahabatId || !user) return;
    fetch(`/api/admin/sahabat/database?user_id=${fromSahabatId}`).then(r => r.json()).then(d => {
      const jamaah = (d.jamaah || [])[0];
      if (!jamaah) { alert('Data jamaah tidak ditemukan.'); return; }
      const base = emptyProgram();
      base.name = jamaah.target_minat || `Program Eksklusif — ${jamaah.nama}`;
      base.publish_type = 'private';
      base.private_ids = [fromSahabatId];
      base.from_sahabat_id = fromSahabatId;
      setEditing(base);
      setHargaDataMap({}); perwFetchedRef.current = new Set(); fetchPerwList();
      resetKalkulator();
      setTabProgram('detail');
    }).catch(() => alert('Gagal memuat data jamaah.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSahabatId, user]);

  // Harga reseller perwakilan — OTOMATIS dimuat buat SEMUA perwakilan yang
  // dicentang di "Perwakilan yang Diotorisasi" (bukan pilih 1 dari dropdown
  // lagi), upline (kalau ada) sudah ketauan begitu data dimuat. Semua keyed
  // by perw_id biar bisa nampilin banyak sekaligus.
  const [perwList, setPerwList] = useState([]);
  // Akun jamaah yang ditunjuk admin buat program 'private' (dikonfirmasi
  // user 2026-09-06) — mirror perwList di atas, bedanya role=jamaah.
  const [privateJamaahList, setPrivateJamaahList] = useState([]);
  const [cariPrivateJamaah, setCariPrivateJamaah] = useState('');
  const [hargaDataMap, setHargaDataMap] = useState({}); // { [perwId]: hargaData }
  const [formsMap, setFormsMap] = useState({}); // { [perwId]: { upline: {...}, perwakilan: {...} } }
  const [savingHargaIds, setSavingHargaIds] = useState(() => new Set());
  const perwFetchedRef = useRef(new Set()); // dedup guard buat auto-fetch harga, bukan state (lihat muatHargaPerw)

  // Kalkulator biaya (HPP dari komponen, bukan angka jadi) — 1 kalkulator
  // terpadu buat ketiga paket sekaligus (Bintang 3/4/5 = Deluxe/Eksekutif/
  // Signature), karena Pax/Kurs/Trigger/Item Master itu SATU nilai yang sama
  // buat seluruh program — cuma Hotel & Komisi yang beda per bintang.
  // kalkulatorAktif/kalkulatorState/kalkulatorBreakdownId tetap per-paket
  // (dipakai buat nulis hpp_{paket}_{kamar} & buat 3 row biaya_breakdown pas
  // simpan) — hasil FAN-OUT dari kalkulatorShared+kalkulatorHotel di bawah,
  // lihat sinkronKalkulator().
  const [kalkulatorAktif, setKalkulatorAktif] = useState({}); // { [paket]: boolean }
  const [kalkulatorState, setKalkulatorState] = useState({}); // { [paket]: shape KOSONG_BREAKDOWN }
  const [kalkulatorBreakdownId, setKalkulatorBreakdownId] = useState({}); // { [paket]: id breakdown tersimpan | null }
  const [templateList, setTemplateList] = useState([]);

  const KALKULATOR_HOTEL_KOSONG = { mekkah_nama: '', mekkah_rate_double: '', mekkah_rate_triple: '', mekkah_rate_quad: '', mekkah_mata_uang: 'SAR', madinah_nama: '', madinah_rate_double: '', madinah_rate_triple: '', madinah_rate_quad: '', madinah_mata_uang: 'SAR' };
  const [kalkulatorShared, setKalkulatorShared] = useState({
    ...KOSONG_BREAKDOWN,
    total_hari_program: '', manasik_umroh: '', perlengkapan_jamaah: '', haramain_express: '0', handling_jeddah: '',
    city_tour_mekkah: '', city_tour_madinah: '', city_tour_thaif: '', transportasi_pilihan: null,
  });
  const [kalkulatorHotel, setKalkulatorHotel] = useState({ deluxe: { ...KALKULATOR_HOTEL_KOSONG }, eksekutif: { ...KALKULATOR_HOTEL_KOSONG }, signature: { ...KALKULATOR_HOTEL_KOSONG } });
  const [kalkulatorMalam, setKalkulatorMalam] = useState({ mekkah: '', madinah: '' });
  const [kalkulatorKomisi, setKalkulatorKomisi] = useState({ deluxe: '', eksekutif: '', signature: '' });
  const [kalkulatorMargin, setKalkulatorMargin] = useState({ deluxe: '', eksekutif: '', signature: '' });
  const [katalogModul, setKatalogModul] = useState([]); // modul negara LIVE (dari katalog terkini) — dipakai buat Program BARU (belum ada id) & sumber pas "Sinkronkan"
  const [jenisProgramList, setJenisProgramList] = useState([]); // jenis_program_master — dulu hardcode JENIS_PROGRAM_LIST
  // Fotokopi modul negara yang dibekukan pas Program ini PERTAMA KALI
  // disimpan (lihat migration-program-katalog-modul-snapshot.sql) — dipakai
  // GANTI katalogModul pas ngedit Program yang UDAH ADA id-nya, biar HPP-nya
  // gak ikut geser walaupun harga modul di katalog berubah/dihapus belakangan.
  // null = Program baru, atau Program lama yg belum pernah ke-snapshot
  // (fallback ke katalogModul live sampai admin nyimpen ulang / sinkron).
  const [katalogModulSnapshot, setKatalogModulSnapshot] = useState(null);
  // KalkulatorTerpadu gak pernah unmount sendiri di halaman ini (togglenya
  // cuma internal), jadi auto-seed item baseline di dalamnya cuma jalan
  // sekali per page load kalau gak dipaksa remount — key ini naik tiap
  // resetKalkulator() biar tiap "Program Baru"/edit program lain beneran
  // dapet kalkulator yang fresh (termasuk auto-seed-nya).
  const [kalkulatorResetKey, setKalkulatorResetKey] = useState(0);

  // Fan-out: tiap kali sumber input terpadu berubah, bangun ulang
  // kalkulatorState[paket] (shared fields + hotel/margin/komisi spesifik
  // bintang itu) lewat onUbahKalkulator yang sudah ada — hitungHppKamar &
  // cara nulis hpp_{paket}_{kamar} TIDAK berubah sama sekali.
  useEffect(() => {
    if (!kalkulatorAktif.deluxe && !kalkulatorAktif.eksekutif && !kalkulatorAktif.signature) return;
    // Pax Jamaah >= 15 wajib Bus (aturan operasional) — override apapun yang
    // sempat kepilih pas pax-nya masih di bawah 15.
    const transportasiEfektif = (Number(kalkulatorShared.pax_jamaah) || 0) >= 15 ? 'bus' : kalkulatorShared.transportasi_pilihan;
    for (const paket of PAKET) {
      const h = kalkulatorHotel[paket];
      onUbahKalkulator(paket, {
        ...kalkulatorShared, paket, transportasi_pilihan: transportasiEfektif,
        hotel_mekkah_nama: h.mekkah_nama, hotel_mekkah_rate_double: h.mekkah_rate_double, hotel_mekkah_rate_triple: h.mekkah_rate_triple, hotel_mekkah_rate_quad: h.mekkah_rate_quad, hotel_mekkah_malam: kalkulatorMalam.mekkah, hotel_mekkah_mata_uang: h.mekkah_mata_uang,
        hotel_madinah_nama: h.madinah_nama, hotel_madinah_rate_double: h.madinah_rate_double, hotel_madinah_rate_triple: h.madinah_rate_triple, hotel_madinah_rate_quad: h.madinah_rate_quad, hotel_madinah_malam: kalkulatorMalam.madinah, hotel_madinah_mata_uang: h.madinah_mata_uang,
        hotel_list: kalkulatorShared.hotel_mode === 'mix' ? kalkulatorShared.hotel_list : null,
        komisi_rate: kalkulatorKomisi[paket], margin_rate: kalkulatorMargin[paket],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kalkulatorShared, kalkulatorHotel, kalkulatorMalam, kalkulatorKomisi, kalkulatorMargin, kalkulatorAktif]);

  useEffect(() => {
    if (user?.role !== 'super_admin') return;
    fetch('/api/admin/biaya-breakdown?is_template=1').then(r => r.json())
      .then(d => setTemplateList(d.breakdown || [])).catch(() => {});
    fetch('/api/admin/modul-negara?full=1').then(r => r.json())
      .then(d => setKatalogModul(d.modul || [])).catch(() => {});
    fetch('/api/admin/jenis-program').then(r => r.json())
      .then(d => setJenisProgramList(d.jenis_program || [])).catch(() => {});
  }, [user]);

  function resetKalkulator() {
    setKalkulatorResetKey(k => k + 1);
    setKalkulatorAktif({}); setKalkulatorState({}); setKalkulatorBreakdownId({});
    setKalkulatorShared({
      ...KOSONG_BREAKDOWN,
      total_hari_program: '', manasik_umroh: '', perlengkapan_jamaah: '', haramain_express: '0', handling_jeddah: '',
    city_tour_mekkah: '', city_tour_madinah: '', city_tour_thaif: '', transportasi_pilihan: null,
    });
    setKalkulatorHotel({ deluxe: { ...KALKULATOR_HOTEL_KOSONG }, eksekutif: { ...KALKULATOR_HOTEL_KOSONG }, signature: { ...KALKULATOR_HOTEL_KOSONG } });
    setKalkulatorMalam({ mekkah: '', madinah: '' });
    setKalkulatorKomisi({ deluxe: '', eksekutif: '', signature: '' });
    setKalkulatorMargin({ deluxe: '', eksekutif: '', signature: '' });
    setKatalogModulSnapshot(null);
  }

  // Ambil entri katalogModulLive yang id-nya kepakai di modulTambahan —
  // dipakai buat "bekukan" fotokopi katalog modul negara pas Program pertama
  // kali disimpan / pas admin klik "Sinkronkan ke Harga Terbaru".
  function buildKatalogModulSnapshot(modulTambahan, katalogModulLive) {
    const ids = new Set((modulTambahan || []).map(e => Number(e.modul_negara_id)).filter(Boolean));
    return katalogModulLive.filter(m => ids.has(Number(m.id)));
  }

  // Ujroh = Komisi di kalkulator — SATU konsep yang sama (margin per
  // paket, 1 nilai berlaku ke semua tipe kamar), gak perlu diketik dobel di
  // 2 tempat. Harga Publikasi = "Jual" hasil kalkulator (HPP+Komisi,
  // dibulatkan) DIHITUNG LANGSUNG di sini biar PERSIS sama kayak yang
  // kelihatan di tabel ringkasan kalkulator (bukan dibulatkan ulang dari HPP
  // yang udah dibulatkan duluan — itu bisa beda angka gara-gara urutan
  // pembulatan). HPP yang tersimpan = Harga Publikasi − Ujroh, biar rumus
  // lama (harga = hpp + ujroh) tetap konsisten dipakai di simpan()/buildPayload().
  //
  // TAPI ini CUMA berlaku buat skema Publik — skema Perwakilan gak
  // punya konsep "Ujroh" sama sekali (markup-nya diatur per perwakilan
  // sendiri2 di "Harga Jual per Perwakilan" di bawah). Kalau publish_type
  // perwakilan, HPP Kantor harus angka MENTAH (dibulatkan doang, gak
  // dikurangi Komisi) — kalau ikut ngurangin, HPP Kantor (dasar perhitungan
  // SEMUA harga perwakilan) diam2 salah tiap kali field Komisi di kalkulator
  // kebetulan keisi (mis. sisa dari template).
  function onUbahKalkulator(paket, value) {
    setKalkulatorState(prev => ({ ...prev, [paket]: value }));
    // katalogModulUntukKalkulator (bukan katalogModul live) — biar Program
    // yang udah kekunci snapshot-nya gak ikut ngitung pakai harga modul
    // negara terbaru cuma gara-gara fan-out effect ini jalan ulang.
    const hpp = hitungHppKamar(value, katalogModulUntukKalkulator);
    const pembulatan = Number(value.pembulatan) || 0;
    if (editing?.publish_type === 'perwakilan') {
      for (const kamar of KAMAR) setNum(`hpp_${paket}_${kamar}`, String(bulatkanKeAtas(hpp[kamar] || 0, pembulatan)));
      return;
    }
    const ujroh = Number(value.komisi_rate) || 0;
    for (const kamar of KAMAR) {
      const hargaPublikasi = bulatkanKeAtas((hpp[kamar] || 0) + ujroh, pembulatan);
      setNum(`hpp_${paket}_${kamar}`, String(hargaPublikasi - ujroh));
      setNum(`ujroh_${paket}_${kamar}`, String(ujroh));
    }
  }

  // Template = satu-satunya sumber HPP (Pax/Kurs/Trigger/Tiket/Item Master/
  // Hotel/Margin/Komisi SEMUA diambil apa adanya dari template, persis kayak
  // bukaTemplate() di hub Program Kalkulator Biaya) — gak ada yang diedit
  // ulang manual di form Program, sesuai keputusan user 2026-07-27: HPP
  // basicnya sama semua, yang beda per program cuma Ujroh (diisi
  // terpisah di "Detail Harga" di bawah).
  async function pakaiTemplate(templateGroup) {
    if (!templateGroup) return;
    const res = await fetch(`/api/admin/biaya-breakdown?template_group=${templateGroup}`);
    const d = await res.json();
    if (!res.ok || !d.breakdown?.length) { alert(d.error || 'Gagal memuat template'); return; }

    const hotel = { deluxe: { ...KALKULATOR_HOTEL_KOSONG }, eksekutif: { ...KALKULATOR_HOTEL_KOSONG }, signature: { ...KALKULATOR_HOTEL_KOSONG } };
    const komisi = { deluxe: '', eksekutif: '', signature: '' };
    const margin = { deluxe: '', eksekutif: '', signature: '' };
    let malam = { mekkah: '', madinah: '' };
    let shared = null;
    for (const b of d.breakdown) {
      if (!b.paket) continue;
      hotel[b.paket] = {
        mekkah_nama: b.hotel_mekkah_nama || '', mekkah_rate_double: b.hotel_mekkah_rate_double, mekkah_rate_triple: b.hotel_mekkah_rate_triple, mekkah_rate_quad: b.hotel_mekkah_rate_quad, mekkah_mata_uang: b.hotel_mekkah_mata_uang,
        madinah_nama: b.hotel_madinah_nama || '', madinah_rate_double: b.hotel_madinah_rate_double, madinah_rate_triple: b.hotel_madinah_rate_triple, madinah_rate_quad: b.hotel_madinah_rate_quad, madinah_mata_uang: b.hotel_madinah_mata_uang,
      };
      komisi[b.paket] = b.komisi_rate; margin[b.paket] = b.margin_rate;
      malam = { mekkah: b.hotel_mekkah_malam, madinah: b.hotel_madinah_malam };
      if (!shared) {
        shared = {
          nama: b.nama, paket: '',
          jenis_program: b.jenis_program || 'umroh_regular', modul_tambahan: b.modul_tambahan || {},
          hotel_mode: b.hotel_mode || 'fix', hotel_list: b.hotel_list || [],
          bintang_aktif: b.bintang_aktif || { deluxe: true, eksekutif: true, signature: true },
          pembulatan: Number(b.pembulatan) || 0, umroh_dulu: b.umroh_dulu !== 0 && b.umroh_dulu !== false,
          include_items: b.include_items || '', exclude_items: b.exclude_items || '', itinerary: b.itinerary || [], itinerary_modul: b.itinerary_modul || [],
          pax_jamaah: b.pax_jamaah, pax_tl: b.pax_tl, pax_mutawwif: b.pax_mutawwif, pax_mutawwifah: b.pax_mutawwifah, pax_driver: b.pax_driver,
          total_hari_program: b.total_hari_program, manasik_umroh: b.manasik_umroh,
          perlengkapan_jamaah: b.perlengkapan_jamaah, haramain_express: b.haramain_express, handling_jeddah: b.handling_jeddah,
          city_tour_mekkah: b.city_tour_mekkah, city_tour_madinah: b.city_tour_madinah, city_tour_thaif: b.city_tour_thaif,
          transportasi_pilihan: b.transportasi_pilihan,
          kurs_usd_idr: b.kurs_usd_idr, kurs_sar_idr: b.kurs_sar_idr,
          tiket_pesawat_rate: b.tiket_pesawat_rate, tiket_pesawat_mata_uang: b.tiket_pesawat_mata_uang, tiket_pesawat_list: b.tiket_pesawat_list || [],
          visa_rate: b.visa_rate, visa_mata_uang: b.visa_mata_uang,
          biaya_lain_lain: b.biaya_lain_lain, biaya_lain_lain_mata_uang: b.biaya_lain_lain_mata_uang,
          margin_mode: b.margin_mode || 'flat', margin_persen: b.margin_persen,
          komisi_mode: b.komisi_mode || 'flat', komisi_persen: b.komisi_persen,
          items: [],
        };
      }
    }
    if (!shared) return;

    // Field yang sama-sama ada di Template DAN di Program (Jenis Program,
    // Durasi, Itinerary, Include/Exclude, Hotel Mekkah/Madinah per paket) —
    // dulu cuma masuk ke kalkulator, Program-nya sendiri tetap kosong padahal
    // datanya udah ada di template, jadi admin harus ngetik ulang manual.
    // Sekarang ikut ke-isi otomatis, TETAP bisa diedit lagi kayak biasa di
    // section masing-masing di bawah (cuma Ujroh yang emang harus diisi
    // manual — itu murni milik Program ini, gak ada di template).
    const hotelFields = {};
    for (const paket of PAKET) {
      if (hotel[paket]?.mekkah_nama) hotelFields[`hotel_mekkah_${paket}`] = hotel[paket].mekkah_nama;
      if (hotel[paket]?.madinah_nama) hotelFields[`hotel_madinah_${paket}`] = hotel[paket].madinah_nama;
    }
    // Custom Hotel per Kota — mode margin/komisi persen di-snapshot ke
    // program ini SEKALI di titik "Pakai Template" (sama semangatnya kayak
    // hpp_*/harga_* yang juga snapshot, bukan live-linked ke template).
    // Opsi hotelnya sendiri GAK PERLU di-snapshot terpisah — cukup reuse
    // hotel_mekkah_{paket}/hotel_madinah_{paket} yang udah ke-isi dari
    // hotelFields di atas (lihat src/lib/hotelCustomPricing.js).
    setEditing(prev => ({
      ...prev,
      jenis_program: shared.jenis_program || prev.jenis_program,
      durasi: Number(shared.total_hari_program) || prev.durasi,
      itinerary: Array.isArray(shared.itinerary) && shared.itinerary.length > 0 ? shared.itinerary : prev.itinerary,
      include_items: shared.include_items || prev.include_items,
      exclude_items: shared.exclude_items || prev.exclude_items,
      ...hotelFields,
      margin_mode: shared.margin_mode, margin_persen: shared.margin_persen,
      komisi_mode: shared.komisi_mode, komisi_persen: shared.komisi_persen,
    }));

    const anyId = d.breakdown.find(b => b.paket)?.id;
    const itemD = anyId ? await (await fetch(`/api/admin/biaya-breakdown?id=${anyId}`)).json() : null;
    setKalkulatorShared({
      ...shared,
      items: (itemD?.breakdown?.items || []).map(it => ({ master_item_id: it.master_item_id, kelompok: it.kelompok, nama: it.nama, nominal: it.nominal, mata_uang: it.mata_uang, basis: it.basis, trigger_kunci: it.trigger_kunci, modul_negara_id: it.modul_negara_id })),
    });
    setKalkulatorHotel(hotel); setKalkulatorMalam(malam); setKalkulatorKomisi(komisi); setKalkulatorMargin(margin);
    // Aktifin kalkulator ketiga paket sekaligus begitu template dipilih, biar
    // HPP langsung ke-compute otomatis (fan-out effect) tanpa perlu toggle manual.
    setKalkulatorAktif({ deluxe: true, eksekutif: true, signature: true });
  }

  async function simpanBreakdownProgram(programId) {
    for (const paket of PAKET) {
      if (!kalkulatorAktif[paket]) continue;
      const state = kalkulatorState[paket] || KOSONG_BREAKDOWN;
      const existingId = kalkulatorBreakdownId[paket];
      const payload = { ...state, nama: state.nama || `Program ${paket}`, is_template: 0, program_id: programId, paket };
      try {
        const res = await fetch('/api/admin/biaya-breakdown', {
          method: existingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(existingId ? { ...payload, id: existingId } : payload),
        });
        const d = await res.json();
        if (res.ok && !existingId && d.id) setKalkulatorBreakdownId(prev => ({ ...prev, [paket]: d.id }));
      } catch { /* gak fatal — HPP-nya sendiri udah kesimpen di kolom hpp_*, breakdown ini cuma referensi tambahan */ }
    }
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama (lihat
    // useCurrentUser) — BUKAN berarti belum login. Dependency array kosong
    // sebelumnya bikin effect ini cuma jalan sekali di render pertama itu,
    // jadi ke-redirect ke /login padahal admin beneran udah login (middleware
    // sudah jamin ada sesi valid sebelum /admin/* ini kebuka). Tunggu render
    // berikutnya pas user beneran keisi.
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    // Create/edit program penuh (harga, HPP, hotel, dst) khusus super_admin
    // — admin biasa cuma boleh operasional per-program (cetak dokumen,
    // invoice, dst) lewat tab Programs di /admin, bukan halaman ini.
    if (user.role !== 'super_admin') { router.replace('/admin?tab=programs'); return; }
    loadPrograms();
  }, [user]);

  function loadPrograms() {
    fetch('/api/admin/programs')
      .then(r => r.json())
      .then(d => { setPrograms(d.programs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  function fetchPerwList() {
    fetch('/api/admin/users?role=perwakilan&status=active')
      .then(r => r.json()).then(d => setPerwList(d.users || [])).catch(() => {});
  }

  function fetchPrivateJamaahList() {
    // Gabung role=jamaah + role=sahabat_baitullah (2026-09-19) — Program
    // Eksklusif Sahabat Baitullah reuse mekanisme 'private' yang sama,
    // jadi picker-nya juga perlu nampilin akun sahabat, gak cuma jamaah biasa.
    Promise.all([
      fetch('/api/admin/users?role=jamaah&status=active').then(r => r.json()).catch(() => ({ users: [] })),
      fetch('/api/admin/users?role=sahabat_baitullah&status=active').then(r => r.json()).catch(() => ({ users: [] })),
    ]).then(([a, b]) => setPrivateJamaahList([...(a.users || []), ...(b.users || [])]));
  }

  // Draft dibungkus { editing, formsMap, opsiTambahanBaru } — dulu cuma
  // `editing` doang yang ke-draft, jadi ancang-ancang Harga Jual per
  // Perwakilan & Opsi Tambahan yang belum sempat disimpan ilang kalau
  // browser ke-refresh/nutup sebelum klik "Buat Program"/"Simpan". Tetap
  // dukung format draft LAMA (cuma `editing` polos, gak ada wrapper) buat
  // draft yang udah kesimpen sebelum perubahan ini — dibaca via `draft.editing || draft`.
  function ambilDraft(key, fallbackEditing) {
    const fallback = { editing: fallbackEditing, formsMap: {}, opsiTambahanBaru: [] };
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const draft = JSON.parse(raw);
      const draftEditing = draft.editing || draft;
      // Draft TANPA Nama Program (field wajib pertama, belum sempat diisi
      // sama sekali) bukan draft beneran — cuma sisa form yang kebuka lalu
      // ditinggal tanpa diapa-apain. Buang diem-diem, jangan ditanyain (bikin
      // bingung kalau "ditemukan draft" padahal belum pernah ngetik apa-apa).
      if (!draftEditing?.name?.trim()) { localStorage.removeItem(key); return fallback; }
      if (confirm('Ditemukan draft program yang belum disimpan di perangkat ini. Lanjutkan mengedit draft tersebut?')) {
        return { editing: draftEditing, formsMap: draft.formsMap || {}, opsiTambahanBaru: draft.opsiTambahanBaru || [] };
      }
      localStorage.removeItem(key);
    } catch {}
    return fallback;
  }

  function newProgram() {
    const fallback = filterPublishType ? { ...emptyProgram(), publish_type: filterPublishType } : emptyProgram();
    const draft = ambilDraft(draftKeyFor(null), fallback);
    setEditing(draft.editing);
    setFormsMap(draft.formsMap);
    setOpsiTambahanBaru(draft.opsiTambahanBaru);
    setHargaDataMap({}); perwFetchedRef.current = new Set(); fetchPerwList();
    fetchPrivateJamaahList();
    resetKalkulator();
    setTabProgram('detail');
  }

  function editProgram(p) {
    setTabProgram('detail');
    const merged = { ...emptyProgram(), ...p, active: p.active !== 0 };
    // itinerary dari DB bisa berupa string JSON, array, atau null — normalisasi ke array
    let it = p.itinerary;
    if (typeof it === 'string') { try { it = JSON.parse(it); } catch { it = []; } }
    merged.itinerary = Array.isArray(it) ? it : [];
    // tanggal_berangkat dari DB bisa berupa ISO datetime — ambil bagian tanggalnya saja (YYYY-MM-DD)
    if (p.tanggal_berangkat) {
      merged.tanggal_berangkat = String(p.tanggal_berangkat).slice(0, 10);
    }
    if (p.manasik_tanggal) {
      merged.manasik_tanggal = String(p.manasik_tanggal).slice(0, 10);
    }
    const draft = ambilDraft(draftKeyFor(p.id), merged);
    setEditing(draft.editing);
    setFormsMap(draft.formsMap);
    setOpsiTambahanBaru(draft.opsiTambahanBaru);
    setHargaDataMap({}); perwFetchedRef.current = new Set();
    fetchPerwList();
    fetchPrivateJamaahList();
    // perw_ids/private_ids (daftar yang diotorisasi) gak ikut di list ringkas
    // /api/admin/programs — ambil terpisah dari endpoint ?id= yang nyertain.
    fetch(`/api/admin/programs?id=${p.id}`).then(r => r.json()).then(d => {
      setEditing(prev => (prev && prev.id === p.id
        ? { ...prev, perw_ids: d.program?.perw_ids || [], private_ids: d.program?.private_ids || [] }
        : prev));
    }).catch(() => {});

    resetKalkulator();
    // Fotokopi modul negara yang dibekukan pas Program ini disimpan — kalau
    // null (Program lama dari sebelum fitur ini ada), biarin null dulu,
    // katalogModulUntukKalkulator fallback ke katalog live sampai admin
    // nyimpen ulang (otomatis kebekukan) atau klik Sinkronkan manual. Taruh
    // SESUDAH resetKalkulator() karena itu juga nge-null-in state ini.
    let snap = p.katalog_modul_snapshot;
    if (typeof snap === 'string') { try { snap = JSON.parse(snap); } catch { snap = null; } }
    setKatalogModulSnapshot(Array.isArray(snap) && snap.length > 0 ? snap : null);
    if (user.role !== 'super_admin') return;
    fetch(`/api/admin/biaya-breakdown?program_id=${p.id}`).then(r => r.json()).then(d => {
      const aktif = {}; const ids = {};
      const hotel = { deluxe: { ...KALKULATOR_HOTEL_KOSONG }, eksekutif: { ...KALKULATOR_HOTEL_KOSONG }, signature: { ...KALKULATOR_HOTEL_KOSONG } };
      const komisi = { deluxe: '', eksekutif: '', signature: '' };
      const margin = { deluxe: '', eksekutif: '', signature: '' };
      let malam = null; let shared = null;
      for (const b of d.breakdown || []) {
        if (!b.paket) continue;
        aktif[b.paket] = true; ids[b.paket] = b.id;
        hotel[b.paket] = {
          mekkah_nama: b.hotel_mekkah_nama || '', mekkah_rate_double: b.hotel_mekkah_rate_double, mekkah_rate_triple: b.hotel_mekkah_rate_triple, mekkah_rate_quad: b.hotel_mekkah_rate_quad, mekkah_mata_uang: b.hotel_mekkah_mata_uang,
          madinah_nama: b.hotel_madinah_nama || '', madinah_rate_double: b.hotel_madinah_rate_double, madinah_rate_triple: b.hotel_madinah_rate_triple, madinah_rate_quad: b.hotel_madinah_rate_quad, madinah_mata_uang: b.hotel_madinah_mata_uang,
        };
        komisi[b.paket] = b.komisi_rate; margin[b.paket] = b.margin_rate;
        // Malam & shared fields identik di ketiga row (fan-out pas simpan) — ambil dari row pertama yang ketemu.
        if (!malam) malam = { mekkah: b.hotel_mekkah_malam, madinah: b.hotel_madinah_malam };
        if (!shared) {
          shared = {
            nama: b.nama, paket: '',
            jenis_program: b.jenis_program || 'umroh_regular', modul_tambahan: b.modul_tambahan || {},
            hotel_mode: b.hotel_mode || 'fix', hotel_list: b.hotel_list || [],
          bintang_aktif: b.bintang_aktif || { deluxe: true, eksekutif: true, signature: true },
          pembulatan: Number(b.pembulatan) || 0, umroh_dulu: b.umroh_dulu !== 0 && b.umroh_dulu !== false,
            include_items: b.include_items || '', exclude_items: b.exclude_items || '', itinerary: b.itinerary || [], itinerary_modul: b.itinerary_modul || [],
            pax_jamaah: b.pax_jamaah, pax_tl: b.pax_tl, pax_mutawwif: b.pax_mutawwif, pax_mutawwifah: b.pax_mutawwifah, pax_driver: b.pax_driver,
            total_hari_program: b.total_hari_program, manasik_umroh: b.manasik_umroh,
            perlengkapan_jamaah: b.perlengkapan_jamaah, haramain_express: b.haramain_express, handling_jeddah: b.handling_jeddah,
            city_tour_mekkah: b.city_tour_mekkah, city_tour_madinah: b.city_tour_madinah, city_tour_thaif: b.city_tour_thaif,
            transportasi_pilihan: b.transportasi_pilihan,
            kurs_usd_idr: b.kurs_usd_idr, kurs_sar_idr: b.kurs_sar_idr,
            tiket_pesawat_rate: b.tiket_pesawat_rate, tiket_pesawat_mata_uang: b.tiket_pesawat_mata_uang, tiket_pesawat_list: b.tiket_pesawat_list || [],
            visa_rate: b.visa_rate, visa_mata_uang: b.visa_mata_uang,
            biaya_lain_lain: b.biaya_lain_lain, biaya_lain_lain_mata_uang: b.biaya_lain_lain_mata_uang,
            margin_mode: b.margin_mode || 'flat', margin_persen: b.margin_persen,
            komisi_mode: b.komisi_mode || 'flat', komisi_persen: b.komisi_persen,
            items: [],
          };
        }
      }
      setKalkulatorAktif(aktif); setKalkulatorBreakdownId(ids); setKalkulatorHotel(hotel); setKalkulatorKomisi(komisi); setKalkulatorMargin(margin);
      if (malam) setKalkulatorMalam(malam);
      if (!shared) return;
      // Ambil item breakdown — cukup dari SALAH SATU row karena isinya sama di ketiga row.
      const anyId = Object.values(ids)[0];
      fetch(`/api/admin/biaya-breakdown?id=${anyId}`).then(r => r.json()).then(dd => {
        const items = (dd.breakdown?.items || []).map(it => ({ master_item_id: it.master_item_id, kelompok: it.kelompok, nama: it.nama, nominal: it.nominal, mata_uang: it.mata_uang, basis: it.basis, trigger_kunci: it.trigger_kunci, modul_negara_id: it.modul_negara_id }));
        setKalkulatorShared({ ...shared, items });
      }).catch(() => setKalkulatorShared(shared));
    }).catch(() => {});
  }

  // Simpan draft tiap ada perubahan, selama editor lagi kebuka — TAPI cuma
  // kalau Nama Program udah keisi (lihat ambilDraft()), biar buka form terus
  // ditinggal kosong gak ninggalin draft "hantu" yang nanti nanya-nanya pas
  // dibuka lagi padahal isinya kosong melompong. formsMap (ancang-ancang
  // Harga Jual per Perwakilan) & opsiTambahanBaru ikut ke-draft juga, biar
  // gak ilang kalau browser ke-refresh sebelum sempat disimpan beneran.
  useEffect(() => {
    if (!editing) return;
    if (!editing.name?.trim()) { try { localStorage.removeItem(draftKeyFor(editing.id)); } catch {} return; }
    try { localStorage.setItem(draftKeyFor(editing.id), JSON.stringify({ editing, formsMap, opsiTambahanBaru })); } catch {}
  }, [editing, formsMap, opsiTambahanBaru]);

  // Form-nya kerja pakai UJROH (selisih), bukan harga absolut — dikonversi
  // ke/dari harga absolut pas ambil/simpan data, biar konsisten sama gaya
  // input "Ujroh" di skema publik. Dimuat OTOMATIS per perwakilan yang
  // dicentang (lihat useEffect di bawah) — upline (kalau ada) sudah ketauan
  // begitu data ini dimuat, gak perlu admin pilih manual dari dropdown.
  // perwFetchedRef = dedup guard (ref, bukan state) biar setState-nya cuma
  // kejadian di dalam callback .then/.catch, bukan sinkron di badan effect.
  function muatHargaPerw(perwId, progId) {
    fetch(`/api/admin/harga-perwakilan?perw_id=${perwId}&prog_id=${progId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          // Dulu di-skip diem2 tanpa nge-lepas dedup guard — macet permanen di
          // "Memuat harga..." (gak pernah dicoba ulang, errornya juga gak
          // kelihatan). Sekarang errornya ditampilin & boleh dicoba ulang.
          perwFetchedRef.current.delete(perwId);
          setHargaDataMap(prev => ({ ...prev, [perwId]: { error: d.error } }));
          return;
        }
        setHargaDataMap(prev => ({ ...prev, [perwId]: d }));
        const uplineDelta = {};
        const perwDelta = {};
        for (const paket of PAKET) for (const kamar of KAMAR) {
          const key = `${paket}_${kamar}`;
          const hppKantor = Number(d.hpp_kantor?.[key] || 0);
          const uplineAbs = Number(d.harga_upline?.[key] || 0);
          uplineDelta[key] = uplineAbs > 0 ? uplineAbs - hppKantor : 0;
          const hppEfektif = d.upline ? (uplineAbs > 0 ? uplineAbs : hppKantor) : hppKantor;
          const perwAbs = Number(d.harga_perwakilan?.[key] || 0);
          perwDelta[key] = perwAbs > 0 ? perwAbs - hppEfektif : 0;
        }
        setFormsMap(prev => ({ ...prev, [perwId]: { upline: uplineDelta, perwakilan: perwDelta } }));
      })
      .catch(() => { perwFetchedRef.current.delete(perwId); }); // gagal -> boleh dicoba ulang efek berikutnya
  }

  // Program BELUM disimpan (belum ada id) — gak bisa GET dari server (butuh
  // prog_id beneran), tapi admin masih bisa liat ANCANG-ANCANG & mulai isi
  // Ujroh Upline/Perwakilan duluan. Upline (kalau ada) udah ketauan dari
  // perwList (join perekrut_id, gak perlu prog_id) — harga_upline/perwakilan
  // yang tersimpan sebelumnya emang belum ada apa2nya buat program baru,
  // jadi cukup mulai dari HPP polos (delta 0). Begitu Program disimpan,
  // formsMap yang udah keisi di sini ikut disubmit bareng (lihat simpan()).
  function seedHargaPerwLokal(perwId) {
    const p = perwList.find(x => x.id === perwId);
    const upline = p?.perekrut_id ? { id: p.perekrut_id, name: p.perekrut_nama || 'Upline' } : null;
    setHargaDataMap(prev => (prev[perwId] ? prev : { ...prev, [perwId]: { upline, harga_upline: null, harga_perwakilan: null } }));
    setFormsMap(prev => ({ ...prev, [perwId]: prev[perwId] || { upline: {}, perwakilan: {} } }));
  }

  // Begitu program punya id & ada perwakilan yang dicentang, tarik harga
  // masing-masing perwakilan itu otomatis — gak perlu lagi pilih 1-1 dari
  // dropdown, upline langsung ketauan dari data yang dimuat. Program yang
  // BELUM ada id-nya (masih "Program Baru") pakai seed lokal dulu (lihat
  // seedHargaPerwLokal) — perwFetchedRef CUMA dipakai buat dedup fetch
  // SERVER (yang perlu id), bukan buat seed lokal (murah, aman diulang).
  useEffect(() => {
    if (editing?.publish_type !== 'perwakilan') return;
    for (const perwId of editing.perw_ids || []) {
      if (editing.id) {
        if (perwFetchedRef.current.has(perwId)) continue;
        perwFetchedRef.current.add(perwId);
        muatHargaPerw(perwId, editing.id);
      } else {
        seedHargaPerwLokal(perwId);
      }
    }
  }, [editing?.publish_type, editing?.id, editing?.perw_ids, perwList]);

  // progIdOverride dipakai SEKALI doang — pas Program baru pertama kali
  // disimpan (lihat simpan()), editing.id di closure ini MASIH nilai lama
  // (belum ke-update ke id yang baru dibikin) karena setEditing belum
  // sempat re-render, jadi id-nya harus dioper eksplisit. Sesudah sukses,
  // dedup guard perwFetchedRef DILEPAS (bukan langsung muatHargaPerw pakai
  // id lama) — biar useEffect abis ini re-fetch pakai editing.id yg beneran.
  // formsOverride dipakai pas panggil ini SEKALIAN abis setFormsMap di
  // fungsi lain (mis. samakanSemuaHargaPerw) — setFormsMap gak langsung
  // sinkron di render yang sama, jadi kalau cuma andelin formsMap[perwId]
  // dari closure di sini bakal kebaca nilai LAMA (state React ke-update
  // di render berikutnya, bukan seketika).
  async function simpanHargaPerw(perwId, progIdOverride, formsOverride) {
    const progId = progIdOverride || editing.id;
    const hargaData = hargaDataMap[perwId];
    const forms = formsOverride || formsMap[perwId] || { upline: {}, perwakilan: {} };
    setSavingHargaIds(prev => new Set(prev).add(perwId));
    try {
      const uplineAbsolute = {};
      const perwAbsolute = {};
      for (const paket of PAKET) for (const kamar of KAMAR) {
        const key = `${paket}_${kamar}`;
        // Pakai HPP yang sedang tampil di form (editing), bukan snapshot lama
        // dari saat data harga ini dimuat — biar konsisten sama angka yang dilihat admin.
        const hppKantor = Number(editing[`hpp_${paket}_${kamar}`] || 0);
        const uplineDelta = Number(forms.upline[key] || 0);
        const uplineAbs = hargaData?.upline ? hppKantor + uplineDelta : 0;
        uplineAbsolute[key] = uplineAbs;
        const hppEfektif = hargaData?.upline ? uplineAbs : hppKantor;
        const perwDelta = Number(forms.perwakilan[key] || 0);
        perwAbsolute[key] = hppEfektif + perwDelta;
      }
      const res = await fetch('/api/admin/harga-perwakilan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perw_id: perwId,
          prog_id: progId,
          harga_perwakilan: perwAbsolute,
          harga_upline: hargaData?.upline ? uplineAbsolute : null,
        }),
      });
      if (res.ok) {
        if (progIdOverride) perwFetchedRef.current.delete(perwId);
        else muatHargaPerw(perwId, progId);
      } else {
        const d = await res.json();
        alert(d.error || 'Gagal menyimpan harga');
      }
    } catch { alert('Terjadi kesalahan'); }
    setSavingHargaIds(prev => { const next = new Set(prev); next.delete(perwId); return next; });
  }

  function setF(key, val) { setEditing(prev => ({ ...prev, [key]: val })); }
  function setNum(key, val) { setEditing(prev => ({ ...prev, [key]: Number(String(val).replace(/\D/g, '')) })); }

  // Ujroh dibedakan dari KELAS (paket) saja, bukan tipe kamar — jadi 1
  // input per paket, berlaku sama ke semua tipe kamar paket itu.
  function setUjrohPaket(paket, val) {
    const num = Number(String(val).replace(/\D/g, ''));
    setEditing(prev => {
      const next = { ...prev };
      for (const kamar of KAMAR) next[`ujroh_${paket}_${kamar}`] = num;
      return next;
    });
  }

  // Sama seperti Ujroh — ujroh upline/perwakilan cuma dibedain KELAS
  // (paket), bukan tipe kamar. 1 input berlaku ke semua tipe kamar paket itu.
  // Keyed per perwId karena sekarang banyak perwakilan bisa diedit sekaligus.
  function setUjrohUplinePerw(perwId, paket, val) {
    const num = Number(String(val).replace(/\D/g, ''));
    setFormsMap(prev => {
      const cur = prev[perwId] || { upline: {}, perwakilan: {} };
      const nextUpline = { ...cur.upline };
      for (const kamar of KAMAR) nextUpline[`${paket}_${kamar}`] = num;
      return { ...prev, [perwId]: { ...cur, upline: nextUpline } };
    });
  }
  function setUjrohPerwPerw(perwId, paket, val) {
    const num = Number(String(val).replace(/\D/g, ''));
    setFormsMap(prev => {
      const cur = prev[perwId] || { upline: {}, perwakilan: {} };
      const nextPerwakilan = { ...cur.perwakilan };
      for (const kamar of KAMAR) nextPerwakilan[`${paket}_${kamar}`] = num;
      return { ...prev, [perwId]: { ...cur, perwakilan: nextPerwakilan } };
    });
  }

  // Isi 1 perwakilan (yang PUNYA upline) & 1 perwakilan (yang GAK PUNYA
  // upline) sebagai ACUAN — biasanya perwakilan PERTAMA di tiap kelompok
  // (lihat badge "Acuan" di render) — lalu klik "Samakan Semuanya" buat
  // nge-copy Ujroh Upline/Perwakilan dari acuan itu ke SEMUA perwakilan lain
  // yang sekelompok, biar gak perlu ngetik satu-satu kalau perwakilannya
  // banyak & memang mau disamain semua. Kalau Program-nya UDAH ADA id-nya,
  // hasil salinan ini LANGSUNG ikut kesimpen ke server juga (bukan cuma
  // keisi di form doang) — biar gak perlu klik "Simpan Harga" satu-satu lagi
  // abis nyamain. Program yang belum disimpan cukup keisi di form aja, nanti
  // ikut ke-submit bareng pas "Buat Program" (lihat simpan()).
  async function samakanSemuaHargaPerw() {
    // Cuma yang datanya udah kemuat & gak error yang ikut dikelompokkan —
    // biar entry yang masih "Memuat..."/gagal gak ke-anggep "tanpa upline"
    // gara-gara hargaDataMap[id] masih kosong.
    const ids = (editing.perw_ids || []).filter(id => hargaDataMap[id] && !hargaDataMap[id].error);
    const denganUpline = ids.filter(id => hargaDataMap[id]?.upline);
    const tanpaUpline = ids.filter(id => !hargaDataMap[id]?.upline);
    const salinan = {}; // id -> forms baru, dipakai buat setFormsMap SEKALIGUS buat langsung disimpen
    if (denganUpline.length > 1) {
      const acuan = formsMap[denganUpline[0]] || { upline: {}, perwakilan: {} };
      for (const id of denganUpline.slice(1)) salinan[id] = { upline: { ...acuan.upline }, perwakilan: { ...acuan.perwakilan } };
    }
    if (tanpaUpline.length > 1) {
      const acuan = formsMap[tanpaUpline[0]] || { upline: {}, perwakilan: {} };
      for (const id of tanpaUpline.slice(1)) salinan[id] = { upline: { ...acuan.upline }, perwakilan: { ...acuan.perwakilan } };
    }
    setFormsMap(prev => ({ ...prev, ...salinan }));
    if (editing.id) {
      for (const id of Object.keys(salinan)) await simpanHargaPerw(id, editing.id, salinan[id]);
    }
  }

  // Set isi itinerary untuk 1 hari (idx)
  function setItinerary(idx, val) {
    setEditing(prev => {
      const arr = Array.isArray(prev.itinerary) ? [...prev.itinerary] : [];
      while (arr.length <= idx) arr.push('');
      arr[idx] = val;
      return { ...prev, itinerary: arr };
    });
  }

  // Payload siap-kirim: hitung Harga Publikasi (HPP+Ujroh) & rapikan itinerary.
  function buildPayload() {
    const payload = { ...editing };
    payload.type = jenisProgramList.find(j => j.value === payload.jenis_program)?.tipe_program || 'Umroh';
    for (const paket of PAKET) for (const kamar of KAMAR) {
      const hpp = Number(payload[`hpp_${paket}_${kamar}`] || 0);
      const ujroh = Number(payload[`ujroh_${paket}_${kamar}`] || 0);
      payload[`harga_${paket}_${kamar}`] = hpp + ujroh;
    }
    // Costing Program aktif — Itinerary & Include/Exclude diisi di form
    // kalkulator (bukan di section "Detail Publikasi" yang disembunyiin, lihat
    // JSX di atas), jadi tarik dari situ pas mau disimpan ke Program ini.
    if (kalkulatorAktif.deluxe || kalkulatorAktif.eksekutif || kalkulatorAktif.signature) {
      payload.include_items = kalkulatorShared.include_items || '';
      payload.exclude_items = kalkulatorShared.exclude_items || '';
      if (Array.isArray(kalkulatorShared.itinerary)) payload.itinerary = kalkulatorShared.itinerary;
      // itinerary_modul (override teks hari yang ditarik dari Modul Negara) —
      // PANJANGNYA independen dari Durasi Program (ngikut total hari modul
      // yang dipilih, bukan total_hari_program), jadi JANGAN ikut kena
      // pad/potong ke `durasi` kayak itinerary biasa di bawah.
      if (Array.isArray(kalkulatorShared.itinerary_modul)) payload.itinerary_modul = kalkulatorShared.itinerary_modul;
      // Durasi Program ngikutin Total Hari Program kalkulator (bukan field
      // "Durasi (hari)" yang udah di-readonly-in di atas) — biar itinerary-nya
      // gak kepotong kalau admin ngubah Total Hari Program di kalkulator
      // TANPA lewat pakaiTemplate() lagi (mis. nambah manual dari template).
      payload.durasi = Number(kalkulatorShared.total_hari_program) || payload.durasi;
    }
    const durasi = Number(payload.durasi || 0);
    const it = Array.isArray(payload.itinerary) ? payload.itinerary : [];
    payload.itinerary = Array.from({ length: durasi }, (_, i) => it[i] || '');
    if (!payload.tanggal_berangkat) payload.tanggal_berangkat = null;
    return payload;
  }

  // Modul negara yang beneran dipakai kalkulator terpadu di halaman ini —
  // Program yang UDAH ADA snapshot-nya (katalogModulSnapshot terisi) pakai
  // fotokopi yang dibekukan, BUKAN katalog live, biar HPP-nya gak ikut geser
  // kalau harga modul di katalog berubah/dihapus belakangan. Program baru
  // (belum ada snapshot) pakai katalog live seperti biasa.
  const katalogModulUntukKalkulator = katalogModulSnapshot || katalogModul;

  // Klik manual admin buat sengaja narik ulang harga modul negara TERBARU
  // dari katalog ke Program yang lagi dibuka — satu-satunya cara costing-nya
  // ikut berubah selain edit manual, sesuai maunya "cuma bisa dirubah lewat
  // management program".
  function sinkronKatalogModul() {
    const modulTambahan = modulTambahanArray(kalkulatorShared);
    if (modulTambahan.length === 0) { alert('Program ini gak pakai Modul Negara.'); return; }
    if (!confirm('Sinkronkan ke harga katalog Modul Negara TERBARU? Angka HPP program ini bakal keitung ulang pakai harga terkini (bisa naik/turun dari yang sekarang) — baru beneran tersimpan setelah kamu klik Simpan Program.')) return;
    setKatalogModulSnapshot(buildKatalogModulSnapshot(modulTambahan, katalogModul));
  }

  async function simpan() {
    if (!editing.name?.trim()) { alert('Nama program wajib diisi!'); return; }
    if (!editing.tanggal_berangkat) { alert('Tanggal keberangkatan wajib diisi! Tanpa ini, booking program tidak akan pernah bisa ditandai selesai.'); return; }
    const payload = buildPayload();
    // Bekukan fotokopi katalog modul negara SEKARANG kalau belum pernah ada
    // (Program baru, atau Program lama dari sebelum fitur ini ada) — mulai
    // dari save ini dan seterusnya HPP-nya kekunci ke angka ini, gak lagi
    // ngikutin katalog live kecuali admin klik "Sinkronkan" manual.
    const modulTambahan = modulTambahanArray(kalkulatorShared);
    payload.katalog_modul_snapshot = modulTambahan.length === 0
      ? null
      : (katalogModulSnapshot || buildKatalogModulSnapshot(modulTambahan, katalogModul));
    setKatalogModulSnapshot(payload.katalog_modul_snapshot);
    setSaving(true);
    try {
      const method = payload.id ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/programs', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        alert(payload.id ? 'Program diperbarui!' : 'Program dibuat!');
        const programId = payload.id || d.id;
        if (programId) await simpanBreakdownProgram(programId);
        if (!payload.id && d.id) {
          // Program baru dapat id — Opsi Tambahan yang diisi lokal (belum ke
          // server, lihat OpsiTambahanBaruEditor) ikut disubmit sekarang.
          for (const o of opsiTambahanBaru) {
            try {
              await fetch(`/api/admin/opsi-tambahan?prog_id=${d.id}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(o),
              });
            } catch { /* satu gagal gak nge-block sisanya — admin masih bisa nambahin manual lagi di DaftarEditor setelah ini */ }
          }
          setOpsiTambahanBaru([]);
          // Ujroh Upline/Perwakilan yang diisi lokal (ancang-ancang, lihat
          // seedHargaPerwLokal) ikut disubmit sekarang buat tiap perwakilan
          // yang dicentang — progIdOverride WAJIB dioper karena editing.id di
          // closure ini masih nilai lama (lihat komentar simpanHargaPerw).
          if (payload.publish_type === 'perwakilan') {
            for (const perwId of editing.perw_ids || []) {
              await simpanHargaPerw(perwId, d.id);
            }
          }
          // draft "new" pindah jadi draft ber-id
          try { localStorage.removeItem(draftKeyFor(null)); } catch {}
          setEditing(prev => ({ ...prev, id: d.id })); loadPrograms(); return;
        }
        try { localStorage.removeItem(draftKeyFor(payload.id)); } catch {}
        setEditing(null);
        loadPrograms();
      } else {
        const d = await res.json();
        alert(d.error || 'Gagal menyimpan');
      }
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function hapus(p) {
    if (!confirm(`Hapus program "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/programs?id=${p.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (res.ok) {
        try { localStorage.removeItem(draftKeyFor(p.id)); } catch {}
        alert('Program dihapus!'); loadPrograms();
      }
      else alert(d.error || 'Gagal menghapus');
    } catch { alert('Terjadi kesalahan'); }
  }

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-[#0E2F6E] mb-1";

  // Berapa kolom itinerary yang harus tampil (dari durasi)
  const durasiHari = Math.max(0, Number(editing?.durasi || 0));

  return (
    <Layout title="🕌 Kelola Program" backHref="/admin?tab=programs">
      <div className="max-w-3xl mx-auto">
        {/* LIST */}
        {!editing && (
          <>
            {/* Filter kategori publikasi — 1 titik akses buat semua kategori
                (Publik/Perwakilan/Sahabat Baitullah/Private), gantiin link
                terpisah per kategori yang dulu nyebar di sidebar (mis. entri
                "Costing Program" khusus Sahabat Baitullah, dikonfirmasi user
                2026-09-06 digabung ke sini). Query param ?publish_type=...
                dari link lama TETAP jalan (prefill filter ini), cuma bukan
                satu-satunya cara lagi. */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { value: null, label: 'Semua' },
                { value: 'public', label: 'Publik' },
                { value: 'perwakilan', label: 'Perwakilan' },
                { value: 'sahabat_baitullah', label: 'Sahabat Baitullah' },
                { value: 'private', label: 'Private' },
              ].map(opt => (
                <button key={opt.label} onClick={() => setFilterPublishType(opt.value)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                    filterPublishType === opt.value ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center mb-4">
              <div className="font-bold text-[#0E2F6E]">Daftar Program ({visiblePrograms.length})</div>
              <button onClick={newProgram}
                className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-4 py-2 rounded-full transition-colors">
                + Program Baru
              </button>
            </div>
            {visiblePrograms.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">
                Belum ada program. Klik &quot;Program Baru&quot; untuk menambah.
              </div>
            ) : (
              <div className="space-y-3">
                {visiblePrograms.map(p => (
                  <div key={p.id} className="bg-white rounded-xl border border-[#e0e8f0] p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#0E2F6E]">{p.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {p.type} · {p.durasi} hari · {p.used_seat || 0}/{p.total_seat} seat · {p.tanggal || '-'}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.active !== 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.active !== 0 ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.publish_type === 'private' ? 'bg-amber-100 text-amber-700' : p.publish_type === 'sahabat_baitullah' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {p.publish_type === 'private' ? 'Private' : p.publish_type === 'perwakilan' ? 'Perwakilan' : p.publish_type === 'sahabat_baitullah' ? 'Sahabat Baitullah' : 'Publik'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => editProgram(p)} className="text-xs font-bold text-[#1A4FA0] underline">Edit</button>
                      <button onClick={() => hapus(p)} className="text-xs font-bold text-red-500 underline">Hapus</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* FORM CREATE / EDIT */}
        {editing && (
          <div>
            <button onClick={() => setEditing(null)} className="text-sm text-gray-500 mb-4 hover:text-[#1A4FA0]">← Kembali ke daftar</button>

            {editing.id && user.role === 'super_admin' && (
              <div className="flex gap-2 mb-4">
                <button onClick={() => setTabProgram('detail')}
                  className={`text-xs font-bold px-4 py-2 rounded-full transition-colors ${tabProgram === 'detail' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  📋 Detail Program
                </button>
                <button onClick={() => setTabProgram('realisasi')}
                  className={`text-xs font-bold px-4 py-2 rounded-full transition-colors ${tabProgram === 'realisasi' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  🧾 Realisasi Costing
                </button>
              </div>
            )}

            {editing.id && user.role === 'super_admin' && tabProgram === 'realisasi' ? (
              <RealisasiCosting progId={editing.id} />
            ) : (
            <>
            {/* Data dasar */}
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4 space-y-3">
              <div className="font-bold text-[#0E2F6E]">{editing.id ? 'Edit Program' : 'Program Baru'}</div>
              <div>
                <label className={lbl}>Nama Program *</label>
                <input value={editing.name} onChange={e => setF('name', e.target.value)} className={inp} placeholder="Contoh: Umroh Special Tahun Baru 1448H"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Jenis Program</label>
                  <select value={editing.jenis_program || ''} onChange={e => {
                    setF('jenis_program', e.target.value);
                    // Costing Program juga punya field Jenis Program sendiri
                    // (di section Info Program-nya) — disamain dari sini biar
                    // gak diam-diam beda pas isi modul negara/trigger, TAPI
                    // field DI SINI yang tetap jadi sumber utama pas Simpan.
                    setKalkulatorShared(prev => ({ ...prev, jenis_program: e.target.value }));
                  }} className={inp}>
                    <option value="">— Pilih —</option>
                    {jenisProgramList.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                  </select>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Nentuin template mana aja yang muncul di &quot;Pakai Costing Program&quot; di bawah — cuma yang jenisnya sama yang ditawarin.
                  </div>
                </div>
                <div>
                  <label className={lbl}>Durasi (hari)</label>
                  {(kalkulatorAktif.deluxe || kalkulatorAktif.eksekutif || kalkulatorAktif.signature) ? (
                    <div className={`${inp} bg-gray-100 text-gray-500`} title="Ngikutin Total Hari Program di Costing Program di bawah, biar itinerary-nya gak kepotong pas Simpan">
                      {Number(kalkulatorShared.total_hari_program) || 0} (dari Costing Program di bawah)
                    </div>
                  ) : (
                    <input value={editing.durasi} onChange={e => setNum('durasi', e.target.value)} className={inp} inputMode="numeric"/>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Tanggal Keberangkatan (teks tampilan)</label>
                  <input value={editing.tanggal} onChange={e => setF('tanggal', e.target.value)} className={inp} placeholder="Contoh: 15 - 23 Maret 2026"/>
                </div>
                <div>
                  <label className={lbl}>Tanggal Berangkat (untuk itinerary) *</label>
                  <input type="date" value={editing.tanggal_berangkat || ''} onChange={e => { if (e.target.value) setF('tanggal_berangkat', e.target.value); }} className={inp} required/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Total Seat</label>
                  <input value={editing.total_seat} onChange={e => setNum('total_seat', e.target.value)} className={inp} inputMode="numeric"/>
                </div>
                <div>
                  <label className={lbl}>DP (Rp)</label>
                  <input value={editing.dp ? Number(editing.dp).toLocaleString('id-ID') : ''} onChange={e => setNum('dp', e.target.value)} className={inp} inputMode="numeric"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Publikasi</label>
                  <select value={editing.publish_type} onChange={e => setF('publish_type', e.target.value)} className={inp}>
                    <option value="public">Publik</option>
                    <option value="perwakilan">Khusus Perwakilan</option>
                    <option value="private">Private</option>
                    <option value="sahabat_baitullah">Sahabat Baitullah</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Highlight (teks promo, opsional)</label>
                  <input value={editing.highlight || ''} onChange={e => setF('highlight', e.target.value)} className={inp} placeholder="Contoh: Free City Tour"/>
                </div>
              </div>

              {editing.publish_type === 'private' && (
                <div>
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">
                    🔒 Program Private — gak muncul di halaman publik/perwakilan sama sekali. Cuma bisa dicheckout
                    admin/super_admin (daftarin langsung dari panel), atau akun jamaah yang dicentang di bawah.
                  </div>
                  <label className={lbl}>Akun Jamaah yang Ditunjuk (opsional, bisa pilih lebih dari 1)</label>
                  <input value={cariPrivateJamaah} onChange={e => setCariPrivateJamaah(e.target.value)}
                    placeholder="Cari nama atau kode unik..."
                    className={`${inp} mb-1.5`} />
                  <div className="border-2 border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
                    {privateJamaahList
                      .filter(j => `${j.name} ${j.kode_unik || ''}`.toLowerCase().includes(cariPrivateJamaah.toLowerCase()))
                      .map(j => (
                        <label key={j.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(editing.private_ids || []).includes(j.id)}
                            onChange={e => {
                              const current = editing.private_ids || [];
                              setF('private_ids', e.target.checked ? [...current, j.id] : current.filter(id => id !== j.id));
                            }}
                            className="w-4 h-4 accent-[#1A4FA0]"
                          />
                          {j.name} ({j.kode_unik})
                        </label>
                      ))}
                    {privateJamaahList.length === 0 && (
                      <div className="text-[10px] text-red-500">Belum ada jamaah aktif.</div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Kosongkan kalau cuma admin yang bakal daftarin jamaahnya manual — gak wajib dicentang.
                  </div>
                </div>
              )}

              {editing.publish_type === 'perwakilan' && (
                <div>
                  <label className={lbl}>Perwakilan yang Diotorisasi (bisa pilih lebih dari 1)</label>
                  <div className="border-2 border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
                    {perwList.length > 0 && (
                      <label className="flex items-center gap-2 text-sm font-bold text-[#1A4FA0] cursor-pointer border-b border-gray-100 pb-1 mb-1">
                        <input
                          type="checkbox"
                          checked={perwList.every(p => (editing.perw_ids || []).includes(p.id))}
                          onChange={e => setF('perw_ids', e.target.checked ? perwList.map(p => p.id) : [])}
                          className="w-4 h-4 accent-[#1A4FA0]"
                        />
                        Pilih Semua Perwakilan
                      </label>
                    )}
                    {perwList.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(editing.perw_ids || []).includes(p.id)}
                          onChange={e => {
                            const current = editing.perw_ids || [];
                            setF('perw_ids', e.target.checked ? [...current, p.id] : current.filter(id => id !== p.id));
                          }}
                          className="w-4 h-4 accent-[#1A4FA0]"
                        />
                        {p.name} ({p.kode_unik})
                      </label>
                    ))}
                    {perwList.length === 0 && (
                      <div className="text-[10px] text-red-500">Belum ada perwakilan aktif.</div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    Program ini exclusive — cuma perwakilan yang dicentang di sini yang bisa closing. Harga ujroh tiap
                    perwakilan diatur otomatis di &quot;Detail Harga&quot; di bawah begitu program disimpan &amp; dicentang di sini.
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={editing.active} onChange={e => setF('active', e.target.checked)} className="w-4 h-4 accent-[#1A4FA0]"/>
                Program aktif (tampil untuk jamaah)
              </label>
            </div>

            {/* Detail Harga — HPP selalu diisi (jadi HPP Kantor juga di skema
                perwakilan). Kalau publik: + Ujroh per paket + Harga
                Publikasi otomatis. Kalau perwakilan (dan sudah pilih
                perwakilan di atas): + Ujroh Upline (kalau ada) + Ujroh
                Perwakilan. */}
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
              <div className="font-bold text-[#0E2F6E] mb-1">💰 Detail Harga</div>
              <div className="text-xs text-gray-400 mb-4">
                {editing.publish_type === 'perwakilan'
                  ? <>Isi <b>HPP</b> per kombinasi kamar (HPP Kantor) — berlaku sama buat semua perwakilan. Ujroh tiap perwakilan diatur otomatis di bawah, sesuai yang dicentang di atas.</>
                  : <>Isi <b>HPP</b> per kombinasi kamar dan <b>Ujroh</b> per paket (sama untuk semua tipe kamar). Harga Publikasi dihitung otomatis (HPP + Ujroh).</>}
              </div>

              {editing.publish_type === 'perwakilan' && !editing.id && (editing.perw_ids || []).length > 0 && (
                <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3 mb-3">
                  ⚠️ Program belum disimpan — harga di bawah ini baru ANCANG-ANCANG, beneran kesimpen begitu kamu klik &quot;Buat Program&quot;.
                </div>
              )}
              {editing.publish_type === 'perwakilan' && (editing.perw_ids || []).length === 0 && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 mb-3">
                  Centang minimal 1 perwakilan di atas dulu buat munculin form harganya di sini.
                </div>
              )}

              {user.role === 'super_admin' && (
                <>
                  {editing.id && modulTambahanArray(kalkulatorShared).length > 0 && (
                    <div className="flex items-center justify-between gap-2 bg-amber-50 text-amber-800 text-xs rounded-lg p-2.5 mb-3">
                      <span>
                        🔒 Harga Modul Negara program ini {katalogModulSnapshot ? 'terkunci ke fotokopi yang tersimpan' : 'belum pernah dibekukan — bakal dibekukan otomatis pas kamu Simpan'}
                        , gak ikut berubah walau katalog modul negara diedit belakangan.
                      </span>
                      <button type="button" onClick={sinkronKatalogModul} className="font-bold hover:underline shrink-0 whitespace-nowrap">🔄 Sinkronkan ke Harga Terbaru</button>
                    </div>
                  )}
                  <KalkulatorTerpadu
                    key={kalkulatorResetKey}
                    aktif={!!(kalkulatorAktif.deluxe || kalkulatorAktif.eksekutif || kalkulatorAktif.signature)}
                    onToggle={nyala => setKalkulatorAktif({ deluxe: nyala, eksekutif: nyala, signature: nyala })}
                    shared={kalkulatorShared} setShared={setKalkulatorShared}
                    hotel={kalkulatorHotel} setHotel={setKalkulatorHotel}
                    malam={kalkulatorMalam} setMalam={setKalkulatorMalam}
                    komisi={kalkulatorKomisi} setKomisi={setKalkulatorKomisi}
                    margin={kalkulatorMargin} setMargin={setKalkulatorMargin}
                    templateList={templateList.filter(t => !editing.jenis_program || t.jenis_program === editing.jenis_program)}
                    pakaiTemplate={pakaiTemplate}
                    katalogModul={katalogModulUntukKalkulator}
                    tanggalBerangkat={editing.tanggal_berangkat}
                  />
                </>
              )}

              {/* Ujroh Sahabat Baitullah closing-in jamaah LAIN ke program
                  ini — SENGAJA cuma muncul di publish_type='public'
                  (dikonfirmasi user 2026-09-06): publish_type='sahabat_baitullah'
                  emang cuma bisa dicheckout jamaah Sahabat Baitullah sendiri
                  (buat dirinya sendiri), jadi gak ada skenario "closing
                  jamaah lain" di situ — gak perlu section ini. Dua nominal
                  independen, DIREKOMENDASIKAN default (lihat emptyProgram())
                  pas bikin program baru tapi tetap bisa diedit/dikosongkan. */}
              {editing.publish_type === 'public' && (
                <div className="mb-4 p-3 bg-amber-50/50 border border-amber-100 rounded-lg">
                  <div className="text-xs font-bold text-[#0E2F6E] mb-2">🤝 Ujroh Sahabat Baitullah — Closing Jamaah Lain</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Head of Program (Rp) <span className="font-normal text-gray-400">(opsional)</span></label>
                      <input
                        value={editing.sahabat_closing_langsung_hop_nominal ? Number(editing.sahabat_closing_langsung_hop_nominal).toLocaleString('id-ID') : ''}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setF('sahabat_closing_langsung_hop_nominal', digits ? Number(digits) : null);
                        }}
                        className={inp}
                        inputMode="numeric"
                        placeholder="Kosongkan = 0"
                      />
                    </div>
                    <div>
                      <label className={lbl}>Yang Closing (Rp) <span className="font-normal text-gray-400">(opsional)</span></label>
                      <input
                        value={editing.sahabat_closing_nominal_closer ? Number(editing.sahabat_closing_nominal_closer).toLocaleString('id-ID') : ''}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setF('sahabat_closing_nominal_closer', digits ? Number(digits) : null);
                        }}
                        className={inp}
                        inputMode="numeric"
                        placeholder="Kosongkan = 1.000.000 (default)"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1.5">
                    Berlaku pas anggota Sahabat Baitullah closing-langsungkan jamaah LAIN ke program ini (jamaah booking langsung, bukan gabung Sahabat Baitullah) — dua-duanya nominal fix, independen satu sama lain.
                  </div>
                </div>
              )}

              {editing.publish_type === 'perwakilan' ? (
                <>
                  {PAKET.map(paket => {
                    // Kalkulator aktif buat paket ini — HPP Kantor udah kelihatan
                    // di tabel "Hasil HPP & Harga Jual" Costing Program di atas,
                    // gak perlu ditampilin ulang di sini (sama kayak skema Publik).
                    if (kalkulatorAktif[paket]) return null;
                    return (
                    <div key={paket} className="mb-5">
                      <div className="font-bold text-[#0E2F6E] text-sm mb-2 pb-1 border-b border-gray-100">📦 Paket {PAKET_LABEL[paket]}</div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">🏨 Hotel Mekkah</label>
                          <input value={editing[`hotel_mekkah_${paket}`] || ''} onChange={e => setF(`hotel_mekkah_${paket}`, e.target.value)}
                            placeholder="Nama hotel di Mekkah" inputMode="text"
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"/>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">🏨 Hotel Madinah</label>
                          <input value={editing[`hotel_madinah_${paket}`] || ''} onChange={e => setF(`hotel_madinah_${paket}`, e.target.value)}
                            placeholder="Nama hotel di Madinah" inputMode="text"
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"/>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {KAMAR.map(kamar => {
                          const hpp = Number(editing[`hpp_${paket}_${kamar}`] || 0);
                          return (
                            <div key={kamar} className="bg-gray-50 rounded-lg p-3">
                              <div className="text-[10px] font-semibold text-gray-600 mb-2">{KAMAR_LABEL[kamar]}</div>
                              <label className="block text-[10px] text-gray-400 mb-1">HPP Kantor</label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Rp</span>
                                <input
                                  value={hpp ? hpp.toLocaleString('id-ID') : ''}
                                  onChange={e => setNum(`hpp_${paket}_${kamar}`, e.target.value)}
                                  inputMode="numeric" placeholder="0"
                                  className="w-full pl-7 pr-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}

                  {/* Program belum ada id — hd datang dari seedHargaPerwLokal (lokal,
                      ancang-ancang), bukan hasil fetch server. Sudah ada id — hd
                      dari muatHargaPerw() (server beneran). Dua-duanya sama-sama
                      bikin `hd` terisi, jadi render di bawah gak perlu tau bedanya. */}
                  {(editing.perw_ids || []).length > 0 && (
                    <div className="border-t border-gray-200 pt-4 mt-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="font-bold text-[#0E2F6E] text-sm">👥 Harga Jual per Perwakilan</div>
                        {(() => {
                          const ids = (editing.perw_ids || []).filter(id => hargaDataMap[id] && !hargaDataMap[id].error);
                          const bisaSamakan = ids.filter(id => hargaDataMap[id]?.upline).length > 1 || ids.filter(id => !hargaDataMap[id]?.upline).length > 1;
                          return bisaSamakan && (
                            <button type="button" onClick={samakanSemuaHargaPerw} className="text-[10px] font-bold text-[#1A4FA0] hover:underline shrink-0 whitespace-nowrap">
                              🔄 Samakan Semuanya
                            </button>
                          );
                        })()}
                      </div>
                      <div className="text-[10px] text-gray-400 mb-3">
                        Isi 1 perwakilan yang ada upline-nya & 1 yang enggak (ditandai &quot;Acuan&quot;), lalu klik &quot;Samakan Semuanya&quot; buat nyalin ke perwakilan lain yang sekelompok — gak perlu ngetik satu-satu kalau mau disamain semua.
                      </div>
                      {(editing.perw_ids || []).map((perwId, _idx, arr) => {
                        const p = perwList.find(x => x.id === perwId);
                        const hd = hargaDataMap[perwId];
                        const forms = formsMap[perwId] || { upline: {}, perwakilan: {} };
                        if (!hd) {
                          return <div key={perwId} className="text-xs text-gray-400 mb-2">Memuat harga {p?.name || perwId}...</div>;
                        }
                        if (hd.error) {
                          return <div key={perwId} className="text-xs text-red-500 mb-2">⚠ Gagal memuat harga {p?.name || perwId}: {hd.error}</div>;
                        }
                        // Acuan = entry PERTAMA (yang datanya udah kemuat, gak error) di
                        // kelompoknya masing2 (pake upline / enggak) — ini yang disalin
                        // ke yang lain kalau admin klik "Samakan Semuanya".
                        const isAcuan = arr.find(id => hargaDataMap[id] && !hargaDataMap[id].error && !!hargaDataMap[id].upline === !!hd.upline) === perwId;
                        return (
                          <div key={perwId} className="bg-gray-50 rounded-xl p-3 mb-3">
                            <div className="font-semibold text-sm text-[#0E2F6E] mb-2">
                              {p?.name || perwId}
                              {hd.upline && <span className="text-[10px] text-purple-600 font-normal ml-2">(upline: {hd.upline.name})</span>}
                              {isAcuan && <span className="text-[10px] font-bold text-white bg-[#C9952A] px-1.5 py-0.5 rounded ml-2">Acuan</span>}
                            </div>
                            {/* Hotel Mix gak punya bintang tetap — HPP/harga sama di
                                deluxe/eksekutif/signature (lihat onUbahKalkulator),
                                jadi cuma 1 blok "Harga Paket (Custom)" yang ditampilin,
                                bukan 3 blok identik. */}
                            {(kalkulatorShared.hotel_mode === 'mix' ? ['deluxe'] : PAKET).map(paket => {
                              const ujrohUpline = Number(forms.upline[`${paket}_triple`] || 0);
                              const ujrohPerwakilan = Number(forms.perwakilan[`${paket}_triple`] || 0);
                              return (
                                <div key={paket} className="mb-3">
                                  <div className="text-xs font-semibold text-gray-600 mb-1">
                                    {kalkulatorShared.hotel_mode === 'mix' ? 'Harga Paket (Custom)' : PAKET_LABEL[paket]}
                                  </div>
                                  <div className={`grid ${hd.upline ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mb-2`}>
                                    {hd.upline && (
                                      <div>
                                        <label className="block text-[10px] text-purple-600 mb-1">Ujroh Upline</label>
                                        <div className="relative">
                                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Rp</span>
                                          <input
                                            value={ujrohUpline ? ujrohUpline.toLocaleString('id-ID') : ''}
                                            onChange={e => setUjrohUplinePerw(perwId, paket, e.target.value)}
                                            inputMode="numeric" placeholder="0"
                                            className="w-full pl-7 pr-2 py-2 rounded-lg border-2 border-purple-200 focus:border-purple-400 focus:outline-none text-xs bg-white"/>
                                        </div>
                                      </div>
                                    )}
                                    <div>
                                      <label className="block text-[10px] text-gray-400 mb-1">Ujroh Perwakilan</label>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Rp</span>
                                        <input
                                          value={ujrohPerwakilan ? ujrohPerwakilan.toLocaleString('id-ID') : ''}
                                          onChange={e => setUjrohPerwPerw(perwId, paket, e.target.value)}
                                          inputMode="numeric" placeholder="0"
                                          className="w-full pl-7 pr-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs bg-white"/>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    {KAMAR.map(kamar => {
                                      const hpp = Number(editing[`hpp_${paket}_${kamar}`] || 0);
                                      const hppEfektif = hd.upline ? hpp + ujrohUpline : hpp;
                                      const hargaJual = hppEfektif + ujrohPerwakilan;
                                      return (
                                        <div key={kamar} className="flex justify-between items-center bg-white rounded-lg px-2 py-1.5 text-[10px]">
                                          <span className="text-gray-400">{KAMAR_LABEL[kamar]}</span>
                                          <span className="font-black text-[#C9952A]">{rp(hargaJual)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                            {editing.id ? (
                              <button onClick={() => simpanHargaPerw(perwId)} disabled={savingHargaIds.has(perwId)}
                                className="text-xs font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 px-4 py-2 rounded-lg mt-1">
                                {savingHargaIds.has(perwId) ? 'Menyimpan...' : `💾 Simpan Harga ${p?.name || ''}`}
                              </button>
                            ) : (
                              <div className="text-[10px] text-gray-400 mt-1">Ikut kesimpen otomatis pas klik &quot;Buat Program&quot; di bawah.</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                PAKET.map(paket => {
                  // Kalkulator aktif buat paket ini — Ujroh & Harga Publikasi
                  // udah otomatis ngikutin Komisi & "Jual" dari Costing Program di
                  // atas (lihat onUbahKalkulator), gak perlu form manual dobel di
                  // sini lagi. Cuma tampil kalau "Input Manual" (kalkulator gak aktif).
                  if (kalkulatorAktif[paket]) return null;
                  const ujroh = Number(editing[`ujroh_${paket}_triple`] || 0);
                  return (
                    <div key={paket} className="mb-5">
                      <div className="font-bold text-[#0E2F6E] text-sm mb-2 pb-1 border-b border-gray-100">📦 Paket {PAKET_LABEL[paket]}</div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">🏨 Hotel Mekkah</label>
                          <input value={editing[`hotel_mekkah_${paket}`] || ''} onChange={e => setF(`hotel_mekkah_${paket}`, e.target.value)}
                            placeholder="Nama hotel di Mekkah" inputMode="text"
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"/>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-1">🏨 Hotel Madinah</label>
                          <input value={editing[`hotel_madinah_${paket}`] || ''} onChange={e => setF(`hotel_madinah_${paket}`, e.target.value)}
                            placeholder="Nama hotel di Madinah" inputMode="text"
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"/>
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="block text-[10px] text-gray-400 mb-1">Ujroh (1 nilai untuk semua tipe kamar)</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Rp</span>
                          <input
                            value={ujroh ? ujroh.toLocaleString('id-ID') : ''}
                            onChange={e => setUjrohPaket(paket, e.target.value)}
                            inputMode="numeric" placeholder="0"
                            className="w-full pl-7 pr-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"/>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {KAMAR.map(kamar => {
                          const hpp = Number(editing[`hpp_${paket}_${kamar}`] || 0);
                          const publik = hpp + ujroh;
                          return (
                            <div key={kamar} className="bg-gray-50 rounded-lg p-3">
                              <div className="text-[10px] font-semibold text-gray-600 mb-2">{KAMAR_LABEL[kamar]}</div>
                              <label className="block text-[10px] text-gray-400 mb-1">HPP (modal)</label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Rp</span>
                                <input
                                  value={hpp ? hpp.toLocaleString('id-ID') : ''}
                                  onChange={e => setNum(`hpp_${paket}_${kamar}`, e.target.value)}
                                  inputMode="numeric" placeholder="0"
                                  className="w-full pl-7 pr-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"/>
                              </div>
                              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                                <span className="text-[10px] text-gray-400">Harga Publikasi</span>
                                <span className="text-xs font-black text-[#C9952A]">{rp(publik)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Detail Publikasi — Include / Exclude / Itinerary. Cuma tampil
                pas "Input Manual" (kalkulator gak dipakai) — begitu Costing
                Program aktif, section Itinerary & Include/Exclude-nya SENDIRI
                di atas (form kalkulator, sekarang gak disembunyiin lagi) yang
                dipakai, disinkron ke Program ini pas Simpan (lihat buildPayload). */}
            {!(kalkulatorAktif.deluxe || kalkulatorAktif.eksekutif || kalkulatorAktif.signature) && (
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
              <div className="font-bold text-[#0E2F6E] mb-1">📋 Detail Publikasi</div>
              <div className="text-xs text-gray-400 mb-4">
                Info ini tampil di halaman detail program yang dilihat calon jamaah.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className={lbl}>✅ Sudah Termasuk (Include)</label>
                  <textarea
                    value={editing.include_items || ''}
                    onChange={e => setF('include_items', e.target.value)}
                    rows={6}
                    className={inp}
                    placeholder={"1 item per baris, contoh:\nTiket pesawat PP\nVisa Umroh\nHotel bintang 5\nMakan 3x sehari"}/>
                  <div className="text-[10px] text-gray-400 mt-1">Tekan Enter untuk item baru.</div>
                </div>
                <div>
                  <label className={lbl}>❌ Tidak Termasuk (Exclude)</label>
                  <textarea
                    value={editing.exclude_items || ''}
                    onChange={e => setF('exclude_items', e.target.value)}
                    rows={6}
                    className={inp}
                    placeholder={"1 item per baris, contoh:\nPembuatan paspor\nSuntik meningitis\nPengeluaran pribadi"}/>
                  <div className="text-[10px] text-gray-400 mt-1">Tekan Enter untuk item baru.</div>
                </div>
              </div>

              {/* Itinerary dinamis mengikuti durasi */}
              <div>
                <label className={lbl}>🗺️ Itinerary per Hari</label>
                {durasiHari <= 0 ? (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                    Isi <b>Durasi (hari)</b> di atas dulu untuk memunculkan kolom itinerary.
                  </div>
                ) : (
                  <>
                    {!editing.tanggal_berangkat && (
                      <div className="text-[10px] text-amber-600 mb-2">
                        Isi <b>Tanggal Berangkat</b> di atas agar tanggal tiap hari muncul otomatis.
                      </div>
                    )}
                    <div className="space-y-2">
                      {Array.from({ length: durasiHari }, (_, i) => {
                        const tglLabel = labelHari(editing.tanggal_berangkat, i);
                        return (
                          <div key={i} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-[#0E2F6E]">Hari {i + 1}</span>
                              {tglLabel && <span className="text-[10px] text-gray-400">{tglLabel}</span>}
                            </div>
                            <textarea
                              value={(editing.itinerary && editing.itinerary[i]) || ''}
                              onChange={e => setItinerary(i, e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs"
                              placeholder={`Kegiatan hari ke-${i + 1}...`}/>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            )}

            {/* Info Manasik — sekadar info jadwal/lokasi buat jamaah program
                ini (dashboard jamaah, muncul begitu DP confirmed), gak ada
                gate/tracking kehadiran. Selalu tampil (gak ikut disembunyiin
                pas Costing Program aktif kayak Detail Publikasi di atas). */}
            <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
              <div className="font-bold text-[#0E2F6E] mb-1">🕋 Info Manasik</div>
              <div className="text-xs text-gray-400 mb-4">Tampil otomatis di dashboard jamaah program ini begitu DP dikonfirmasi.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={lbl}>📅 Tanggal Manasik</label>
                  <input type="date" value={editing.manasik_tanggal || ''} onChange={e => setF('manasik_tanggal', e.target.value)} className={inp}/>
                </div>
                <div>
                  <label className={lbl}>📍 Lokasi</label>
                  <input type="text" value={editing.manasik_lokasi || ''} onChange={e => setF('manasik_lokasi', e.target.value)}
                    className={inp} placeholder="Contoh: Aula JM Travel, Jl. ..."/>
                </div>
              </div>
              <div>
                <label className={lbl}>📝 Catatan</label>
                <textarea value={editing.manasik_catatan || ''} onChange={e => setF('manasik_catatan', e.target.value)}
                  rows={3} className={inp} placeholder="Info tambahan buat jamaah (perlengkapan yang dibawa, dress code, dll)"/>
              </div>
            </div>

            {/* Opsi Tambahan — pilihan add-on checkout MILIK program ini
                (beda program bisa beda opsi & harga), mis. upgrade kamar,
                request khusus. Cuma bisa dikelola setelah program disimpan
                (butuh id-nya), sama seperti Harga Perwakilan di atas. */}
            {editing.id && (
              <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
                <DaftarEditor
                  judul="🧳 Opsi Tambahan Checkout"
                  deskripsiHalaman="Pilihan tambahan yang bisa dicentang jamaah saat checkout/order jamaah UNTUK PROGRAM INI SAJA (mis. upgrade kamar, request khusus). Harga dikali jumlah jamaah pada item tersebut, otomatis masuk ke total harga, formulir jamaah, & cetak formulir."
                  adminApiUrl={`/api/admin/opsi-tambahan?prog_id=${editing.id}`}
                  fields={[
                    { key: 'nama', label: 'Nama Opsi', placeholder: 'Mis. Upgrade Kamar Single', wajib: true },
                    { key: 'harga', label: 'Harga per Jamaah (Rp)', placeholder: 'Mis. 500000', wajib: true, type: 'number' },
                    { key: 'deskripsi', label: 'Deskripsi (opsional)', placeholder: 'Jelaskan opsinya...' },
                  ]}
                  kolomTampil={{ judul: 'nama', sub: 'harga' }}
                />
              </div>
            )}
            {/* Program belum punya id (belum pernah disimpan) — Opsi Tambahan
                gak bisa langsung POST ke server (butuh prog_id), jadi diisi
                LOKAL dulu di sini, baru ikut kesimpen bareng pas klik "Buat
                Program" (lihat simpan()). Begitu id-nya ada, ganti otomatis
                ke DaftarEditor (server-synced) di atas. */}
            {!editing.id && (
              <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
                <div className="font-bold text-[#0E2F6E] mb-1">🧳 Opsi Tambahan Checkout</div>
                <div className="text-xs text-gray-400 mb-4">
                  Belum bisa disimpen ke server sampai Program-nya sendiri disimpan — isi dulu di sini,
                  nanti otomatis ikut tersimpan pas kamu klik &quot;Buat Program&quot; di bawah.
                </div>
                <OpsiTambahanBaruEditor items={opsiTambahanBaru} setItems={setOpsiTambahanBaru} />
              </div>
            )}

            <button onClick={simpan} disabled={saving}
              className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-50">
              {saving ? 'Menyimpan...' : (editing.id ? '💾 Simpan Perubahan' : '➕ Buat Program')}
            </button>
            </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

// Realisasi Costing — data REAL travel order (booking beneran) buat 1 program:
// total jamaah + breakdown cewek/cowok (dari jamaah_data per orang), dan
// kebutuhan kamar per tipe (dari kamar+jumlah_jamaah per booking, dibagi
// kapasitas kamarnya) — biar admin tau berapa kamar yang harus dipesan ke
// hotel. Booking yang statusnya batal/dibatalkan dikecualikan (sama kayak
// Manifest — lihat statusJamaah() di admin/database/route.js).
function RealisasiCosting({ progId }) {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch(`/api/admin/program-jamaah?prog_id=${progId}`).then(r => r.json())
      .then(d => { if (!ignore) setBookings(d.bookings || []); })
      .catch(() => { if (!ignore) setBookings([]); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [progId]);

  if (loading) return <div className="text-sm text-gray-400 py-10 text-center">Memuat data booking...</div>;

  const aktif = bookings.filter(b => b.status !== 'batal' && b.status !== 'dibatalkan');

  let cowok = 0, cewek = 0, jkKosong = 0;
  let totalJamaahData = 0;
  for (const b of aktif) {
    for (const j of b.jamaah || []) {
      if (j.status_jamaah === 'dibatalkan') continue; // dibatalkan per-orang, jamaah lain di booking ini tetap ikut
      totalJamaahData++;
      if (j.jk === 'Laki-Laki') cowok++;
      else if (j.jk === 'Perempuan') cewek++;
      else jkKosong++;
    }
  }
  const totalJamaahOrder = aktif.reduce((s, b) => s + (Number(b.jumlah_jamaah) || 0), 0);

  // Alokasi kamar SEBENERNYA (bukan cuma total÷kapasitas) — 3 aturan:
  // 1. Cewek & cowok gak boleh sekamar (non-mahram) — dipisah kelompok total.
  // 2. Diutamakan sekamar sama rombongan booking yang sama (kemungkinan
  //    emang udah kenal/keluarga) sebelum digabung sama booking lain.
  // 3. Sisa yang gak cukup buat 1 kamar penuh (abis digabung lintas booking
  //    yang gender-nya sama) DIFLAG, bukan didiemin/dibulatkan halus —
  //    itu yang butuh admin follow-up (cariin temen sekamar / pindah tipe
  //    kamar / dikabarin nambah biaya kalau ujung2nya kamar sendiri).
  // b.kamar dari DB itu STRING MENTAH dari cart checkout (mis. "Double
  // (2/Kamar)"), BUKAN key pendek 'double' — kamarKeyOf() dari
  // CartPaketKamar yang nge-normalize, SAMA PERSIS kayak yang dipakai pas
  // checkout (bug lama: lookup KAPASITAS_KAMAR pakai string mentah, selalu
  // miss & fallback ke kapasitas 1 — "kamar perlu dipesan" jadi keliatan
  // sama persis kayak jumlah jamaah).
  // Kombo paket/kamar di-resolve PER JAMAAH (bisa beda-beda dalam 1 booking
  // kalau pernah diedit lewat "Edit Paket/Kamar jamaah ini" di admin booking
  // detail) — fallback ke kombo booking-level buat booking yang belum
  // pernah diedit per-orang (lihat src/lib/jamaahHarga.js).
  const grupOrang = {}; // "paket|kamarKey|gender" -> [{bookingId, nama}]
  for (const b of aktif) {
    const bkResolve = { ...b, jamaah_data: b.jamaah };
    for (const j of b.jamaah || []) {
      if (j.status_jamaah === 'dibatalkan') continue;
      const { paket, kamarKey } = resolveJamaahHarga(bkResolve, j);
      if (!paket) continue;
      const gender = j.jk === 'Laki-Laki' ? 'Cowok' : j.jk === 'Perempuan' ? 'Cewek' : 'Belum Jelas';
      const key = `${paket}|${kamarKey}|${gender}`;
      (grupOrang[key] ||= []).push({ bookingId: b.id, nama: j.nama || '(tanpa nama)' });
    }
  }
  const kamarRows = Object.entries(grupOrang).map(([key, orang]) => {
    const [paket, kamar, gender] = key.split('|');
    const kapasitas = KAPASITAS_KAMAR[kamar] || 1;
    // Rombongan 1 booking diisiin ke kamarnya sendiri2 dulu (penuh-penuhan)
    // sebelum sisanya (yg kurang dari kapasitas) digabung sama sisa booking
    // lain yang gender-nya sama.
    const perBooking = {};
    for (const o of orang) (perBooking[o.bookingId] ||= []).push(o);
    let kamarPenuh = 0;
    let sisa = [];
    for (const grup of Object.values(perBooking)) {
      let g = grup;
      while (g.length >= kapasitas) { kamarPenuh++; g = g.slice(kapasitas); }
      sisa.push(...g);
    }
    while (sisa.length >= kapasitas) { kamarPenuh++; sisa = sisa.slice(kapasitas); }
    return { paket, kamar, gender, pax: orang.length, kamarPenuh, sisaOrang: sisa, kapasitas };
  }).sort((a, b) => PAKET.indexOf(a.paket) - PAKET.indexOf(b.paket) || KAMAR.indexOf(a.kamar) - KAMAR.indexOf(b.kamar) || a.gender.localeCompare(b.gender));
  // Kamar yang kesisa gak penuh TETAP butuh 1 kamar fisik beneran dipesan
  // (cuma diisinya gak sampe penuh) — ikut dihitung ke total, ditandain
  // terpisah di tabel (bukan disamarkan seolah-olah kamar penuh biasa).
  const totalKamar = kamarRows.reduce((s, r) => s + r.kamarPenuh + (r.sisaOrang.length > 0 ? 1 : 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 text-center">
          <div className="text-2xl font-bold text-[#0E2F6E]">{totalJamaahData || totalJamaahOrder}</div>
          <div className="text-xs text-gray-400 mt-1">Total Jamaah (booking aktif)</div>
        </div>
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{cowok}</div>
          <div className="text-xs text-gray-400 mt-1">Jamaah Cowok</div>
        </div>
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 text-center">
          <div className="text-2xl font-bold text-pink-600">{cewek}</div>
          <div className="text-xs text-gray-400 mt-1">Jamaah Cewek</div>
        </div>
      </div>
      {jkKosong > 0 && (
        <div className="text-[10px] text-amber-600">⚠ {jkKosong} jamaah belum lengkap ngisi formulir (jenis kelamin belum keisi) — belum ikut kehitung di angka Cowok/Cewek di atas.</div>
      )}
      {totalJamaahData === 0 && totalJamaahOrder > 0 && (
        <div className="text-[10px] text-amber-600">⚠ Ada {totalJamaahOrder} jamaah yang udah order tapi belum ada satupun yang ngisi formulir data diri — breakdown cowok/cewek belum bisa dihitung.</div>
      )}

      <div className="bg-white rounded-xl border border-[#e0e8f0] p-4">
        <div className="font-bold text-[#0E2F6E] mb-3">🛏️ Kebutuhan Kamar (dari booking aktif)</div>
        {kamarRows.length === 0 ? (
          <div className="text-xs text-gray-400">Belum ada booking dengan tipe kamar terisi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="p-2">Paket</th><th className="p-2">Tipe Kamar</th><th className="p-2">Gender</th>
                  <th className="p-2 text-right">Jamaah</th><th className="p-2 text-right">Kamar Penuh</th><th className="p-2">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {kamarRows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="p-2">{PAKET_LABEL[r.paket] || r.paket}</td>
                    <td className="p-2">{KAMAR_LABEL[r.kamar] || r.kamar}</td>
                    <td className="p-2">{r.gender === 'Belum Jelas' ? <span className="text-amber-600">⚠ Belum Jelas</span> : r.gender}</td>
                    <td className="p-2 text-right">{r.pax}</td>
                    <td className="p-2 text-right font-bold text-[#0E2F6E]">{r.kamarPenuh}</td>
                    <td className="p-2">
                      {r.sisaOrang.length > 0 ? (
                        <span className="text-amber-600">
                          ⚠ {r.sisaOrang.length} orang kurang {r.kapasitas - r.sisaOrang.length} lagi buat 1 kamar penuh
                          ({r.sisaOrang.map(o => o.nama).join(', ')}) — gabungin ke tipe kamar lain, cariin sekamar,
                          atau kabarin nambah biaya kalau ujung-ujungnya kamar sendiri.
                        </span>
                      ) : r.gender === 'Belum Jelas' ? (
                        <span className="text-amber-600">Lengkapi jenis kelamin dulu biar bisa dipisah kamar cewek/cowok.</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 font-bold">
                  <td className="p-2" colSpan={4}>Total Kamar Perlu Dipesan</td>
                  <td className="p-2 text-right text-[#0E2F6E]" colSpan={2}>{totalKamar}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[10px] text-gray-400 mt-2">
          Diutamakan sekamar sama rombongan booking yang sama, baru digabung sama booking lain (gender sama) buat
          ngisi sisa kapasitas. Kamar yang gak penuh-penuh tetap dihitung 1 kamar di Total (kamarnya tetap harus
          dipesan walau isinya kurang) — cek kolom Catatan buat yang perlu ditindaklanjuti.
        </div>
      </div>
    </div>
  );
}

// Staging lokal Opsi Tambahan buat Program yang belum pernah disimpan (belum
// punya prog_id, jadi gak bisa langsung POST ke /api/admin/opsi-tambahan).
// Versi ringkas dari DaftarEditor — cuma nama/harga/deskripsi, gak ada upload
// gambar/toggle aktif (defaultnya aktif, bisa diubah lagi lewat DaftarEditor
// beneran setelah Program-nya kesimpen).
function OpsiTambahanBaruEditor({ items, setItems }) {
  const [form, setForm] = useState(null); // null = form ketutup, {} = lagi nambah baru
  const inpKecil = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";

  function tambah() {
    if (!form?.nama?.trim()) { alert('Nama opsi wajib diisi'); return; }
    setItems(prev => [...prev, { nama: form.nama.trim(), harga: Number(form.harga) || 0, deskripsi: form.deskripsi?.trim() || '' }]);
    setForm(null);
  }
  function hapus(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5">
          <div className="text-sm">
            <span className="font-semibold text-gray-700">{it.nama}</span>{' '}
            <span className="text-xs text-gray-400">— Rp {Number(it.harga || 0).toLocaleString('id-ID')}</span>
          </div>
          <button onClick={() => hapus(idx)} className="text-red-500 text-xs font-bold hover:underline shrink-0">Hapus</button>
        </div>
      ))}
      {items.length === 0 && !form && <div className="text-xs text-gray-400">Belum ada opsi tambahan.</div>}

      {form ? (
        <div className="bg-gray-50 rounded-xl border-2 border-[#1A4FA0]/30 p-3 space-y-2">
          <input value={form.nama || ''} onChange={e => setForm({ ...form, nama: e.target.value })} placeholder="Nama Opsi (mis. Upgrade Kamar Single)" className={inpKecil} />
          <input type="number" value={form.harga || ''} onChange={e => setForm({ ...form, harga: e.target.value })} placeholder="Harga per Jamaah (Rp)" className={inpKecil} />
          <input value={form.deskripsi || ''} onChange={e => setForm({ ...form, deskripsi: e.target.value })} placeholder="Deskripsi (opsional)" className={inpKecil} />
          <div className="flex gap-2">
            <button onClick={tambah} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-4 py-2 rounded-lg">💾 Tambah</button>
            <button onClick={() => setForm(null)} className="text-xs text-gray-500 hover:underline px-2">Batal</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setForm({})} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Opsi</button>
      )}
    </div>
  );
}

