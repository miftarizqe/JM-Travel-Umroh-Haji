'use client';
import { Fragment, useEffect, useState } from 'react';
import KalkulatorBiaya, { hitungHppKamar, cariTierModulNegara, totalModulNegaraTerpilih, modulTambahanArray, totalTiketPesawat, subtotalPerKelompok, tlShareTiket, tlShareVisa, nilaiItem, itemAktif, paxBerbayarModul, rincianAddonModul, nilaiTarifModul, bulatkanKeAtas, itineraryHariModul, includeExcludeModul, transportasiOtomatis } from '@/app/components/KalkulatorBiaya';

const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];
const KAMAR_LABEL = { quad: 'Quad', triple: 'Triple', double: 'Double' };
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const TRIGGER_CHECKBOX = [
  { key: 'manasik_umroh', label: 'Manasik Umroh' },
  { key: 'perlengkapan_jamaah', label: 'Perlengkapan Jamaah' },
  { key: 'handling_jeddah', label: 'Handling Jeddah' },
  { key: 'city_tour_mekkah', label: 'City Tour Mekkah' },
  { key: 'city_tour_madinah', label: 'City Tour Madinah' },
  { key: 'city_tour_thaif', label: 'City Tour Thaif' },
];
const PEMBULATAN_LIST = [
  { value: 0, label: 'Tidak dibulatkan' },
  { value: 100000, label: 'Ke atas terdekat Rp 100.000' },
  { value: 250000, label: 'Ke atas terdekat Rp 250.000' },
  { value: 500000, label: 'Ke atas terdekat Rp 500.000' },
  { value: 1000000, label: 'Ke atas terdekat Rp 1.000.000' },
];

const inp = "w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs";
const lbl = "block text-[10px] text-gray-400 mb-1";
const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
// Label tanggal buat Hari ke-(idx), dihitung dari tanggal_berangkat Program —
// sama persis logikanya dengan labelHari() di admin/programs/page.jsx.
// Return "" kalau tglBerangkat kosong/invalid (mis. lagi ngedit Template,
// yang emang gak punya tanggal berangkat).
function labelHari(tglBerangkat, idx) {
  if (!tglBerangkat) return '';
  const base = new Date(tglBerangkat + 'T00:00:00');
  if (isNaN(base.getTime())) return '';
  const d = new Date(base);
  d.setDate(d.getDate() + idx);
  return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// Nilai unik 1 kolom tabel tier (buat isi pilihan dropdown Hari/Bintang/City
// Tour dst secara data-driven — data yang nentuin opsinya, bukan kode
// per-negara). Urut angka kalau semua numerik (Hari/Bintang), urut abjad
// kalau ada yang teks (mis. nama City Tour).
function opsiUnik(tiers, field) {
  const vals = [...new Set((tiers || []).map(t => t[field]).filter(v => v !== null && v !== undefined && v !== ''))];
  const semuaAngka = vals.every(v => v !== '' && !isNaN(Number(v)));
  return vals.sort(semuaAngka ? (a, b) => Number(a) - Number(b) : (a, b) => String(a).localeCompare(String(b)));
}

/**
 * Kalkulator terpadu — Pax/Kurs/Trigger/Tiket Pesawat/Biaya Lain-lain/Item
 * Master itu SATU set nilai buat seluruh program/template (bukan diulang
 * per paket), cuma Hotel Mekkah/Madinah, Margin & Komisi yang beda per
 * bintang (Bintang 3/4/5 = Deluxe/Eksekutif/Signature). Field trigger di sini
 * (Manasik Umroh dkk, Haramain Express, City Tour, Transportasi) baru
 * sebatas dicatat — belum otomatis narik item Master, nyusul. Transportasi
 * otomatis terkunci ke Bus kalau Pax Jamaah >= 15 (aturan operasional).
 *
 * Dipakai di 2 tempat: form Program (KalkulatorBiaya hasil hitungannya
 * ditulis ke hpp_{paket}_{kamar}), dan hub Program Kalkulator Biaya
 * (tempat template Umroh Regular dibuat/diedit — "head" sumber template).
 *
 * @param {boolean} [showTemplatePicker] - tampilkan dropdown "Mulai dari
 *   Template" (disembunyikan di hub, karena hub ITU SENDIRI tempat bikin/
 *   edit template — gak relevan "mulai dari template lain" di situ).
 * @param {boolean} [showToggle] - tampilkan tombol "Input Manual"/"Pakai
 *   Kalkulator" (disembunyikan di hub — di situ gak ada mode "input manual",
 *   kalkulator SELALU aktif karena memang lagi bikin/edit template).
 */
/**
 * @param {boolean} [hideForm] - sembunyiin SELURUH form rincian (Kurs/Pax/Info
 *   Program/Modul Negara/Itinerary/Tiket/Hotel/Items/Hasil HPP) — cuma toggle
 *   + template picker yang tetap tampil. Dipakai di form Program: HPP program
 *   itu 100% ambil dari template (gak ada yang diedit ulang di situ), admin
 *   cuma pilih template-nya lewat sini.
 * @param {boolean} [showOpsiPublik] - tampilkan seluruh konfigurasi yang
 *   CUMA relevan di Kalkulator Estimasi Publik (kalkulator-template/page.jsx,
 *   KalkulatorAcuanEditor.jsx) — toggle "Tetap"/"Pilihan Publik" di Modul
 *   Negara, mode Jumlah Pax/Hari Mutawwif/Durasi/Urutan Kota. Sembunyikan di
 *   Costing Program/form Program (program beneran itinerary-nya 1 kombinasi
 *   tetap, gak ada "jamaah pilih sendiri" — nongolnya field2 ini di sana
 *   cuma bikin bingung admin yang ngisi costing biasa).
 * @param {boolean} [sembunyikanTotalHari] - sembunyikan input "Total Hari
 *   Program" manual — KHUSUS Kalkulator Acuan (KalkulatorAcuanEditor.jsx):
 *   jalur "Umroh Private" itu emang HARUS punya beberapa opsi durasi (9
 *   Hari/12 Hari dst, lihat Pilihan Durasi Umroh di bawah), gak ada
 *   konsep "1 angka fallback" — beda dari paket kurasi bernama (mis. Umroh
 *   Berdua) yang boleh tetap 1 durasi tunggal. Total hari buat preview
 *   itinerary/HPP di editor ini sendiri diambil dari opsi durasi PERTAMA
 *   (lihat totalHariEfektif).
 */
export default function KalkulatorTerpadu({
  aktif, onToggle, shared, setShared, hotel, setHotel, malam, setMalam, komisi, setKomisi, margin, setMargin,
  templateList = [], pakaiTemplate, showTemplatePicker = true, showToggle = true, hideForm = false,
  katalogModul: katalogModulProp, tanggalBerangkat, showOpsiPublik = false, showOpsiHotelAlternatif = false,
  sembunyikanTotalHari = false,
}) {
  // Pembulatan Harga Jual ikut disimpan per template (shared.pembulatan) —
  // BUKAN state lokal komponen, biar gak reset ke 0 tiap buka ulang template
  // (bug lama: kesimpen di useState doang, ilang begitu ditutup/reload).
  const pembulatan = Number(shared.pembulatan) || 0;
  // Kalau parent-nya udah punya daftar modul negara sendiri (mis. halaman
  // admin Program Kalkulator Biaya, yang refresh listnya tiap kali modul
  // ditambah/diedit/dihapus/duplikat), pakai itu LANGSUNG lewat prop —
  // biar tambah/hapus modul di halaman yang sama kelihatan live di sini juga,
  // tanpa perlu refresh. Kalau gak dikasih prop (pemakaian di tempat lain,
  // mis. admin/programs), tetep fetch sendiri kayak sebelumnya.
  const [katalogModulInternal, setKatalogModul] = useState([]); // semua modul negara aktif (Dubai/Turkey dkk) + tiers-nya
  const katalogModul = katalogModulProp || katalogModulInternal;
  const [katalogJenisProgram, setKatalogJenisProgram] = useState([]); // jenis_program_master — dulu hardcode JENIS_PROGRAM_LIST
  // Isi dokumen PDF — 4 centangan independen (dulu 1 dropdown mode gabungan,
  // makin ribet tiap nambah kombinasi baru). HPP & Harga Jual SENGAJA
  // dipisah — 3 hal beda (HPP = cost, Ujroh = margin, Jual = harga ke
  // jamaah), bukan 1 paket yang harus dicentang bareng. Lihat unduhPdf.
  const [pdfOpsi, setPdfOpsi] = useState({ rincianBiaya: false, hpp: false, ujroh: false, jual: false, infoProgram: false });
  function togglePdfOpsi(key) { setPdfOpsi(prev => ({ ...prev, [key]: !prev[key] })); }
  function setS(patch) { setShared(prev => ({ ...prev, ...patch })); }
  function setH(paket, patch) { setHotel(prev => ({ ...prev, [paket]: { ...prev[paket], ...patch } })); }
  const paxJamaah = Number(shared.pax_jamaah) || 0;
  // Bus di atas 10 pax, Hi-Ace 5-10 pax, Mobil 1-4 pax — otomatis nentuin
  // sendiri dari jumlah pax (dikonfirmasi user 2026-08-18, gantiin aturan
  // lama "pax >= 15 wajib Bus"). null kalau pax belum diisi sama sekali
  // (mis. konteks publik yang field Jamaah-nya disembunyikan) — jatuh balik
  // ke pilihan manual admin.
  const transportasiAuto = transportasiOtomatis(paxJamaah);

  // Mode "mix" — 1 daftar hotel bebas jumlah & kombinasi kota/negara/bintang,
  // DIPAKAI BARENG ketiga paket (bukan 2 slot tetap Mekkah+Madinah per
  // paket). Dipakai buat Wisata atau Umroh yang hotelnya kebetulan mixed.
  const pakaiHotelMix = shared.hotel_mode === 'mix';
  // UI publik yang disederhanain (list hotel per Bintang independen per
  // kota, Margin & Komisi FLAT 1 angka, no itinerary day-by-day manual) —
  // awalnya CUMA buat pax_mode 'dinamis' (Kombinasi Kamar Campuran), tapi
  // paket/Deluxe-Eksekutif-Signature emang udah gak relevan buat SEMUA
  // template Kalkulator Estimasi Publik (kurasi ATAUPUN acuan), apapun
  // pax_mode-nya (dinamis/pasangan/fix) — admin cukup bedain "boundary"-nya
  // lewat pax_mode/pax_aturan, bukan lewat tampilan hotel/margin yang beda
  // (dikonfirmasi user 2026-08-18, request "Umroh Berdua" disamain kayak
  // Umroh Private). Internal Costing Program (showOpsiPublik=false) TETAP
  // pakai tabel per-Bintang lama, gak kesentuh sama sekali.
  const pakaiUiPublikSederhana = showOpsiPublik;
  const hotelList = shared.hotel_list || [];

  // Bintang mana yang ditampilkan di Hasil HPP & PDF. Hotel Mix cuma 1 harga
  // (ketiga paket identik, gak masuk akal ditampilin 3 baris kembar) — Hotel
  // Fix biarin admin pilih bintang mana aja yang beneran dipakai (mis. cuma
  // jual Bintang 4 & 5, gak jual Bintang 3), datanya tetap kesimpen semua,
  // cuma yang dicontreng yang nongol di tabel hasil & PDF.
  const bintangAktif = shared.bintang_aktif || { deluxe: true, eksekutif: true, signature: true };
  function toggleBintang(paket) {
    setS({ bintang_aktif: { ...bintangAktif, [paket]: bintangAktif[paket] === false ? true : false } });
  }
  // HPP tetap harus keliatan APAPUN keadaan bintangnya — checkbox ini murni
  // preferensi tampilan (mis. program tanpa hotel/bintang sama sekali kayak
  // Program Wisata modul negara), BUKAN syarat buat nge-block hasil kalau
  // gak ada satupun yang dicontreng. Kalau semua nonaktif, fallback tampilin
  // semua (gak pernah nge-blank kayak sebelumnya).
  const paketAktifTercontreng = PAKET.filter(p => bintangAktif[p] !== false);
  // pakaiUiPublikSederhana: cuma bucket 'deluxe' yang beneran kepakai (opsi
  // hotel + margin/komisi flat disimpen di situ, lihat toggleOpsiHotelDariMaster)
  // — checklist Bintang Aktif (tabel per-Bintang lama) gak kebuka/gak
  // relevan lagi di mode ini, jadi preview HPP di bawah cukup 1 baris.
  const paketAktif = pakaiUiPublikSederhana ? ['deluxe'] : pakaiHotelMix ? ['deluxe'] : (paketAktifTercontreng.length > 0 ? paketAktifTercontreng : PAKET);
  function tambahHotelDaftar() {
    setS({ hotel_list: [...hotelList, { nama: '', bintang: '', rate_double: '', rate_triple: '', rate_quad: '', mata_uang: 'SAR', malam: '' }] });
  }
  function ubahHotelDaftar(idx, patch) {
    setS({ hotel_list: hotelList.map((h, i) => i === idx ? { ...h, ...patch } : h) });
  }
  function hapusHotelDaftar(idx) {
    setS({ hotel_list: hotelList.filter((_, i) => i !== idx) });
  }

  // Tiket Pesawat bisa lebih dari 1 baris (rute/negara beda harga) — data
  // lama yang cuma punya tiket_pesawat_rate/mata_uang tunggal ditampilkan
  // sebagai 1 baris awal, baru "dinaikkan" jadi list beneran begitu diedit.
  const tiketRows = shared.tiket_pesawat_list && shared.tiket_pesawat_list.length > 0
    ? shared.tiket_pesawat_list
    : [{ nama: '', rate: shared.tiket_pesawat_rate || '', mata_uang: shared.tiket_pesawat_mata_uang || 'IDR' }];
  // PENTING: mutasi selalu berbasis shared.tiket_pesawat_list MENTAH (bukan
  // tiketRows, yang buat KOSONG nyintesis 1 baris kosong buat tampilan doang)
  // — kalau ikut nyebar tiketRows pas listnya masih kosong, baris sintesis
  // itu ke-bake permanen jadi entry beneran begitu nambah/isi dari master,
  // nongol di ATAS baris yang baru ditambah & bikin bingung (bug nyata,
  // dikonfirmasi user 2026-08-18).
  function ubahTiket(idx, patch) {
    setS({ tiket_pesawat_list: tiketRows.map((t, i) => i === idx ? { ...t, ...patch } : t) });
  }
  function tambahTiket() {
    setS({ tiket_pesawat_list: [...(shared.tiket_pesawat_list || []), { nama: '', rate: '', mata_uang: 'IDR' }] });
  }
  function hapusTiket(idx) {
    setS({ tiket_pesawat_list: tiketRows.filter((_, i) => i !== idx) });
  }

  // Opsi Hotel Alternatif per paket per kota — CUMA dipakai Kalkulator
  // Estimasi Publik (pengunjung pilih 1 dari beberapa hotel bernama), gak
  // ngaruh ke hitungan HPP internal sama sekali kalau dibiarin kosong (lihat
  // hitungHppKamar — tetap baca mekkah_rate_double dkk apa adanya, cuma
  // kalkulatorPublik.js#stateEfektif yang nimpa nilai itu dari opsi terpilih).
  const opsiKey = (kota) => `${kota}_opsi`;
  function opsiHotel(paket, kota) { return hotel[paket]?.[opsiKey(kota)] || []; }

  useEffect(() => {
    if (katalogModulProp) return;
    fetch('/api/admin/modul-negara?full=1').then(r => r.json()).then(d => setKatalogModul(d.modul || [])).catch(() => {});
  }, [katalogModulProp]);
  useEffect(() => {
    fetch('/api/admin/jenis-program').then(r => r.json()).then(d => setKatalogJenisProgram(d.jenis_program || [])).catch(() => {});
  }, []);

  // Master Harga Hotel & Tiket Pesawat — dipakai tombol "Isi dari Master" di
  // bawah (SALINAN/snapshot ke state form ini, BUKAN live-link — lihat
  // migration-master-harga.sql). Gak ngaruh ke hitungHppKamar sama sekali,
  // murni bantu admin ngisi form lebih cepat.
  //
  // Master Hotel skarang 2 level (kota+bintang+nama = induk, banyak periode-
  // rate nempel di bawahnya — lihat migration-master-hotel-bintang-periode.sql)
  // biar 1 hotel bisa punya banyak periode tanpa bikin ulang hotelnya. Di
  // sini di-flatten balik jadi 1 baris per (hotel, periode) — bentuknya
  // PERSIS kayak dulu (flat rate row) biar isiHotelDariMaster/
  // toggleOpsiHotelDariMaster/dropdown di bawah gak perlu berubah sama sekali,
  // cuma sumbernya aja yang nested sekarang.
  const [masterHotelNested, setMasterHotelNested] = useState([]);
  const masterHotel = masterHotelNested.flatMap(h => (h.periode || []).map(p => ({
    id: p.id, hotel_id: h.id, kota: h.kota, bintang: h.bintang, nama_hotel: h.nama_hotel, aktif: h.aktif,
    periode_mulai: p.periode_mulai, periode_selesai: p.periode_selesai, berlaku_sampai: p.berlaku_sampai,
    rate_double: p.rate_double, rate_triple: p.rate_triple, rate_quad: p.rate_quad, mata_uang: p.mata_uang,
  })));
  const [masterTiket, setMasterTiket] = useState([]);
  // Pre-filter Direct/Transit buat checklist/dropdown "Isi dari Master"
  // Tiket Pesawat di bawah — pilih rute-nya DULU baru daftar Master yang
  // kebuka nyesuain, gak nyampur direct+transit jadi 1 daftar gede
  // (dikonfirmasi user 2026-08-18).
  const [filterRuteTiket, setFilterRuteTiket] = useState('direct');
  useEffect(() => {
    fetch('/api/admin/master-hotel').then(r => r.json()).then(d => setMasterHotelNested(d.hotel || [])).catch(() => {});
    fetch('/api/admin/master-tiket-rate?aktif=1').then(r => r.json()).then(d => setMasterTiket(d.rate || [])).catch(() => {});
  }, []);

  // Master Kurs (SAR/USD -> IDR, dikelola di Pengaturan Umum) — KHUSUS
  // Kalkulator Estimasi Publik (showOpsiPublik), gantiin kurs manual per-
  // template. Kalkulator publik itu estimasi & bisa berubah seiring waktu,
  // jadi kursnya narik LIVE dari sini, auto-sync ke shared.kurs_* biar
  // preview HPP/PDF di editor ini match — sumber kebenaran ASLI buat harga
  // beneran ke jamaah tetap query live lagi di hitung/route.js, bukan dari
  // shared yang kesimpen (dikonfirmasi user 2026-08-18). Costing Program
  // internal (showOpsiPublik=false) TIDAK kena ini — kurs-nya tetap manual
  // & terkunci per program, gak disentuh sama sekali.
  const [masterKurs, setMasterKurs] = useState(null);
  useEffect(() => {
    if (!showOpsiPublik) return;
    fetch('/api/pengaturan').then(r => r.json()).then(d => setMasterKurs(d.pengaturan || null)).catch(() => {});
  }, [showOpsiPublik]);
  useEffect(() => {
    if (!showOpsiPublik || !masterKurs) return;
    if (Number(shared.kurs_sar_idr) === Number(masterKurs.kurs_sar_idr) && Number(shared.kurs_usd_idr) === Number(masterKurs.kurs_usd_idr)) return;
    setS({ kurs_sar_idr: masterKurs.kurs_sar_idr, kurs_usd_idr: masterKurs.kurs_usd_idr });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOpsiPublik, masterKurs]);
  function labelMasterHotel(h) {
    const f = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    const periode = h.periode_mulai || h.periode_selesai ? ` (${f(h.periode_mulai) || '?'}–${f(h.periode_selesai) || '?'})` : '';
    const batas = h.periode_selesai || h.berlaku_sampai;
    const kadaluarsa = batas && new Date(batas) < new Date(new Date().toDateString()) ? '⚠️ KADALUARSA — ' : '';
    return `${kadaluarsa}Bintang ${h.bintang} — ${h.nama_hotel}${periode} — ${Number(h.rate_double).toLocaleString('id-ID')}/${Number(h.rate_triple).toLocaleString('id-ID')}/${Number(h.rate_quad).toLocaleString('id-ID')} ${h.mata_uang}`;
  }
  function isiHotelDariMaster(paket, kota, masterId) {
    const m = masterHotel.find(h => String(h.id) === String(masterId));
    if (!m) return;
    setH(paket, {
      [`${kota}_nama`]: m.nama_hotel, [`${kota}_rate_double`]: m.rate_double,
      [`${kota}_rate_triple`]: m.rate_triple, [`${kota}_rate_quad`]: m.rate_quad, [`${kota}_mata_uang`]: m.mata_uang,
    });
  }
  // Sama pola kayak isiHotelDariMaster, buat baris Hotel Mix (custom) —
  // UNCONDITIONAL kayak Hotel Fix (internal Costing Program & Kalkulator
  // Estimasi Publik dua-duanya kepakai, dikonfirmasi user 2026-08-18: "kenapa
  // yang diperlakuin ke publik doang, di internal juga"). Murni convenience
  // isi cepat — field Nama/Bintang tetap bebas diketik manual buat hotel di
  // luar Master (mis. Dubai/negara lain), gak dipaksa.
  function isiHotelDaftarDariMaster(idx, masterId) {
    const m = masterHotel.find(h => String(h.id) === String(masterId));
    if (!m) return;
    ubahHotelDaftar(idx, { nama: m.nama_hotel, bintang: m.bintang, rate_double: m.rate_double, rate_triple: m.rate_triple, rate_quad: m.rate_quad, mata_uang: m.mata_uang });
  }
  function labelMasterTiket(t) {
    const f = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    const periode = t.periode_mulai || t.periode_selesai ? ` (${f(t.periode_mulai) || '?'}–${f(t.periode_selesai) || '?'})` : '';
    const negaraTransit = t.rute === 'transit' && t.negara_transit_id ? ` via ${katalogModul.find(m => m.id === t.negara_transit_id)?.nama || '?'}` : '';
    const rute = t.rute ? ` [${t.rute === 'direct' ? 'Direct' : 'Transit'}${negaraTransit}]` : '';
    const batas = t.periode_selesai || t.berlaku_sampai;
    const kadaluarsa = batas && new Date(batas) < new Date(new Date().toDateString()) ? '⚠️ KADALUARSA — ' : '';
    return `${kadaluarsa}${t.nama_rute}${rute}${periode} — ${Number(t.rate).toLocaleString('id-ID')} ${t.mata_uang}`;
  }
  function tambahTiketDariMaster(masterId) {
    const m = masterTiket.find(t => String(t.id) === String(masterId));
    if (!m) return;
    setS({ tiket_pesawat_list: [...(shared.tiket_pesawat_list || []), { nama: m.nama_rute, rate: m.rate, mata_uang: m.mata_uang, rute: m.rute || null, master_id: m.id }] });
  }
  // Checklist "opsi aktif" khusus Kalkulator Estimasi Publik — beda dari
  // tambahTiketDariMaster (nambah 1 baris manual) di atas, ini nyalain/
  // matiin baris tiket_pesawat_list yang KETAUTAN ke suatu master_id, biar
  // status "aktif"-nya kebaca balik lewat centang (bandingin master_id, gak
  // hapus baris manual lain yang gak ketaut master).
  function toggleTiketDariMaster(m) {
    const ada = tiketRows.some(t => t.master_id === m.id);
    if (ada) setS({ tiket_pesawat_list: tiketRows.filter(t => t.master_id !== m.id) });
    else setS({ tiket_pesawat_list: [...(shared.tiket_pesawat_list || []), { nama: m.nama_rute, rate: m.rate, mata_uang: m.mata_uang, rute: m.rute || null, master_id: m.id }] });
  }
  // Sama pola kayak toggleTiketDariMaster, buat Opsi Hotel Alternatif
  // (per paket per kota) — checklist Master Hotel yang match kota-nya.
  function toggleOpsiHotelDariMaster(paket, kota, m) {
    const opsi = opsiHotel(paket, kota);
    const ada = opsi.some(o => o.master_id === m.id);
    if (ada) setH(paket, { [opsiKey(kota)]: opsi.filter(o => o.master_id !== m.id) });
    else setH(paket, { [opsiKey(kota)]: [...opsi, { nama: m.nama_hotel, rate_double: m.rate_double, rate_triple: m.rate_triple, rate_quad: m.rate_quad, mata_uang: m.mata_uang, master_id: m.id, bintang: m.bintang }] });
  }

  // Modul negara (Dubai/Turkey dkk) dipakai bareng lintas jenis program yang
  // diizinkan admin (`boleh_modul_negara` di jenis_program_master, dulu
  // hardcode "selain umroh_regular" — dikonfirmasi user 2026-07-27, sekarang
  // admin bisa atur sendiri per kategori). "Ada leg Mekkah/Madinah" (dulu
  // hardcode `=== 'wisata'`) juga lookup flag (`punya_umroh`) yang sama.
  const jenisProgramAktif = katalogJenisProgram.find(j => j.value === shared.jenis_program);
  const modulNegaraTersedia = jenisProgramAktif?.boleh_modul_negara ? katalogModul : [];
  const isWisata = jenisProgramAktif ? !jenisProgramAktif.punya_umroh : false;
  // 'publik' cuma valid kalau embedding-nya beneran ngizinin (kalkulator-
  // template/page.jsx) — di program-costing/form Program dipaksa 'tetap'
  // biarpun kebetulan ada sisa data lama shared.modul_negara_mode='publik'.
  const modulNegaraMode = showOpsiPublik && shared.modul_negara_mode === 'publik' ? 'publik' : 'tetap';
  const modulPilihanPublik = Array.isArray(shared.modul_pilihan_publik) ? shared.modul_pilihan_publik : [];

  // Modul negara terpilih — bisa lebih dari 1 (mis. Dubai + Turkey dalam 1
  // trip). Tiap entry {modul_negara_id, hari, tanggal, hotel_star, city_tour_opsi}.
  const modulTerpilih = modulTambahanArray(shared);
  function tambahModul() {
    setS({ modul_tambahan: [...modulTerpilih, { modul_negara_id: '' }] });
  }
  function ubahModul(idx, patch) {
    setS({ modul_tambahan: modulTerpilih.map((m, i) => i === idx ? { ...m, ...patch } : m) });
  }
  function hapusModul(idx) {
    setS({ modul_tambahan: modulTerpilih.filter((_, i) => i !== idx) });
  }

  // Itinerary hari-hari di modul negara (Dubai/Turkey dkk) — dipakai sebagai
  // TEKS AWAL doang begitu modul dipilih. Begitu udah nempel di Program ini,
  // teksnya jadi hak Program itu sendiri: bisa diedit bebas dari sini tanpa
  // ngubah modul aslinya, dan gak bakal keganti otomatis kalau modul-nya
  // diedit belakangan (sama prinsipnya kayak harga yang udah dikunci —
  // dikonfirmasi user 2026-07-28). Override tersimpan di shared.itinerary_modul,
  // sejajar index-nya sama itineraryDariModul/negaraDariModul di bawah.
  const itineraryDariModul = modulTerpilih.flatMap(entry => {
    const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
    const arr = itineraryHariModul(modul, entry.hari, entry.city_tour_opsi);
    if (Array.isArray(arr) && arr.length > 0) return arr;
    return Array.from({ length: Number(entry.hari) || 0 }, () => '');
  });
  function teksModulHari(i, fallback) {
    const override = shared.itinerary_modul;
    return Array.isArray(override) && override[i] !== undefined && override[i] !== null ? override[i] : fallback;
  }
  function ubahItineraryModul(i, val) {
    const arr = Array.isArray(shared.itinerary_modul) ? [...shared.itinerary_modul] : [];
    arr[i] = val;
    setS({ itinerary_modul: arr });
  }
  // Nama negara per baris hari (sejajar sama itineraryDariModul) — dipakai
  // buat label itinerary, biar keliatan "Dubai" bukan "Negara Tambahan" yang
  // gak informatif.
  const negaraDariModul = modulTerpilih.flatMap(entry => {
    const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
    const arrModul = itineraryHariModul(modul, entry.hari, entry.city_tour_opsi);
    const jumlahHari = arrModul.length > 0 ? arrModul.length : (Number(entry.hari) || 0);
    return Array.from({ length: jumlahHari }, () => modul?.nama || 'Negara Tambahan');
  });

  // Total hari efektif buat preview itinerary/HPP di editor ini sendiri —
  // normalnya ya shared.total_hari_program (field manual di atas), TAPI
  // kalau sembunyikanTotalHari (Kalkulator Acuan, field-nya disembunyikan
  // karena WAJIB pakai opsi durasi) dipakai opsi durasi PERTAMA yang admin
  // isi. Publik beneran (kalkulatorPublik.js) udah punya logikanya sendiri
  // (override total_hari_program dari durasi yang jamaah pilih) — ini
  // MURNI buat preview di layar admin biar gak keliatan kosong melompong.
  const totalHariEfektif = sembunyikanTotalHari
    ? (Number((shared.durasi_opsi || [])[0]?.hari) || 0)
    : (Number(shared.total_hari_program) || 0);

  // Kombinasi Umroh + Modul Negara (mis. Umroh Plus) — hari Umroh (diketik
  // manual, sejumlah Total Hari Program) digabung sama hari modul (otomatis
  // dari itinerary modul), urutannya ikut toggle "Umroh dulu". Gak dipakai
  // buat Wisata murni (gak ada leg Umroh) atau kalau belum ada modul dipilih.
  const totalHariUmroh = totalHariEfektif;
  // Malam Mekkah/Madinah "Dinamis" (jamaah bebas isi sendiri) — gak mungkin
  // admin nulis itinerary day-by-day yang match SEMUA kombinasi malam yang
  // mungkin jamaah pilih. Kalau leg Umroh-nya BERDIRI SENDIRI (gak ada
  // negara tambahan), itinerary section-nya gak ditampilin ke jamaah sama
  // sekali (lihat kalkulatorPublik.js#itineraryUntukTemplate) — jadi di sini
  // pun gak usah dikasih kolom edit, percuma. Kalau DIGABUNG sama modul
  // negara (mis. Umroh Plus), leg Umroh-nya diringkas 1 baris "Program
  // Umroh" (bebas diedit admin), baru diikuti itinerary Modul Negara apa
  // adanya — dikonfirmasi user 2026-08-18.
  const malamModeDinamisPublik = showOpsiPublik && (shared.malam_mode || 'dinamis') === 'dinamis';
  const blokUmroh = malamModeDinamisPublik
    ? [{ editable: true, source: 'umroh', idx: 0, label: 'Umroh', teks: (shared.itinerary && shared.itinerary[0]) || 'Program Umroh — ibadah di Mekkah & Madinah.' }]
    : Array.from({ length: totalHariUmroh }, (_, i) => ({
        editable: true, source: 'umroh', idx: i, label: 'Umroh', teks: (shared.itinerary && shared.itinerary[i]) || '',
      }));
  const blokModul = itineraryDariModul.map((teksDefault, i) => ({
    editable: true, source: 'modul', idx: i, label: negaraDariModul[i] || 'Negara Tambahan', teks: teksModulHari(i, teksDefault),
  }));
  const pakaiGabungan = !isWisata && modulTerpilih.length > 0;
  const gabunganHari = pakaiGabungan
    ? (shared.umroh_dulu !== false ? [...blokUmroh, ...blokModul] : [...blokModul, ...blokUmroh])
    : [];

  // Itinerary flat {hari, label, teks}[] — sumber tunggal buat PDF (lihat
  // unduhPdf), nyamain persis 3 cabang logika yang dipakai editor on-screen
  // di atas (isWisata murni modul / gabungan Umroh+Modul / manual polos).
  const itineraryUntukPdf = isWisata
    ? itineraryDariModul.map((teksDefault, i) => ({ hari: i + 1, label: negaraDariModul[i] || null, tanggal: labelHari(tanggalBerangkat, i), teks: teksModulHari(i, teksDefault) }))
    : pakaiGabungan
      ? gabunganHari.map((h, i) => ({ hari: i + 1, label: h.label, tanggal: labelHari(tanggalBerangkat, i), teks: h.teks }))
      : Array.from({ length: totalHariEfektif }, (_, i) => ({ hari: i + 1, label: null, tanggal: labelHari(tanggalBerangkat, i), teks: (shared.itinerary && shared.itinerary[i]) || '' }));

  // HPP dihitung per bintang (hotel & malam beda per baris tabel Hotel di
  // bawah) — preview-nya nempel di bawah Tiket Pesawat/Visa/Biaya Lain-lain
  // (live update begitu Item Master/Malam Hotel/Hotel diisi belakangan).
  const hppPerPaket = {};
  for (const paket of PAKET) {
    // pakaiUiPublikSederhana: rate hotel gak lagi diketik di tabel per-
    // Bintang (disembunyikan), tapi dari opsi HOTEL PERTAMA yang dicentang
    // di checklist "Opsi Hotel" bucket 'deluxe' (lihat toggleOpsiHotelDariMaster)
    // — cuma representatif buat preview (jamaah bisa pilih opsi LAIN di
    // publik, harga beneran dihitung ulang server-side per opsi yang
    // dipilih), margin pakai Margin Flat, bukan per-paket lagi.
    const opsiMekkah0 = pakaiUiPublikSederhana ? opsiHotel('deluxe', 'mekkah')[0] : null;
    const opsiMadinah0 = pakaiUiPublikSederhana ? opsiHotel('deluxe', 'madinah')[0] : null;
    const h = hotel[paket];
    const stateDasarPaket = {
      ...shared,
      hotel_mekkah_rate_double: opsiMekkah0?.rate_double ?? h.mekkah_rate_double, hotel_mekkah_rate_triple: opsiMekkah0?.rate_triple ?? h.mekkah_rate_triple, hotel_mekkah_rate_quad: opsiMekkah0?.rate_quad ?? h.mekkah_rate_quad,
      hotel_mekkah_malam: malam.mekkah, hotel_mekkah_mata_uang: opsiMekkah0?.mata_uang ?? h.mekkah_mata_uang,
      hotel_madinah_rate_double: opsiMadinah0?.rate_double ?? h.madinah_rate_double, hotel_madinah_rate_triple: opsiMadinah0?.rate_triple ?? h.madinah_rate_triple, hotel_madinah_rate_quad: opsiMadinah0?.rate_quad ?? h.madinah_rate_quad,
      hotel_madinah_malam: malam.madinah, hotel_madinah_mata_uang: opsiMadinah0?.mata_uang ?? h.madinah_mata_uang,
      hotel_list: pakaiHotelMix ? hotelList : null,
    };
    // CATATAN: margin_mode/margin_persen (Custom Hotel per Kota) SENGAJA
    // TIDAK dipakai di sini — tabel preview ini murni buat 3 paket tetap
    // (Deluxe/Eksekutif/Signature), yang TETAP pakai Margin (Rp) per baris
    // apa adanya (tidak diubah sama sekali). Preview harga buat kombinasi
    // custom hotel dihitung terpisah, server-side, saat checkout — bukan di
    // sini (gak ada "1 kombinasi representatif" yang bisa diwakili 3 baris
    // paket ini, pilihannya kombinatorial per index opsi hotel).
    hppPerPaket[paket] = hitungHppKamar({
      ...stateDasarPaket,
      margin_rate: pakaiUiPublikSederhana ? shared.margin_flat : margin[paket],
    }, katalogModul);
  }

  // Kalau HPP Quad/Triple/Double kebetulan SAMA PERSIS di semua paket aktif
  // (mis. custom package Hotel Mix yang emang sengaja diisi 1 rate rata buat
  // semua tipe kamar) — gak usah tampilin 3 kolom identik yang bikin ribet
  // dibaca, cukup 1 kolom gabungan. Kalau beda (rate quad/triple/double-nya
  // beda beneran), tetap kepisah 3 kolom kayak biasa.
  const kamarSama = paketAktif.every(paket => {
    const hpp = hppPerPaket[paket];
    return KAMAR.every(kamar => hpp[kamar] === hpp[KAMAR[0]]);
  });
  const kolomKamar = kamarSama ? ['semua'] : KAMAR;
  const labelKolomKamar = kamarSama ? { semua: 'Semua Tipe Kamar' } : KAMAR_LABEL;

  // Cetak/download PDF — 5 centangan independen (lihat checkbox di bawah),
  // bukan dropdown mode gabungan lagi (dulu 4 opsi pre-kombinasi yang makin
  // ribet tiap nambah kombinasi baru):
  // - rincianBiaya : cost breakdown + modul negara + tiket pesawat (internal, buka angka cost per item).
  // - hpp          : kolom HPP per kamar di tabel ringkasan.
  // - ujroh        : kolom Ujroh (margin/komisi) per kamar di tabel ringkasan.
  // - jual         : kolom Jual (harga ke jamaah) per kamar di tabel ringkasan.
  //   ^ HPP/Ujroh/Jual 3 hal beda (cost / margin / harga ke jamaah), makanya
  //     3 centangan terpisah — bisa nyalain kombinasi apa aja, mis. cuma Jual
  //     doang buat dikirim ke jamaah tanpa buka cost/margin internal.
  // - infoProgram  : info program + itinerary + include/exclude.
  // Tabel ringkasan CUMA muncul kalau salah satu dari hpp/ujroh/jual
  // dicentang, kolomnya ngikutin yang dicentang aja.
  // Item costing yang ditampilkan CUMA yang aktif & nilainya != 0 — item
  // nonaktif/nol di-skip total (bukan ditampilin abu-abu kayak sebelumnya),
  // biar gak ribet dibaca pas nyari selisih. Lewat window.print() (bukan lib
  // PDF eksternal) — admin tinggal pilih "Simpan sebagai PDF" di dialog print.
  // SEMPAT dicoba dirender jadi gambar (html2canvas+jsPDF) biar layoutnya
  // "terkunci" pas diimpor ulang ke Canva, tapi malah nambah bug baru (baris
  // tabel kepotong di batas halaman) — di-revert balik ke sini, versi HTML
  // asli ini yang paling rapih (dikonfirmasi user 2026-07-28).
  function unduhPdf({ rincianBiaya, hpp: pakaiHpp, ujroh: pakaiUjroh, jual: pakaiJual, infoProgram }) {
    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const namaJenis = katalogJenisProgram.find(j => j.value === shared.jenis_program)?.label || shared.jenis_program;
    const pakaiCosting = rincianBiaya;
    const pakaiDetail = infoProgram;

    let htmlBreakdown = '', htmlModulNegara = '', htmlTiket = '', htmlHpp = '';
    if (pakaiCosting) {
      const kelompokList = [...new Set((shared.items || []).map(it => it.kelompok))];
      const subtotal = subtotalPerKelompok(shared, katalogModul);
      const tlTiket = tlShareTiket(shared);
      const tlVisa = tlShareVisa(shared);
      // "Cost Tour Leader" (Flight/Visa TL, DIHITUNG OTOMATIS dari pax_tl —
      // BUKAN item Master manual) gak pernah kebuka di rincian kalau admin
      // gak kebetulan punya item ber-kelompok persis "Cost Tour Leader" —
      // kelompokList di atas cuma narik dari shared.items, jadi bucket-nya
      // gak pernah kebentuk buat di-loop biarpun subtotalPerKelompok udah
      // bener ngitungnya. Tambahin manual di sini biar section-nya SELALU
      // muncul begitu ada Flight/Visa TL (dikonfirmasi user 2026-08-18,
      // "cost tour leader di internal rusak, gak kehitung flight dan visa").
      if ((tlTiket > 0 || tlVisa > 0) && !kelompokList.includes('Cost Tour Leader')) kelompokList.push('Cost Tour Leader');
      htmlBreakdown = kelompokList.map(k => {
        const barisItem = (shared.items || [])
          .map(it => ({ nama: it.nama, nilai: nilaiItem(it, shared, katalogModul), kelompok: it.kelompok, aktif: itemAktif(it.trigger_kunci, shared) }))
          .filter(it => it.kelompok === k && it.aktif && it.nilai !== 0)
          .map(it => `<tr><td>${it.nama || '(tanpa nama)'}</td><td style="text-align:right">${rp(it.nilai)}</td></tr>`).join('')
          + (k === 'Cost Tour Leader' ? [
            tlTiket > 0 ? `<tr><td>Tiket Flight TL</td><td style="text-align:right">${rp(tlTiket)}</td></tr>` : '',
            tlVisa > 0 ? `<tr><td>Visa Umroh TL</td><td style="text-align:right">${rp(tlVisa)}</td></tr>` : '',
          ].join('') : '');
        if (!barisItem) return '';
        const sub = subtotal.find(s => s.kelompok === k)?.total || 0;
        return `<h3>${k}</h3><table class="tbl">${barisItem}<tr class="subtotal"><td>Subtotal</td><td style="text-align:right">${rp(sub)}</td></tr></table>`;
      }).join('');

      htmlModulNegara = modulTerpilih.map(entry => {
        const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
        if (!modul) return '';
        const tier = cariTierModulNegara(modul, entry, Number(shared.pax_jamaah) || 0);
        if (!tier) return '';
        const nilaiTarif = nilaiTarifModul(modul, shared, entry);
        const rincian = rincianAddonModul(modul, shared, entry).filter(r => r.nilai !== 0);
        const rows = [
          `<tr><td>Tarif dasar (${modul.mata_uang} ${Number(tier.harga_per_pax).toLocaleString('id-ID')}/pax)</td><td style="text-align:right">${rp(nilaiTarif)}</td></tr>`,
          ...rincian.map(r => `<tr><td>${r.nama} (${r.mata_uang} ${Number(r.harga_per_unit).toLocaleString('id-ID')} × ${r.qtyLabel}${r.sertakan_tl ? ', termasuk TL' : ', tanpa TL'})</td><td style="text-align:right">${rp(r.nilai)}</td></tr>`),
        ].join('');
        const subModul = nilaiTarif + rincian.reduce((s, r) => s + r.nilai, 0);
        return `<h3>${modul.nama} (${entry.hari} Hari)</h3><table class="tbl">${rows}<tr class="subtotal"><td>Subtotal</td><td style="text-align:right">${rp(subModul)}</td></tr></table>`;
      }).join('');

      htmlTiket = tiketRows.length > 0 ? `<h3>Tiket Pesawat</h3><table class="tbl">${tiketRows.map(t =>
        `<tr><td>${t.nama || 'Tiket Pesawat'}</td><td style="text-align:right">${t.mata_uang || 'IDR'} ${Number(t.rate || 0).toLocaleString('id-ID')}</td></tr>`
      ).join('')}</table>` : '';
    }

    if (pakaiHpp || pakaiUjroh || pakaiJual) {
      const kolomPerKamar = (pakaiHpp ? 1 : 0) + (pakaiUjroh ? 1 : 0) + (pakaiJual ? 1 : 0);
      const judulBagian = [pakaiHpp && 'HPP', pakaiUjroh && 'Ujroh', pakaiJual && 'Jual'].filter(Boolean).join(' & ');
      htmlHpp = `<h3>${judulBagian} per Kamar</h3>
        <table class="tbl">
          <tr><th>Bintang / Paket</th>${kolomKamar.map(k => `<th colspan="${kolomPerKamar}">${labelKolomKamar[k]}</th>`).join('')}</tr>
          <tr><th></th>${kolomKamar.map(() => [
            pakaiHpp && '<th style="text-align:right">HPP</th>',
            pakaiUjroh && '<th style="text-align:right">Ujroh</th>',
            pakaiJual && '<th style="text-align:right">Jual</th>',
          ].filter(Boolean).join('')).join('')}</tr>
          ${paketAktif.map((paket) => {
            const i = PAKET.indexOf(paket);
            const hpp = hppPerPaket[paket];
            const label = pakaiUiPublikSederhana ? 'Estimasi (opsi hotel pertama)' : pakaiHotelMix ? 'Harga Paket (Custom)' : `Bintang ${i + 3} (${PAKET_LABEL[paket]})`;
            // CATATAN: komisi_mode/komisi_persen (Custom Hotel per Kota)
            // SENGAJA TIDAK dipakai di sini — lihat catatan margin di hppPerPaket.
            const komisiPaket = pakaiUiPublikSederhana ? (Number(shared.komisi_flat) || 0) : (Number(komisi[paket]) || 0);
            return `<tr><td>${label}</td>${kolomKamar.map(kolom => {
              const kamar = kolom === 'semua' ? KAMAR[0] : kolom;
              return [
                pakaiHpp && `<td style="text-align:right">${rp(hpp[kamar])}</td>`,
                pakaiUjroh && `<td style="text-align:right">${rp(komisiPaket)}</td>`,
                pakaiJual && `<td style="text-align:right;font-weight:bold">${rp(bulatkanKeAtas(hpp[kamar] + komisiPaket, pembulatan))}</td>`,
              ].filter(Boolean).join('');
            }).join('')}</tr>`;
          }).join('')}
        </table>`;
    }

    let htmlInfo = '', htmlItinerary = '', htmlIncludeExclude = '';
    if (pakaiDetail) {
      const baris = [];
      baris.push(['Jenis Program', namaJenis]);
      baris.push(['Total Hari Program', `${totalHariEfektif} Hari`]);
      baris.push(['Pax Jamaah', shared.pax_jamaah || 0]);
      if (Number(shared.pax_tl) > 0) baris.push(['Pax Tour Leader', shared.pax_tl]);
      if (!isWisata && Number(shared.pax_mutawwif) > 0) baris.push(['Pax Mutawwif', shared.pax_mutawwif]);
      if (!isWisata && Number(shared.pax_mutawwifah) > 0) baris.push(['Pax Mutawwifah', shared.pax_mutawwifah]);
      if (!isWisata && (transportasiAuto || shared.transportasi_pilihan)) {
        const label = { bus: 'Bus', hiace: 'Hi-Ace', mobil: 'Mobil' };
        baris.push(['Transportasi', transportasiAuto ? `${label[transportasiAuto]} (otomatis, ${paxJamaah} pax)` : shared.transportasi_pilihan]);
      }
      if (!isWisata && Number(shared.haramain_express) > 0) baris.push(['Haramain Express', Number(shared.haramain_express) === 2 ? 'PP (Pulang-Pergi)' : 'One Way']);
      const cityTour = [shared.city_tour_mekkah && 'Mekkah', shared.city_tour_madinah && 'Madinah', shared.city_tour_thaif && 'Thaif'].filter(Boolean);
      if (!isWisata && cityTour.length > 0) baris.push(['City Tour', cityTour.join(', ')]);
      if (pakaiHotelMix) {
        for (const h of hotelList) if (h.nama) baris.push([`Hotel — ${h.nama}`, `${h.bintang || '-'}★, ${h.malam || 0} malam`]);
      } else {
        if (hotel.deluxe?.mekkah_nama) baris.push(['Hotel Mekkah', `${hotel.deluxe.mekkah_nama}, ${malam.mekkah || 0} malam`]);
        if (hotel.deluxe?.madinah_nama) baris.push(['Hotel Madinah', `${hotel.deluxe.madinah_nama}, ${malam.madinah || 0} malam`]);
      }
      for (const entry of modulTerpilih) {
        const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
        if (modul?.info_hotel) baris.push([`Hotel ${modul.nama}`, modul.info_hotel]);
      }
      htmlInfo = `<h3>Info Program</h3><table class="tbl">${baris.map(([k, v]) => `<tr><td style="width:40%">${k}</td><td>${v}</td></tr>`).join('')}</table>`;

      // Itinerary diketik multi-baris per poin (Enter tiap poin) — kalau
      // dibiarin mentah, HTML nyatuin semua newline jadi 1 paragraf padet
      // (whitespace collapse bawaan browser). Ganti \n jadi <br/> biar poin-
      // poinnya kebawa turun ke bawah persis kayak pas diketik.
      const nl2br = (s) => String(s || '').split('\n').join('<br/>');
      htmlItinerary = itineraryUntukPdf.length > 0 ? `<h3>Itinerary</h3><table class="tbl">${itineraryUntukPdf.map(h =>
        `<tr><td style="width:20%">Hari ${h.hari}${h.label ? ` — ${h.label}` : ''}${h.tanggal ? `<div style="font-weight:normal;color:#888;font-size:0.85em">${h.tanggal}</div>` : ''}</td><td>${h.teks ? nl2br(h.teks) : '-'}</td></tr>`
      ).join('')}</table>` : '';

      // Include/Exclude diketik manual admin DIGABUNG sama include/exclude
      // yang nempel di tiap Modul Negara yang dipilih (lihat includeExcludeModul
      // di kalkulatorBiaya.js) — biar gak perlu ngetik ulang "Tiket masuk Burj
      // Khalifa" dkk tiap bikin costing baru yang pakai Dubai.
      const includeManual = (shared.include_items || '').split('\n').map(s => s.trim()).filter(Boolean);
      const excludeManual = (shared.exclude_items || '').split('\n').map(s => s.trim()).filter(Boolean);
      const includeModul = modulTerpilih.flatMap(entry => includeExcludeModul(katalogModul.find(m => String(m.id) === String(entry.modul_negara_id)), entry.city_tour_opsi).include);
      const excludeModul = modulTerpilih.flatMap(entry => includeExcludeModul(katalogModul.find(m => String(m.id) === String(entry.modul_negara_id)), entry.city_tour_opsi).exclude);
      const include = [...includeManual, ...includeModul];
      const exclude = [...excludeManual, ...excludeModul];
      if (include.length > 0 || exclude.length > 0) {
        htmlIncludeExclude = `<h3>Include / Exclude</h3><table class="tbl"><tr><th>✅ Termasuk</th><th>❌ Tidak Termasuk</th></tr>
          <tr><td>${include.map(s => `• ${s}`).join('<br/>') || '-'}</td><td>${exclude.map(s => `• ${s}`).join('<br/>') || '-'}</td></tr></table>`;
      }
    }

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${shared.nama || 'Costing Program'}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;padding:24px;}
        h1{font-size:18px;margin:0 0 2px;} h2{font-size:12px;color:#666;font-weight:normal;margin:0 0 12px;}
        h3{font-size:12px;background:#f0f0f0;padding:5px 8px;margin:16px 0 4px;}
        table.tbl{width:100%;border-collapse:collapse;margin-bottom:2px;}
        table.tbl td,table.tbl th{border:1px solid #000;padding:4px 6px;text-align:left;}
        tr.subtotal{font-weight:bold;background:#f7f7f7;}
        .btn-download{position:fixed;top:16px;right:16px;background:#1A4FA0;color:#fff;border:none;padding:10px 18px;
          border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);}
        .btn-download:hover{background:#0E2F6E;}
        @media print{ @page{size:A4;margin:16mm;} .btn-download{display:none;} }
      </style></head><body>
      <button type="button" class="btn-download" onclick="window.print()">📄 Download PDF</button>
      <h1>${shared.nama || 'Costing Program'}</h1>
      <h2>${namaJenis} — dicetak ${tanggal}</h2>
      ${htmlInfo}
      ${htmlItinerary}
      ${htmlIncludeExclude}
      ${htmlBreakdown}
      ${htmlModulNegara}
      ${htmlTiket}
      ${htmlHpp}
      <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 300); });</script>
    </body></html>`;

    // Buka tab kosong DULU (sinkron, langsung di dalam click handler — biar
    // gak keblokir popup blocker), baru tulis HTML-nya lewat document.write.
    // Sebelumnya pakai Blob + Object URL, tapi itu bikin bug di Safari/WebKit:
    // tab baru gak bisa akses blob: URL yang dibikin di window/tab lain, jadi
    // tab-nya nyangkut putih/loading terus. document.write nulis langsung ke
    // tab yang baru dibuka, gak lewat URL sama sekali, jadi gak kena masalah itu.
    const w = window.open('', '_blank');
    if (!w) { alert('Popup diblokir browser — izinkan popup buat halaman ini dulu.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="mb-4">
      {showToggle && (
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => onToggle(false)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg ${!aktif ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>Input Manual</button>
          <button type="button" onClick={() => onToggle(true)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg ${aktif ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🧮 Pakai Costing Program (dari Template)</button>
        </div>
      )}
      {aktif && (
        <div className="bg-white border-2 border-[#1A4FA0]/20 rounded-xl p-4 space-y-4">
          {showTemplatePicker && (
            templateList.length > 0 ? (
              <div className="bg-[#E8F0FB] rounded-xl p-3 border-2 border-[#1A4FA0]/30">
                <label className={`${lbl} font-bold text-[#0E2F6E]`}>📋 Mulai dari Template yang Sudah Ada</label>
                <select onChange={e => pakaiTemplate(e.target.value)} defaultValue="" className={inp}>
                  <option value="">— Kosong (isi manual dari nol) —</option>
                  {templateList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                </select>
              </div>
            ) : (
              <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                Belum ada template tersimpan — bikin dulu di halaman{' '}
                <a href="/admin/program-costing" className="text-[#1A4FA0] font-semibold hover:underline">Costing Program</a>,
                nanti template-nya bisa langsung dipilih di sini.
              </div>
            )
          )}

          {!hideForm && <>
          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-xs font-bold text-amber-700 mb-2">💱 Kurs Konversi</div>
            {showOpsiPublik ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Kurs SAR → IDR</label>
                    <div className={`${inp} bg-gray-100 text-gray-500`}>{masterKurs ? Number(masterKurs.kurs_sar_idr).toLocaleString('id-ID') : '...'}</div>
                  </div>
                  <div>
                    <label className={lbl}>Kurs USD → IDR</label>
                    <div className={`${inp} bg-gray-100 text-gray-500`}>{masterKurs ? Number(masterKurs.kurs_usd_idr).toLocaleString('id-ID') : '...'}</div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">Otomatis dari Master Kurs — berubah kalau kursnya diubah di <a href="/admin/master-data?tab=kurs" target="_blank" className="text-[#1A4FA0] font-semibold hover:underline">Master Data → Kurs</a>, gak diketik manual di sini (kalkulator ini sifatnya estimasi).</div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Kurs SAR → IDR</label>
                  <input type="number" value={shared.kurs_sar_idr} onChange={e => setS({ kurs_sar_idr: e.target.value })} placeholder="5000" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Kurs USD → IDR</label>
                  <input type="number" value={shared.kurs_usd_idr} onChange={e => setS({ kurs_usd_idr: e.target.value })} placeholder="18000" className={inp} />
                </div>
              </div>
            )}
          </div>

          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-xs font-bold text-amber-700 mb-2">📋 Info Program</div>
            <div className="mb-3">
              <label className={lbl}>Jenis Program</label>
              <select value={shared.jenis_program || 'umroh_regular'} onChange={e => {
                // Ganti Jenis Program ke yang gak boleh Modul Negara (mis.
                // dari Umroh Plus ke Umroh Regular) — bersihin SEMUA sisa
                // data modul negara (modul_tambahan dkk), soalnya kalau
                // dibiarin nempel, itinerary MASIH nyisipin blok negara
                // yang udah gak relevan lagi biarpun section-nya sendiri
                // udah kesembunyi (dikonfirmasi user 2026-08-18, bug nyata).
                const barunya = katalogJenisProgram.find(j => j.value === e.target.value);
                const patch = { jenis_program: e.target.value };
                if (!barunya?.boleh_modul_negara) {
                  patch.modul_tambahan = [];
                  patch.itinerary_modul = [];
                  patch.modul_negara_mode = 'tetap';
                  patch.modul_pilihan_publik = [];
                }
                setS(patch);
              }} className={inp}>
                {katalogJenisProgram.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
            <div className={`grid grid-cols-2 ${isWisata ? '' : 'sm:grid-cols-3'} gap-2 mb-3`}>
              {!sembunyikanTotalHari && (
                <div>
                  <label className={lbl}>{modulTerpilih.length > 0 ? 'Total Hari Umroh (di luar hari negara tambahan)' : 'Total Hari Program'}</label>
                  <input type="number" value={shared.total_hari_program} onChange={e => setS({ total_hari_program: e.target.value })} placeholder="0" className={inp} />
                  <div className="text-[10px] text-gray-400 mt-1">Dipakai kalau jamaah gak pilih durasi sendiri di bawah (fallback/dasar hitung Item &quot;/Day&quot;).</div>
                </div>
              )}
              {!isWisata && (
                <div>
                  <label className={lbl}>Haramain Express</label>
                  <select value={shared.haramain_express || '0'} onChange={e => setS({ haramain_express: e.target.value })} className={inp}>
                    <option value="0">Tidak dipakai</option>
                    <option value="1">One Way</option>
                    <option value="2">PP (Pulang-Pergi)</option>
                  </select>
                </div>
              )}
              {!isWisata && (
                <div>
                  <label className={lbl}>Transportasi</label>
                  {transportasiAuto ? (
                    <div className={`${inp} bg-gray-100 text-gray-500`}>
                      {transportasiAuto === 'bus' ? '🚌 Bus' : transportasiAuto === 'hiace' ? '🚐 Hi-Ace' : '🚗 Mobil'} (otomatis, {paxJamaah} pax)
                    </div>
                  ) : (
                    <select value={shared.transportasi_pilihan || ''} onChange={e => setS({ transportasi_pilihan: e.target.value || null })} className={inp}>
                      <option value="">— Pilih —</option>
                      <option value="bus">Bus</option>
                      <option value="hiace">Hi-Ace</option>
                      <option value="mobil">Mobil</option>
                    </select>
                  )}
                </div>
              )}
            </div>
            {!isWisata && (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {TRIGGER_CHECKBOX.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={!!Number(shared[key])} onChange={e => setS({ [key]: e.target.checked ? 1 : 0 })} className="w-4 h-4 accent-[#1A4FA0]" />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="text-[10px] text-gray-400 mt-2">Field trigger di atas baru sebatas dicatat — belum otomatis narik item Master (nyusul).</div>
              </>
            )}
          </div>

          {!!jenisProgramAktif?.boleh_modul_negara && (
            <div className="bg-emerald-50 rounded-xl p-3">
              <div className="text-xs font-bold text-emerald-700 mb-2">🌍 Modul Negara Tambahan — {jenisProgramAktif.label}</div>

              {/* Toggle cuma tampil di Kalkulator Estimasi Publik — program
                  biasa (program-costing/form Program) itinerary-nya emang
                  harus 1 kombinasi tetap, gak ada mode "jamaah pilih sendiri". */}
              {showOpsiPublik && (
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={() => setS({ modul_negara_mode: 'tetap' })}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${(shared.modul_negara_mode || 'tetap') === 'tetap' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Tetap (admin tentuin)</button>
                  <button type="button" onClick={() => setS({ modul_negara_mode: 'publik' })}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${shared.modul_negara_mode === 'publik' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Pilihan Publik (jamaah pilih sendiri)</button>
                </div>
              )}

              {modulNegaraMode === 'publik' ? (
                <div>
                  <div className="text-[10px] text-gray-400 mb-2">Centang negara mana aja yang boleh dipilih jamaah — hari/bintang hotel/opsi city tour ditentuin jamaah sendiri pas isi kalkulator, bukan di sini.</div>
                  <div className="space-y-1.5">
                    {modulNegaraTersedia.map(m => {
                      const dicentang = modulPilihanPublik.includes(m.id);
                      return (
                        <label key={m.id} className="flex items-center gap-2 text-sm bg-white rounded-lg px-3 py-2 border border-emerald-100 cursor-pointer">
                          <input type="checkbox" checked={dicentang} className="w-4 h-4 accent-[#1A4FA0]"
                            onChange={() => setS({ modul_pilihan_publik: dicentang ? modulPilihanPublik.filter(id => id !== m.id) : [...modulPilihanPublik, m.id] })} />
                          {m.nama}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
              <>
              {modulNegaraTersedia.length === 0 && (
                <div className="text-[10px] text-gray-400 mb-2">Belum ada modul negara buat jenis program ini — kelola di halaman Costing Program.</div>
              )}
              <div className="space-y-2">
                {modulTerpilih.map((entry, idx) => {
                  const modul = katalogModul.find(m => String(m.id) === String(entry.modul_negara_id));
                  const tier = modul ? cariTierModulNegara(modul, entry, paxJamaah) : null;
                  return (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-emerald-100">
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          value={entry.modul_negara_id || ''}
                          onChange={e => ubahModul(idx, { modul_negara_id: e.target.value ? Number(e.target.value) : '', hari: '', tanggal: '', hotel_star: '', city_tour_opsi: '' })}
                          className={`${inp} flex-1`}
                        >
                          <option value="">— Pilih Modul Negara —</option>
                          {modulNegaraTersedia.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                        </select>
                        <button type="button" onClick={() => hapusModul(idx)} className="text-red-500 text-xs font-bold hover:underline shrink-0">Hapus</button>
                      </div>
                      {modul && (
                        <>
                          {modul.info_hotel && (
                            <div className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded px-2 py-1 mb-2 inline-block">🏨 {modul.info_hotel}</div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className={lbl}>Hari</label>
                              <select value={entry.hari || ''} onChange={e => ubahModul(idx, { hari: e.target.value })} className={inp}>
                                <option value="">— Pilih —</option>
                                {opsiUnik(modul.tiers, 'hari').map(v => <option key={v} value={v}>{v} Hari</option>)}
                              </select>
                            </div>
                            {!!modul.pakai_periode && (
                              <div>
                                <label className={lbl}>Tanggal Keberangkatan</label>
                                <input type="date" value={entry.tanggal || ''} onChange={e => { if (e.target.value) ubahModul(idx, { tanggal: e.target.value }); }} className={inp} />
                              </div>
                            )}
                            {!!modul.pakai_hotel_star && (
                              <div>
                                <label className={lbl}>Bintang Hotel</label>
                                <select value={entry.hotel_star || ''} onChange={e => ubahModul(idx, { hotel_star: e.target.value })} className={inp}>
                                  <option value="">— Pilih —</option>
                                  {opsiUnik(modul.tiers, 'hotel_star').map(v => <option key={v} value={v}>{v}★</option>)}
                                </select>
                              </div>
                            )}
                            {!!modul.pakai_city_tour_opsi && (
                              <div>
                                <label className={lbl}>Opsi City Tour</label>
                                <select value={entry.city_tour_opsi || ''} onChange={e => ubahModul(idx, { city_tour_opsi: e.target.value })} className={inp}>
                                  <option value="">— Pilih —</option>
                                  {opsiUnik(modul.tiers, 'city_tour_opsi').map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                          <div className="mt-2">
                            {tier ? (
                              <div className="text-xs text-emerald-800 bg-white/60 rounded-lg p-2 space-y-0.5">
                                {(() => {
                                  const paxJamaah = Number(shared.pax_jamaah) || 0;
                                  const paxTl = Number(shared.pax_tl) || 0;
                                  const paxBerbayar = paxBerbayarModul(modul, paxJamaah, paxTl);
                                  const nilaiTarif = nilaiTarifModul(modul, shared, entry);
                                  const rincian = rincianAddonModul(modul, shared, entry);
                                  return (
                                    <>
                                      <div className="flex justify-between font-semibold">
                                        <span>Tarif dasar ({modul.mata_uang} {Number(tier.harga_per_pax).toLocaleString('id-ID')} × {paxBerbayar} pax{paxBerbayar !== paxJamaah ? ' termasuk TL' : ''})</span>
                                        <span>{rp(nilaiTarif)}</span>
                                      </div>
                                      {rincian.map((r, i) => (
                                        <div key={i} className="flex justify-between text-gray-600">
                                          <span>{r.nama} ({r.mata_uang} {Number(r.harga_per_unit).toLocaleString('id-ID')} × {r.qtyLabel}{r.sertakan_tl ? ', termasuk TL' : ', tanpa TL'})</span>
                                          <span>{rp(r.nilai)}</span>
                                        </div>
                                      ))}
                                      <div className="flex justify-between font-bold border-t border-emerald-200 pt-1 mt-1">
                                        <span>Subtotal modul ini</span>
                                        <span>{rp(nilaiTarif + rincian.reduce((s, r) => s + r.nilai, 0))}</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="text-xs font-bold text-red-600">⚠ Tidak ada tarif untuk kombinasi ini — lengkapi pilihan di atas atau cek tabel tier modulnya.</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={tambahModul} className="text-xs font-bold text-emerald-700 hover:underline mt-2">+ Tambah Modul Negara (mis. negara ke-2)</button>
              {modulTerpilih.length > 0 && (
                <div className="text-xs font-bold text-emerald-800 bg-emerald-100 rounded-lg px-3 py-2 mt-2">
                  Total cost modul negara (semua negara terpilih): {rp(totalModulNegaraTerpilih(shared, katalogModul))}
                </div>
              )}
              </>
              )}
            </div>
          )}

          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-xs font-bold text-amber-700 mb-2">👥 Jumlah Pax</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {!showOpsiPublik && (
                <div>
                  <label className={lbl}>Jamaah (baseline internal)</label>
                  <input type="number" value={shared.pax_jamaah} onChange={e => setS({ pax_jamaah: e.target.value })} placeholder="0" className={inp} />
                </div>
              )}
              <div>
                <label className={lbl}>Tour Leader</label>
                <input type="number" value={shared.pax_tl} onChange={e => setS({ pax_tl: e.target.value })} placeholder="0" className={inp} />
              </div>
              {!isWisata && (
                <div>
                  <label className={lbl}>Mutawwif</label>
                  <input type="number" value={shared.pax_mutawwif} onChange={e => setS({ pax_mutawwif: e.target.value })} placeholder="0" className={inp} />
                </div>
              )}
              {!isWisata && (
                <div>
                  <label className={lbl}>Mutawwifah (Raudhah)</label>
                  <input type="number" value={shared.pax_mutawwifah} onChange={e => setS({ pax_mutawwifah: e.target.value })} placeholder="0" className={inp} />
                </div>
              )}
              {!isWisata && (
                <div>
                  <label className={lbl}>Driver</label>
                  <input type="number" value={shared.pax_driver} onChange={e => setS({ pax_driver: e.target.value })} placeholder="0" className={inp} />
                </div>
              )}
            </div>

            {/* Fix/Dinamis/Pasangan — KHUSUS Kalkulator Estimasi Publik (paket
                private/custom, mis. Umroh Berdua/Besties/Bareng Seangkatan
                dkk — lihat flyer promo). "Jamaah (baseline internal)" di atas
                TETAP dipakai kalkulator internal ini; begitu template
                dipublish ke publik, jumlah pax yang beneran dipakai buat
                hitung harga jamaah adalah dari pengunjung, dibatasi aturan
                di bawah — Fix = harus pas sekian orang (total bebas gender,
                mis. grup 6 orang), Dinamis = bebas (opsional dikasih batas
                minimal/maksimal), Pasangan = KHUSUS paket berbasis pasangan
                suami-istri (mis. Umroh Berdua) — pengunjung isi "berapa
                pasang" (bukan cowok/cewek manual), sistem otomatis kali 2 &
                semua pasangan sekamar berdua. */}
            {showOpsiPublik && (
            <div className="mt-3 pt-3 border-t border-amber-200/60">
              <div className="text-[10px] font-bold text-amber-700 mb-1.5">🧮 Jumlah Pax di Kalkulator Publik</div>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => setS({ pax_mode: 'dinamis' })}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${(shared.pax_mode || 'dinamis') === 'dinamis' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Dinamis (bebas)</button>
                <button type="button" onClick={() => setS({ pax_mode: 'fix' })}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${shared.pax_mode === 'fix' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Fix (harus pas)</button>
                <button type="button" onClick={() => setS({ pax_mode: 'pasangan' })}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${shared.pax_mode === 'pasangan' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Pasangan (kelipatan 2)</button>
              </div>
              {shared.pax_mode === 'fix' ? (
                <div className="w-32">
                  <label className={lbl}>Jumlah Pax Tetap</label>
                  <input type="number" min={1} value={shared.pax_fix_total ?? ''} onChange={e => setS({ pax_fix_total: e.target.value })} placeholder="mis. 2" className={inp} />
                </div>
              ) : shared.pax_mode === 'pasangan' ? (
                <div className="w-48">
                  <label className={lbl}>Maksimal Jumlah Pasangan (opsional)</label>
                  <input type="number" min={1} value={shared.pax_pasangan_max ?? ''} onChange={e => setS({ pax_pasangan_max: e.target.value })} placeholder="Gak dibatasi" className={inp} />
                  <div className="text-[10px] text-gray-400 mt-1">Pengunjung pilih jumlah pasang (min 1) — tiap pasang = 1 suami + 1 istri, otomatis sekamar berdua.</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 w-64">
                  <div>
                    <label className={lbl}>Minimal (opsional)</label>
                    <input type="number" min={1} value={shared.pax_min ?? ''} onChange={e => setS({ pax_min: e.target.value })} placeholder="Gak dibatasi" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Maksimal (opsional)</label>
                    <input type="number" min={1} value={shared.pax_max ?? ''} onChange={e => setS({ pax_max: e.target.value })} placeholder="Gak dibatasi" className={inp} />
                  </div>
                </div>
              )}
            </div>
            )}

            {!isWisata && showOpsiPublik && (
              <div className="mt-3 pt-3 border-t border-amber-200/60">
                <div className="text-[10px] font-bold text-amber-700 mb-1.5">🧮 Hari Mutawwif di Kalkulator Publik</div>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setS({ mutawwif_mode: 'dinamis' })}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${(shared.mutawwif_mode || 'dinamis') === 'dinamis' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Dinamis (bebas)</button>
                  <button type="button" onClick={() => setS({ mutawwif_mode: 'fix' })}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${shared.mutawwif_mode === 'fix' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Fix (ikut itinerary)</button>
                </div>
                {shared.mutawwif_mode === 'fix' && (
                  <div className="w-48">
                    <label className={lbl}>Override Jumlah Hari (opsional)</label>
                    <input type="number" min={0} value={shared.mutawwif_fix_hari ?? ''} onChange={e => setS({ mutawwif_fix_hari: e.target.value })} placeholder="0" className={inp} />
                    <div className="text-[10px] text-gray-400 mt-1">Kosongkan aja kalau mutawwif nemenin SEPANJANG trip (default) — isi cuma kalau mutawwif-nya cuma nemenin sebagian hari doang, mis. 3 dari 9 hari.</div>
                  </div>
                )}
              </div>
            )}

            {/* Durasi pilihan (mis. 9/12 Hari) — jamaah pilih di kalkulator
                publik, GANTI Total Hari Program di atas kalau diisi. Kosong
                (default) = jamaah gak pilih durasi, tetap pakai Total Hari
                Program tunggal (perilaku lama). Total Malam (opsional, SAMA
                buat semua paket) = total malam Mekkah+Madinah GABUNGAN buat
                durasi itu (mis. 9 hari = 7 malam) — begitu diisi, jamaah
                gak lagi bebas isi Malam Mekkah & Madinah independen, tapi
                BAGI dari total ini (isi salah satu, sisanya otomatis
                nyesuain, lihat kalkulator/[template_id]/page.jsx). Kosong =
                perilaku lama, 2 field malam tetap bebas. */}
            {!isWisata && showOpsiPublik && (
              <div className="mt-3 pt-3 border-t border-amber-200/60">
                <div className="text-[10px] font-bold text-amber-700 mb-1.5">🧮 Pilihan Durasi Umroh di Kalkulator Publik (opsional)</div>
                <div className="space-y-1.5 mb-2">
                  {(shared.durasi_opsi || []).map((dRaw, i) => {
                    const d = (dRaw && typeof dRaw === 'object') ? dRaw : { hari: dRaw, malam: '' };
                    function ubah(patch) {
                      setS({ durasi_opsi: shared.durasi_opsi.map((x, j) => j === i ? { ...d, ...patch } : x) });
                    }
                    return (
                      <div key={i} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 w-fit">
                        <input type="number" min={1} value={d.hari ?? ''} onChange={e => ubah({ hari: Number(e.target.value) })}
                          className="w-12 text-sm border-none focus:outline-none" />
                        <span className="text-xs text-gray-400">Hari</span>
                        <span className="text-gray-200 mx-1">|</span>
                        <input type="number" min={0} value={d.malam ?? ''} onChange={e => ubah({ malam: e.target.value === '' ? '' : Number(e.target.value) })}
                          placeholder="Total malam" className="w-16 text-sm border-none focus:outline-none" />
                        <span className="text-xs text-gray-400">Malam</span>
                        <button type="button" onClick={() => setS({ durasi_opsi: shared.durasi_opsi.filter((_, j) => j !== i) })} className="text-red-500 text-xs font-bold ml-1">✕</button>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setS({ durasi_opsi: [...(shared.durasi_opsi || []), { hari: Number(shared.total_hari_program) || 9, malam: '' }] })} className="text-xs font-bold text-amber-700 hover:underline">+ Tambah Opsi Durasi</button>
                <div className="text-[10px] text-gray-400 mt-1">Mis. 9 Hari / 7 Malam &amp; 12 Hari / 10 Malam — jamaah pilih salah satu di kalkulator. Hari GANTI Total Hari Program (dasar hitung item &quot;/Day&quot;). Malam (opsional) ngunci total malam Mekkah+Madinah gabungan, kosongkan kalau mau jamaah tetap bebas isi 2 field itu independen.</div>
              </div>
            )}

            {/* Default urutan Mekkah/Madinah — jamaah tetap bisa ubah sendiri
                di kalkulator publik, ini cuma nilai awal. MURNI label
                itinerary, gak ngaruh harga (hotel Mekkah/Madinah tetap
                dihitung terpisah dari rate masing2). */}
            {!isWisata && showOpsiPublik && (
              <div className="mt-3 pt-3 border-t border-amber-200/60">
                <div className="text-[10px] font-bold text-amber-700 mb-1.5">🧮 Default Urutan Kota di Kalkulator Publik</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setS({ urutan_default: 'mekkah' })}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${(shared.urutan_default || 'mekkah') === 'mekkah' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Mekkah Dulu</button>
                  <button type="button" onClick={() => setS({ urutan_default: 'madinah' })}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${shared.urutan_default === 'madinah' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Madinah Dulu</button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs font-bold text-gray-500 mb-2">✈️ Tiket Pesawat, Visa & Lain-lain (sama utk seluruh program)</div>
            <div>
              <div>
                <label className={lbl}>Tiket Pesawat{tiketRows.length > 1 ? ' (per rute/negara)' : ''}</label>
                {masterTiket.length > 0 && (
                  <div className="mb-2">
                    <div className="flex gap-1 mb-1.5">
                      {[['direct', 'Direct'], ['transit', 'Transit']].map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setFilterRuteTiket(val)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${filterRuteTiket === val ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{label}</button>
                      ))}
                    </div>
                    {(() => {
                      const masterTiketFilter = masterTiket.filter(m => !m.rute || m.rute === filterRuteTiket);
                      return showOpsiPublik ? (
                        <div className="space-y-1">
                          <div className="text-[10px] text-gray-400">Centang opsi tiket yang boleh dipilih jamaah (generate dari Master Tiket Pesawat):</div>
                          {masterTiketFilter.map(m => {
                            const dicentang = tiketRows.some(t => t.master_id === m.id);
                            return (
                              <label key={m.id} className="flex items-center gap-1.5 text-[10px] bg-white rounded-lg px-2 py-1.5 border border-gray-200 cursor-pointer">
                                <input type="checkbox" checked={dicentang} onChange={() => toggleTiketDariMaster(m)} className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                                {labelMasterTiket(m)}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <select value="" onChange={e => tambahTiketDariMaster(e.target.value)} className={`${inp} text-[10px] text-[#1A4FA0]`}>
                          <option value="">🔄 Isi dari Master...</option>
                          {masterTiketFilter.map(t => <option key={t.id} value={t.id}>{labelMasterTiket(t)}</option>)}
                        </select>
                      );
                    })()}
                  </div>
                )}
                <div className="space-y-1">
                  {tiketRows.map((t, i) => (
                    t.master_id ? (
                      // Baris hasil generate dari Master — tampilan ringkas
                      // (read-only nama/rute/rate), bukan field kecil-kecil
                      // dempet yang susah dibaca. Maskapai tetap bisa
                      // diisi manual (gak ada di Master).
                      <div key={i} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-gray-200 px-2.5 py-2">
                        <div className="text-xs min-w-0">
                          <div className="font-semibold text-gray-700 truncate">
                            {t.nama || 'Tiket Pesawat'}
                            {t.rute && <span className="ml-1.5 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded align-middle">{t.rute === 'direct' ? 'Direct' : 'Transit'}</span>}
                          </div>
                          <div className="text-gray-500">{t.mata_uang || 'IDR'} {Number(t.rate || 0).toLocaleString('id-ID')}</div>
                          <input value={t.maskapai || ''} onChange={e => ubahTiket(i, { maskapai: e.target.value || null })} placeholder="Semua maskapai (opsional)" title="Maskapai (buat Kalkulator Publik — pengunjung pilih maskapai, kosongkan kalau harganya sama semua maskapai)" className={`${inp} mt-1 text-[10px]`} />
                        </div>
                        <button type="button" onClick={() => hapusTiket(i)} className="text-red-500 text-xs font-bold shrink-0">✕</button>
                      </div>
                    ) : (
                      <div key={i} className="flex gap-1">
                        {tiketRows.length > 1 && (
                          <input value={t.nama || ''} onChange={e => ubahTiket(i, { nama: e.target.value })} placeholder="Mis. JKT-Dubai" className={`${inp} w-24`} />
                        )}
                        <input type="number" value={t.rate} onChange={e => ubahTiket(i, { rate: e.target.value })} placeholder="0" className={inp} />
                        <select value={t.mata_uang || 'IDR'} onChange={e => ubahTiket(i, { mata_uang: e.target.value })} className={inp}>
                          <option value="IDR">IDR</option><option value="SAR">SAR</option><option value="USD">USD</option>
                        </select>
                        {tiketRows.length > 1 && (
                          <select value={t.rute || ''} onChange={e => ubahTiket(i, { rute: e.target.value || null })} title="Rute (buat Kalkulator Publik — pengunjung pilih direct/transit)" className={inp}>
                            <option value="">Semua rute</option>
                            <option value="direct">Direct</option>
                            <option value="transit">Transit</option>
                          </select>
                        )}
                        {tiketRows.length > 1 && pakaiGabungan && (
                          <select value={t.urutan_umroh || ''} onChange={e => ubahTiket(i, { urutan_umroh: e.target.value || null })} title="Urutan Umroh Plus (buat Kalkulator Publik — pengunjung pilih Umroh dulu/negara dulu)" className={inp}>
                            <option value="">Semua urutan</option>
                            <option value="umroh_dulu">Umroh Dulu</option>
                            <option value="negara_dulu">Negara Dulu</option>
                          </select>
                        )}
                        {tiketRows.length > 1 && (
                          <input value={t.maskapai || ''} onChange={e => ubahTiket(i, { maskapai: e.target.value || null })} placeholder="Semua maskapai" title="Maskapai (buat Kalkulator Publik — pengunjung pilih maskapai, kosongkan kalau harganya sama semua maskapai)" className={`${inp} w-28`} />
                        )}
                        {tiketRows.length > 1 && (
                          <button type="button" onClick={() => hapusTiket(i)} className="text-red-500 text-xs font-bold shrink-0">✕</button>
                        )}
                      </div>
                    )
                  ))}
                </div>
                <button type="button" onClick={tambahTiket} className="text-[10px] font-bold text-[#1A4FA0] hover:underline mt-1">+ Tambah Tiket Pesawat</button>
                {tiketRows.length > 1 && (
                  <div className="text-[10px] font-semibold text-gray-500 mt-1">Total: {rp(totalTiketPesawat(shared))}</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 max-w-xl">
              <div>
                <label className={lbl}>Visa</label>
                <div className="flex gap-1">
                  <input type="number" value={shared.visa_rate} onChange={e => setS({ visa_rate: e.target.value })} placeholder="0" className={`${inp} w-20`} />
                  <select value={shared.visa_mata_uang || 'IDR'} onChange={e => setS({ visa_mata_uang: e.target.value })} className={`${inp} w-20`}>
                    <option value="IDR">IDR</option><option value="SAR">SAR</option><option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Biaya Lain-lain</label>
                <div className="flex gap-1">
                  <input type="number" value={shared.biaya_lain_lain} onChange={e => setS({ biaya_lain_lain: e.target.value })} placeholder="0" className={`${inp} w-20`} />
                  <select value={shared.biaya_lain_lain_mata_uang || 'IDR'} onChange={e => setS({ biaya_lain_lain_mata_uang: e.target.value })} className={`${inp} w-20`}>
                    <option value="IDR">IDR</option><option value="SAR">SAR</option><option value="USD">USD</option>
                  </select>
                </div>
              </div>
              {!isWisata && (
                <div>
                  <label className={lbl}>Biaya per Umroh Tambahan</label>
                  <div className="flex gap-1">
                    <input type="number" value={shared.biaya_umroh_tambahan ?? ''} onChange={e => setS({ biaya_umroh_tambahan: e.target.value })} placeholder="0" className={`${inp} w-20`} />
                    <select value={shared.biaya_umroh_tambahan_mata_uang || 'IDR'} onChange={e => setS({ biaya_umroh_tambahan_mata_uang: e.target.value })} className={`${inp} w-20`}>
                      <option value="IDR">IDR</option><option value="SAR">SAR</option><option value="USD">USD</option>
                    </select>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">Per pax, per kali umroh EKSTRA (2x umroh pertama udah otomatis termasuk) — jamaah isi &quot;Jumlah Umroh&quot; di kalkulator publik, kelipatan di atas 2 kena biaya ini.</div>
                </div>
              )}
            </div>
          </div>

          {!pakaiHotelMix && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-bold text-gray-500 mb-2">🌙 Malam Hotel (sama untuk ketiga bintang)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Malam di Hotel 1</label>
                  <input type="number" value={malam.mekkah} onChange={e => setMalam(prev => ({ ...prev, mekkah: e.target.value }))} placeholder="0" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Malam di Hotel 2</label>
                  <input type="number" value={malam.madinah} onChange={e => setMalam(prev => ({ ...prev, madinah: e.target.value }))} placeholder="0" className={inp} />
                </div>
              </div>
            </div>
          )}

          {/* Fix/Dinamis — KHUSUS Kalkulator Estimasi Publik (showOpsiPublik),
              TERLEPAS dari Hotel Fix/Mix (dulu cuma nempel di Hotel Fix —
              Hotel Mix jadi gak punya kontrol ini sama sekali, DAN
              nongolnya gak dibatasin ke showOpsiPublik jadi kepakai juga di
              Costing Program internal yang gak relevan, dikonfirmasi user
              2026-08-18). Fix = malam yang udah diisi (Hotel Fix: field di
              atas, Hotel Mix: kolom Malam per baris) jadi itinerary tetap,
              pengunjung publik gak bisa ubah. Dinamis = pengunjung bebas isi
              malam sendiri. */}
          {showOpsiPublik && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-[10px] font-bold text-gray-500 mb-1.5">🧮 Malam di Kalkulator Publik</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setS({ malam_mode: 'dinamis' })}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${(shared.malam_mode || 'dinamis') === 'dinamis' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Dinamis (bebas)</button>
                <button type="button" onClick={() => setS({ malam_mode: 'fix' })}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${shared.malam_mode === 'fix' ? 'bg-[#1A4FA0] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Fix (ikut itinerary di atas)</button>
              </div>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-[#0E2F6E]">🏨 Hotel per Bintang, Margin & Komisi</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setS({ hotel_mode: 'fix' })}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${!pakaiHotelMix ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>Hotel Fix (2 slot)</button>
                <button type="button" onClick={() => setS({ hotel_mode: 'mix' })}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg ${pakaiHotelMix ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>Hotel Mix (custom)</button>
              </div>
            </div>

            {!pakaiHotelMix ? (
              <div className="overflow-x-auto">
                {!pakaiUiPublikSederhana && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="p-2">Aktif</th>
                      <th className="p-2">Bintang / Paket</th>
                      <th className="p-2">Hotel 1</th>
                      <th className="p-2">Rate Hotel 1 (Double/Triple/Quad)</th>
                      <th className="p-2">Hotel 2</th>
                      <th className="p-2">Rate Hotel 2 (Double/Triple/Quad)</th>
                      <th className="p-2">Margin (Rp)</th>
                      <th className="p-2">Komisi (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAKET.map((paket, i) => (
                      <tr key={paket} className={`border-t border-gray-100 ${bintangAktif[paket] === false ? 'opacity-40' : ''}`}>
                        <td className="p-2 text-center"><input type="checkbox" checked={bintangAktif[paket] !== false} onChange={() => toggleBintang(paket)} className="w-4 h-4 accent-[#1A4FA0]" title="Tampilkan bintang ini di Hasil HPP & PDF" /></td>
                        <td className="p-2 font-semibold text-gray-600 whitespace-nowrap">Bintang {i + 3} ({PAKET_LABEL[paket]})</td>
                        <td className="p-2"><input value={hotel[paket].mekkah_nama} onChange={e => setH(paket, { mekkah_nama: e.target.value })} placeholder="Nama hotel (mis. Mekkah)" className={inp} /></td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <input type="number" value={hotel[paket].mekkah_rate_double} onChange={e => setH(paket, { mekkah_rate_double: e.target.value })} placeholder="Double" title="Rate Double" className={inp} />
                            <input type="number" value={hotel[paket].mekkah_rate_triple} onChange={e => setH(paket, { mekkah_rate_triple: e.target.value })} placeholder="Triple" title="Rate Triple" className={inp} />
                            <input type="number" value={hotel[paket].mekkah_rate_quad} onChange={e => setH(paket, { mekkah_rate_quad: e.target.value })} placeholder="Quad" title="Rate Quad" className={inp} />
                            <select value={hotel[paket].mekkah_mata_uang} onChange={e => setH(paket, { mekkah_mata_uang: e.target.value })} className={inp}>
                              <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                            </select>
                          </div>
                          {(() => {
                            // showOpsiHotelAlternatif aktif (ada checklist "Opsi
                            // Hotel Alternatif" di bawah) — dropdown ini CUMA
                            // nampilin hotel yang UDAH dicentang di situ dulu,
                            // gak langsung nunjukin semua Master Hotel (dikonfirmasi
                            // user 2026-08-18). Costing Program (gak ada checklist
                            // sama sekali) tetap kayak biasa, semua Master kebuka.
                            const kandidat = masterHotel.filter(h => h.kota === 'mekkah' && h.aktif && h.bintang === i + 3 && (!showOpsiHotelAlternatif || opsiHotel(paket, 'mekkah').some(o => o.master_id === h.id)));
                            return kandidat.length > 0 && (
                              <select value="" onChange={e => isiHotelDariMaster(paket, 'mekkah', e.target.value)} className={`${inp} mt-1 text-[10px] text-[#1A4FA0]`}>
                                <option value="">🔄 Isi dari Master (Bintang {i + 3})...</option>
                                {kandidat.map(h => <option key={h.id} value={h.id}>{labelMasterHotel(h)}</option>)}
                              </select>
                            );
                          })()}
                        </td>
                        <td className="p-2"><input value={hotel[paket].madinah_nama} onChange={e => setH(paket, { madinah_nama: e.target.value })} placeholder="Nama hotel (mis. Madinah)" className={inp} /></td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <input type="number" value={hotel[paket].madinah_rate_double} onChange={e => setH(paket, { madinah_rate_double: e.target.value })} placeholder="Double" title="Rate Double" className={inp} />
                            <input type="number" value={hotel[paket].madinah_rate_triple} onChange={e => setH(paket, { madinah_rate_triple: e.target.value })} placeholder="Triple" title="Rate Triple" className={inp} />
                            <input type="number" value={hotel[paket].madinah_rate_quad} onChange={e => setH(paket, { madinah_rate_quad: e.target.value })} placeholder="Quad" title="Rate Quad" className={inp} />
                            <select value={hotel[paket].madinah_mata_uang} onChange={e => setH(paket, { madinah_mata_uang: e.target.value })} className={inp}>
                              <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                            </select>
                          </div>
                          {(() => {
                            const kandidat = masterHotel.filter(h => h.kota === 'madinah' && h.aktif && h.bintang === i + 3 && (!showOpsiHotelAlternatif || opsiHotel(paket, 'madinah').some(o => o.master_id === h.id)));
                            return kandidat.length > 0 && (
                              <select value="" onChange={e => isiHotelDariMaster(paket, 'madinah', e.target.value)} className={`${inp} mt-1 text-[10px] text-[#1A4FA0]`}>
                                <option value="">🔄 Isi dari Master (Bintang {i + 3})...</option>
                                {kandidat.map(h => <option key={h.id} value={h.id}>{labelMasterHotel(h)}</option>)}
                              </select>
                            );
                          })()}
                        </td>
                        <td className="p-2"><input type="number" value={margin[paket]} onChange={e => setMargin(prev => ({ ...prev, [paket]: e.target.value }))} placeholder="0" className={inp} /></td>
                        <td className="p-2"><input type="number" value={komisi[paket]} onChange={e => setKomisi(prev => ({ ...prev, [paket]: e.target.value }))} placeholder="0" className={inp} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}

                {/* Opsi Hotel — OPSIONAL, cuma dipakai Kalkulator Estimasi
                    Publik biar pengunjung bisa pilih nama hotel spesifik.
                    Program Costing gak pernah ketemu pengunjung publik, jadi
                    section ini gak relevan di sana — showOpsiHotelAlternatif
                    cuma true di halaman Kalkulator Template/Acuan.
                    Berlaku buat SEMUA pax_mode (dinamis/pasangan/fix) begitu
                    showOpsiPublik (pakaiUiPublikSederhana) — jamaah milih
                    Bintang Mekkah & Madinah SENDIRI-SENDIRI (independen per
                    kota, per baris kalau mode dinamis), jadi checklist-nya
                    CUMA 1 list per kota (gak dibagi per Deluxe/Eksekutif/
                    Signature lagi, itu bikin bingung karena paket udah gak
                    dipakai buat nentuin hotel di alur ini — dikonfirmasi user
                    2026-08-18). Nyimpennya tetap ke bucket 'deluxe' (arbitrer,
                    gak ngaruh — hotelOpsiGabunganUntukTemplate di server udah
                    gabungin ketiga bucket jadi 1 buat publik). */}
                {showOpsiHotelAlternatif && pakaiUiPublikSederhana && (
                <div className="mt-4 bg-white rounded-lg border border-gray-200 p-2.5">
                  <div className="text-[10px] font-bold text-gray-500 mb-2">🏨 Opsi Hotel + 💰 Margin &amp; Komisi</div>
                  <div className="text-[10px] text-gray-400 mb-2">Jamaah pilih Bintang Mekkah &amp; Madinah sendiri-sendiri, gak kebundling jadi 1 &quot;Paket&quot; — centang hotel yang boleh dipilih per kota. Margin &amp; Komisi berlaku flat, sama rata apapun bintang/hotel yang kepilih.</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {['mekkah', 'madinah'].map(kota => (
                      <div key={kota}>
                        <div className="text-[10px] text-gray-400 mb-1">Opsi Hotel {kota === 'mekkah' ? 'Mekkah' : 'Madinah'}</div>
                        {masterHotel.filter(h => h.kota === kota && h.aktif).length > 0 && (
                          <div className="space-y-1">
                            {masterHotel.filter(h => h.kota === kota && h.aktif).map(m => {
                              const dicentang = opsiHotel('deluxe', kota).some(o => o.master_id === m.id);
                              return (
                                <label key={m.id} className="flex items-center gap-1.5 text-[10px] bg-gray-50 rounded px-2 py-1 border border-gray-100 cursor-pointer">
                                  <input type="checkbox" checked={dicentang} onChange={() => toggleOpsiHotelDariMaster('deluxe', kota, m)} className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                                  {labelMasterHotel(m)}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-w-md">
                    <div>
                      <label className={lbl}>Margin Flat (Rp)</label>
                      <input type="number" value={shared.margin_flat ?? ''} onChange={e => setS({ margin_flat: e.target.value })} placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Komisi Flat (Rp)</label>
                      <input type="number" value={shared.komisi_flat ?? ''} onChange={e => setS({ komisi_flat: e.target.value })} placeholder="0" className={inp} />
                    </div>
                  </div>
                </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] text-gray-400">
                  Daftar hotel di bawah dipakai bareng buat ketiga paket (Deluxe/Eksekutif/Signature) — cuma Margin &amp; Komisi yang beda per paket, bukan hotelnya.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="p-1">Kota/Negara &amp; Nama Hotel</th>
                        <th className="p-1">Bintang</th>
                        <th className="p-1">Rate Double/Triple/Quad</th>
                        <th className="p-1">Mata Uang</th>
                        <th className="p-1">Malam</th>
                        <th className="p-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {hotelList.map((h, hi) => (
                        <tr key={hi} className="border-t border-gray-100">
                          <td className="p-1">
                            <select value={h.kota || 'mekkah'} onChange={e => ubahHotelDaftar(hi, { kota: e.target.value })} className={`${inp} w-24 mb-1`}>
                              <option value="mekkah">Mekkah</option>
                              <option value="madinah">Madinah</option>
                            </select>
                            <input value={h.nama} onChange={e => ubahHotelDaftar(hi, { nama: e.target.value })} placeholder="Mis. Dubai - Hotel Address" className={`${inp} w-40`} />
                            {masterHotel.some(m => m.kota === (h.kota || 'mekkah') && m.aktif) && (
                              <select value="" onChange={e => isiHotelDaftarDariMaster(hi, e.target.value)} className={`${inp} w-40 mt-1 text-[10px] text-[#1A4FA0]`}>
                                <option value="">🔄 Isi dari Master...</option>
                                {masterHotel.filter(m => m.kota === (h.kota || 'mekkah') && m.aktif).map(m => <option key={m.id} value={m.id}>{labelMasterHotel(m)}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="p-1"><input type="number" value={h.bintang} onChange={e => ubahHotelDaftar(hi, { bintang: e.target.value })} placeholder="4" className={`${inp} w-14`} /></td>
                          <td className="p-1">
                            <div className="flex gap-1">
                              <input type="number" value={h.rate_double} onChange={e => ubahHotelDaftar(hi, { rate_double: e.target.value })} placeholder="Double" title="Rate Double" className={`${inp} w-20`} />
                              <input type="number" value={h.rate_triple} onChange={e => ubahHotelDaftar(hi, { rate_triple: e.target.value })} placeholder="Triple" title="Rate Triple" className={`${inp} w-20`} />
                              <input type="number" value={h.rate_quad} onChange={e => ubahHotelDaftar(hi, { rate_quad: e.target.value })} placeholder="Quad" title="Rate Quad" className={`${inp} w-20`} />
                            </div>
                          </td>
                          <td className="p-1">
                            <select value={h.mata_uang} onChange={e => ubahHotelDaftar(hi, { mata_uang: e.target.value })} className={`${inp} w-20`}>
                              <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                            </select>
                          </td>
                          <td className="p-1"><input type="number" value={h.malam} onChange={e => ubahHotelDaftar(hi, { malam: e.target.value })} placeholder="0" className={`${inp} w-16`} /></td>
                          <td className="p-1"><button type="button" onClick={() => hapusHotelDaftar(hi)} className="text-red-500 text-xs font-bold hover:underline">Hapus</button></td>
                        </tr>
                      ))}
                      {hotelList.length === 0 && (
                        <tr><td colSpan={6} className="p-2 text-gray-400">Belum ada hotel.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={tambahHotelDaftar} className="text-[10px] font-bold text-[#1A4FA0] hover:underline">+ Tambah Hotel</button>

                <div className="text-[10px] text-gray-400">
                  Paket custom kayak gini biasanya 1 harga aja (bukan 9 opsi kayak Umroh Regular) — Margin &amp; Komisi di bawah otomatis kepakai ke ketiga bintang.
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-md">
                  <div>
                    <label className={lbl}>Margin (Rp)</label>
                    <input type="number" value={margin.deluxe} onChange={e => setMargin({ deluxe: e.target.value, eksekutif: e.target.value, signature: e.target.value })} placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Komisi (Rp)</label>
                    <input type="number" value={komisi.deluxe} onChange={e => setKomisi({ deluxe: e.target.value, eksekutif: e.target.value, signature: e.target.value })} placeholder="0" className={inp} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Custom Hotel per Kota (checkout program reguler) — BUKAN
              checklist hotel spesifik, cukup reuse 3 baris paket di atas
              (Bintang 3/4/5 = Deluxe/Eksekutif/Signature, TIDAK berubah
              sama sekali) — jamaah nanti pilih Bintang Mekkah & Madinah
              SECARA TERPISAH di checkout, dihitung proporsional dari rate
              hotel per-kota baris paket yang bersangkutan (dikonfirmasi
              user 2026-08-20). Margin/Komisi PERSEN di sini KHUSUS buat
              kombinasi MIX (bintang beda antar kota) — kombinasi yang
              bintangnya sama tetap pakai harga paket biasa apa adanya.
              Nyalain "Margin Persen" = syarat satu-satunya biar Custom
              Hotel per Kota muncul di checkout (lihat custom_hotel_tersedia
              di /api/programs) — kalau gak dicentang, opsi ini gak
              ditawarkan ke jamaah sama sekali. Gak relevan buat Hotel Mix
              (paket custom 1-harga) makanya digabung di luar toggle Fix/Mix. */}
          {!pakaiUiPublikSederhana && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-bold text-[#0E2F6E] mb-1">🎨 Custom Hotel per Kota (opsional)</div>
              <div className="text-[10px] text-gray-400 mb-2">
                Biar jamaah bisa mix Bintang Mekkah &amp; Madinah beda-beda di checkout (mis. Mekkah Bintang 5 + Madinah Bintang 3) — 3 paket di atas TETAP seperti biasa, ini murni tambahan. Margin &amp; Komisi kombinasi mix dihitung persen dari HPP (proporsional), bukan Rp flat.
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-semibold text-gray-600 mb-1 cursor-pointer">
                    <input type="checkbox" checked={shared.margin_mode === 'persen'}
                      onChange={e => setS({ margin_mode: e.target.checked ? 'persen' : 'flat' })}
                      className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                    Aktifkan (Margin Persen %)
                  </label>
                  {shared.margin_mode === 'persen' && (
                    <input type="number" value={shared.margin_persen ?? ''} onChange={e => setS({ margin_persen: e.target.value })} placeholder="0" className={inp} />
                  )}
                </div>
                {shared.margin_mode === 'persen' && (
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-semibold text-gray-600 mb-1 cursor-pointer">
                      <input type="checkbox" checked={shared.komisi_mode === 'persen'}
                        onChange={e => setS({ komisi_mode: e.target.checked ? 'persen' : 'flat' })}
                        className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                      Komisi Persen (%)
                    </label>
                    {shared.komisi_mode === 'persen' && (
                      <input type="number" value={shared.komisi_persen ?? ''} onChange={e => setS({ komisi_persen: e.target.value })} placeholder="0" className={inp} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs font-bold text-gray-500 mb-2">🗺️ Itinerary &amp; Include/Exclude</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <div>
                <label className={lbl}>✅ Sudah Termasuk (Include)</label>
                <textarea value={shared.include_items || ''} onChange={e => setS({ include_items: e.target.value })} rows={4} className={inp}
                  placeholder={"1 item per baris, contoh:\nTiket pesawat PP\nHotel bintang 4\nMakan 3x sehari"} />
              </div>
              <div>
                <label className={lbl}>❌ Tidak Termasuk (Exclude)</label>
                <textarea value={shared.exclude_items || ''} onChange={e => setS({ exclude_items: e.target.value })} rows={4} className={inp}
                  placeholder={"1 item per baris, contoh:\nPembuatan paspor\nPengeluaran pribadi"} />
              </div>
            </div>
            <div>
              <label className={lbl}>Itinerary per Hari</label>
              {isWisata ? (
                modulTerpilih.length === 0 ? (
                  <div className="text-xs text-gray-400 bg-white rounded-lg p-3">Pilih Modul Negara di atas dulu — itinerary Program Wisata ngikut modul yang dipilih (dikelola di halaman Kelola Modul Negara), bukan diketik manual di sini.</div>
                ) : (
                  <>
                    <div className="text-[10px] text-gray-400 mb-2">Ditarik dari itinerary Modul Negara yang dipilih — udah jadi milik Program ini, bebas diedit langsung di sini tanpa ngubah modul aslinya, dan gak ikut berubah kalau modulnya diedit belakangan.</div>
                    <div className="space-y-2">
                      {itineraryDariModul.map((teksDefault, i) => (
                        <div key={i} className="bg-white rounded-lg p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-[#0E2F6E]">Hari {i + 1}{negaraDariModul[i] ? ` — ${negaraDariModul[i]}` : ''}</span>
                            {labelHari(tanggalBerangkat, i) && <span className="text-[10px] text-gray-400">{labelHari(tanggalBerangkat, i)}</span>}
                          </div>
                          <textarea
                            value={teksModulHari(i, teksDefault)}
                            onChange={e => ubahItineraryModul(i, e.target.value)}
                            rows={2} className={`${inp} text-xs`} placeholder={`Kegiatan hari ke-${i + 1}...`} />
                        </div>
                      ))}
                    </div>
                  </>
                )
              ) : pakaiGabungan ? (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer mb-2">
                    <input type="checkbox" checked={shared.umroh_dulu !== false} onChange={e => setS({ umroh_dulu: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
                    Umroh dulu (sebelum negara tambahan) — uncentang kalau negara tambahan duluan baru Umroh
                  </label>
                  {gabunganHari.length === 0 ? (
                    <div className="text-xs text-gray-400 bg-white rounded-lg p-3">Isi <b>Total Hari Umroh</b> dan/atau lengkapi <b>Hari</b> di Modul Negara di atas buat munculin itinerary gabungan.</div>
                  ) : (
                    <div className="space-y-2">
                      {gabunganHari.map((h, i) => (
                        <div key={i} className="bg-white rounded-lg p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-[#0E2F6E]">Hari {i + 1} — {h.label}</span>
                            {labelHari(tanggalBerangkat, i) && <span className="text-[10px] text-gray-400">{labelHari(tanggalBerangkat, i)}</span>}
                          </div>
                          <textarea
                            value={h.teks}
                            onChange={e => {
                              if (h.source === 'modul') { ubahItineraryModul(h.idx, e.target.value); return; }
                              const arr = Array.isArray(shared.itinerary) ? [...shared.itinerary] : [];
                              arr[h.idx] = e.target.value;
                              setS({ itinerary: arr });
                            }}
                            rows={2} className={`${inp} text-xs`} placeholder={`Kegiatan hari ke-${i + 1}...`} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : malamModeDinamisPublik ? (
                <div className="text-xs text-gray-400 bg-white rounded-lg p-3">Umroh dinamis berdiri sendiri (gak ada Negara Tambahan) — itinerary gak ditampilin ke jamaah, cukup rekap otomatis di &quot;✅ Sudah Termasuk&quot;. Pilih Negara Tambahan di atas kalau mau nambahin itinerary Modul Negara.</div>
              ) : totalHariEfektif <= 0 ? (
                <div className="text-xs text-gray-400 bg-white rounded-lg p-3">{sembunyikanTotalHari ? <>Isi <b>Pilihan Durasi Umroh</b> di atas dulu buat munculin kolom itinerary per hari.</> : <>Isi <b>Total Hari Program</b> di atas dulu buat munculin kolom itinerary per hari.</>}</div>
              ) : (
                <div className="space-y-2">
                  {Array.from({ length: totalHariEfektif }, (_, i) => (
                    <div key={i} className="bg-white rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-[#0E2F6E]">Hari {i + 1}</span>
                        {labelHari(tanggalBerangkat, i) && <span className="text-[10px] text-gray-400">{labelHari(tanggalBerangkat, i)}</span>}
                      </div>
                      <textarea
                        value={(shared.itinerary && shared.itinerary[i]) || ''}
                        onChange={e => {
                          const arr = Array.isArray(shared.itinerary) ? [...shared.itinerary] : [];
                          arr[i] = e.target.value;
                          setS({ itinerary: arr });
                        }}
                        rows={2} className={`${inp} text-xs`} placeholder={`Kegiatan hari ke-${i + 1}...`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <KalkulatorBiaya value={shared} onChange={setShared} hideHotel showNama={false} />

          <div className="bg-[#E8F0FB] rounded-xl p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-xs font-bold text-[#0E2F6E]">💰 Hasil HPP & Harga Jual per Kamar</div>
              <div className="flex items-center gap-2">
                <label className={lbl}>Bulatkan Harga Jual</label>
                <select value={pembulatan} onChange={e => setS({ pembulatan: Number(e.target.value) })} className={inp}>
                  {PEMBULATAN_LIST.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <div className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border-2 border-gray-200" title="Centang bagian yang mau ikut di PDF">
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={pdfOpsi.rincianBiaya} onChange={() => togglePdfOpsi('rincianBiaya')} className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                    Rincian Biaya
                  </label>
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={pdfOpsi.hpp} onChange={() => togglePdfOpsi('hpp')} className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                    HPP
                  </label>
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={pdfOpsi.ujroh} onChange={() => togglePdfOpsi('ujroh')} className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                    Ujroh
                  </label>
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={pdfOpsi.jual} onChange={() => togglePdfOpsi('jual')} className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                    Jual
                  </label>
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={pdfOpsi.infoProgram} onChange={() => togglePdfOpsi('infoProgram')} className="w-3.5 h-3.5 accent-[#1A4FA0]" />
                    Info Program
                  </label>
                </div>
                <button type="button" onClick={() => unduhPdf(pdfOpsi)}
                  disabled={!pdfOpsi.rincianBiaya && !pdfOpsi.hpp && !pdfOpsi.ujroh && !pdfOpsi.jual && !pdfOpsi.infoProgram}
                  className="text-xs font-bold text-[#1A4FA0] hover:underline whitespace-nowrap disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed">📄 Download PDF</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="p-2">Bintang / Paket</th>
                    {kolomKamar.map(kamar => (
                      <th key={kamar} className="p-2 text-right" colSpan={3}>{labelKolomKamar[kamar]}</th>
                    ))}
                  </tr>
                  <tr className="text-left text-gray-400">
                    <th className="p-2"></th>
                    {kolomKamar.map(kamar => (
                      <Fragment key={kamar}>
                        <th className="p-2 text-right font-normal">HPP</th>
                        <th className="p-2 text-right font-normal">Ujroh</th>
                        <th className="p-2 text-right font-normal">Jual</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paketAktif.map((paket) => {
                    const i = PAKET.indexOf(paket);
                    const hpp = hppPerPaket[paket];
                    // CATATAN: komisi_mode/komisi_persen (Custom Hotel per
                    // Kota) SENGAJA TIDAK dipakai di sini — lihat catatan di hppPerPaket.
                    const komisiPaket = pakaiUiPublikSederhana ? (Number(shared.komisi_flat) || 0) : (Number(komisi[paket]) || 0);
                    return (
                      <tr key={paket} className="border-t border-white">
                        <td className="p-2 font-semibold text-gray-600 whitespace-nowrap">{pakaiUiPublikSederhana ? 'Estimasi (opsi hotel pertama)' : pakaiHotelMix ? 'Harga Paket (Custom)' : `Bintang ${i + 3} (${PAKET_LABEL[paket]})`}</td>
                        {kolomKamar.map(kolom => {
                          const kamar = kolom === 'semua' ? KAMAR[0] : kolom;
                          return (
                            <Fragment key={kolom}>
                              <td className="p-2 text-right text-gray-500">{rp(hpp[kamar])}</td>
                              <td className="p-2 text-right text-gray-500">{rp(komisiPaket)}</td>
                              <td className="p-2 text-right font-bold text-[#0E2F6E]">{rp(bulatkanKeAtas(hpp[kamar] + komisiPaket, pembulatan))}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>}
        </div>
      )}
    </div>
  );
}
