'use client';
import { useEffect, useRef, useState } from 'react';
import { BASIS_KATEGORI, toggleBasisToken, nilaiItem, itemAktif, cariTierModulNegara, dimsUntukModul, TRIGGER_KUNCI_LIST, tlShareTiket, tlShareVisa } from '@/lib/kalkulatorBiaya';

// Kalkulator biaya/budgeting program v2 — selaras ke Master Sheet Costing
// asli (multi-currency + daftar harga acuan yang bisa dipilih ulang, bukan
// diketik manual tiap kali). Dipakai di 3 tempat: simulasi bebas
// (program-kalkulator-biaya/page.jsx tanpa simpan), simpan sebagai template
// (halaman yang sama, tombol "Simpan Template"), dan nempel ke program
// beneran (admin/programs/page.jsx, hasilnya ngisi kolom hpp_{paket}_{kamar}).
//
// Hotel dikutip per KAMAR per malam (bukan per orang) — HPP per orang beda
// tergantung isi kamar. Item biaya lain (Cost Saudi via Mutawwif, Cost
// Jakarta via Management, Transportation, dll) dianggap rata flat per orang,
// dikonversi ke Rupiah dulu pakai kurs sebelum dijumlah — item2 ini BISA
// dalam SAR/USD/Rupiah sesuai cara vendor Saudi ngutip harga.
//
// Fungsi hitung murninya (KAPASITAS_KAMAR, bulatkanKeAtas, hitungHppKamar,
// nilaiItem, dst) sekarang tinggal di src/lib/kalkulatorBiaya.js (isomorphic,
// bisa dipanggil dari API route server-side) — di-re-export apa adanya dari
// sini di bawah, supaya import existing di file lain TIDAK berubah.
export {
  KAPASITAS_KAMAR, bulatkanKeAtas, TRIGGER_KUNCI_LIST, KOSONG_BREAKDOWN,
  modulTambahanArray, dimsUntukModul, BASIS_KATEGORI, toggleBasisToken, itemAktif,
  cariTierModulNegara, totalAddonModul, rincianAddonModul, paxBerbayarModul, nilaiTarifModul,
  nilaiItem, totalModulNegaraTerpilih, totalTiketPesawat, hitungHppKamar, tlShareTiket, tlShareVisa,
  tlShareTiketVisa, subtotalPerKelompok, hitungHargaJual, itineraryHariModul, includeExcludeModul,
  transportasiOtomatis,
} from '@/lib/kalkulatorBiaya';
const MATA_UANG_LIST = ['IDR', 'SAR', 'USD'];

// Kelompok yang SELALU ada di susunan item tiap kalkulator baru — auto-narik
// semua item aktif dari Master begitu kalkulator dibuat (lihat useEffect
// auto-seed di bawah), gak perlu admin klik "+ Tambah dari Master" manual.
// Program Wisata (non-umroh, murni cost per-negara) cuma butuh Cost Jakarta
// — Cost Saudi/Transportation/Handling Alfiyah semuanya komponen Umroh yang
// gak relevan buat trip tanpa Mekkah/Madinah.
export const KELOMPOK_BASELINE = ['Cost Saudi (Via Mutawwif)', 'Cost Jakarta (Via Management)', 'Cost Transportation', 'Handling Alfiyah', 'Cost Tour Leader'];
const KELOMPOK_BASELINE_WISATA = ['Cost Jakarta (Via Management)'];
// Item Cost Jakarta yang murni Umroh (manasik, akses Haramain, perlengkapan
// jamaah) — di-exclude dari auto-seed Program Wisata (dikonfirmasi user
// 2026-07-27: cuma "Keberangkatan Jakarta - Manasik (Breakfast/Lunch)",
// "Kedatangan Jakarta - Nasi Box + Mineral", "Handling Jakarta", "Asuransi",
// & opsional "Fee Tour Leader" yang kepake). Cuma ngatur auto-seed, bukan
// ngubah trigger_kunci item aslinya — admin tetap bisa tambah/hapus manual.
const ITEM_JAKARTA_KHUSUS_UMROH = ['Fee Ustad Manasik Umroh', 'Akses Mekkah - Madinnah - Haramain Express', 'Perlengkapan Jamaah'];
// `punyaUmroh` = flag jenis_program_master (dulu string-compare `=== 'wisata'`
// — sekarang admin bisa nambah kategori "tanpa Umroh" lain di luar 'wisata',
// jadi harus lookup flag, bukan hardcode 1 nilai).
function kelompokBaselineUntuk(punyaUmroh) {
  return punyaUmroh === false ? KELOMPOK_BASELINE_WISATA : KELOMPOK_BASELINE;
}

// Pill toggle compact buat pilih basis — dipakai di baris Item (tight inline
// row) & Form Item Master (form biasa), satu tampilan konsisten di dua tempat.
export function BasisPicker({ value, onChange }) {
  const basis = value || 'jamaah';
  const tokenAktif = basis === 'flat' ? [] : basis.split('_');
  const pill = (aktif) => `text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 whitespace-nowrap transition-colors ${aktif ? 'bg-[#1A4FA0] text-white border-[#1A4FA0]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`;
  return (
    <div className="flex flex-wrap gap-1 items-center" title="Qty item ini ngikut headcount apa">
      {BASIS_KATEGORI.map(k => (
        <button key={k.token} type="button" onClick={() => onChange(toggleBasisToken(basis, k.token))} className={pill(tokenAktif.includes(k.token))}>
          {k.label}
        </button>
      ))}
      <button type="button" onClick={() => onChange(toggleBasisToken(basis, 'flat'))} className={pill(basis === 'flat')}>
        Flat (1x)
      </button>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const inpSm = "px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-xs";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

/**
 * @param {object} value - shape KOSONG_BREAKDOWN
 * @param {(v: object) => void} onChange
 * @param {boolean} [showNama] - tampilkan input nama (disembunyikan kalau nama diatur di luar, mis. form program)
 * @param {boolean} [hideHotel] - sembunyikan box Hotel Mekkah/Madinah (dipakai kalau hotel diatur terpisah di luar, mis. tabel 3-tier bintang)
 */
export default function KalkulatorBiaya({ value, onChange, showNama = true, hideHotel = false }) {
  const [masterList, setMasterList] = useState([]);
  const [katalogModul, setKatalogModul] = useState([]); // modul negara (Dubai/Turkey dkk) + tiers-nya, buat resolve item yg modul_negara_id-nya keisi
  const [katalogJenisProgram, setKatalogJenisProgram] = useState([]); // jenis_program_master — dulu hardcode, sekarang master data
  const [tambahKelompok, setTambahKelompok] = useState({}); // { [kelompok]: masterItemId terpilih di dropdown }
  // Item auto-seed beda per Jenis Program (Wisata cuma Cost Jakarta, Umroh 4
  // kelompok) — dua ref ini yang bikin auto-seed BISA re-jalan pas admin
  // ganti dropdown Jenis Program, TAPI cuma selama items masih "bersih" (belum
  // diapa-apain manual: belum tambah/hapus/edit item apapun). Begitu admin
  // sentuh item apapun, autoSeedBersih jadi false selamanya buat kalkulator
  // ini — ganti Jenis Program sesudahnya gak lagi nimpa item yang udah
  // dikustomisasi.
  const seededUntuk = useRef(null);
  const autoSeedBersih = useRef(false);

  useEffect(() => {
    fetch('/api/admin/biaya-master-item').then(r => r.json()).then(d => setMasterList(d.item || [])).catch(() => {});
    fetch('/api/admin/modul-negara?full=1').then(r => r.json()).then(d => setKatalogModul(d.modul || [])).catch(() => {});
    fetch('/api/admin/jenis-program').then(r => r.json()).then(d => setKatalogJenisProgram(d.jenis_program || [])).catch(() => {});
  }, []);

  // Auto-narik semua item aktif dari kelompok baseline (beda-beda per Jenis
  // Program, lihat kelompokBaselineUntuk) begitu kalkulator BENER2 baru
  // dibuat atau begitu admin ganti Jenis Program SEBELUM item apapun
  // disentuh manual — biar admin gak perlu klik "+ Tambah dari Master"
  // satu-satu buat item2 standar ini.
  useEffect(() => {
    if (masterList.length === 0 || katalogJenisProgram.length === 0) return;
    if (value.items.length > 0 && !autoSeedBersih.current) return; // sudah dikustomisasi manual, jangan ditimpa
    if (seededUntuk.current === value.jenis_program) return; // udah pas, gak perlu seed ulang
    seededUntuk.current = value.jenis_program;
    const punyaUmroh = katalogJenisProgram.find(j => j.value === value.jenis_program)?.punya_umroh !== false;
    const grup = kelompokBaselineUntuk(punyaUmroh);
    const baseline = masterList.filter(m => grup.includes(m.kelompok) && m.aktif
      && !(!punyaUmroh && ITEM_JAKARTA_KHUSUS_UMROH.includes(m.nama)));
    autoSeedBersih.current = true;
    onChange({
      ...value,
      items: baseline.map(m => ({ master_item_id: m.id, kelompok: m.kelompok, nama: m.nama, nominal: m.harga_default, mata_uang: m.mata_uang, basis: m.basis_default || 'jamaah', trigger_kunci: m.trigger_kunci || null, modul_negara_id: m.modul_negara_id || null })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterList, katalogJenisProgram, value.jenis_program]);

  function set(patch) { onChange({ ...value, ...patch }); }
  function ubahItem(idx, patch) {
    autoSeedBersih.current = false;
    onChange({ ...value, items: value.items.map((it, i) => i === idx ? { ...it, ...patch } : it) });
  }
  function hapusItem(idx) {
    autoSeedBersih.current = false;
    onChange({ ...value, items: value.items.filter((_, i) => i !== idx) });
  }

  function tambahDariMaster(kelompok, masterItemId) {
    const m = masterList.find(x => String(x.id) === String(masterItemId));
    if (!m) return;
    autoSeedBersih.current = false;
    onChange({ ...value, items: [...value.items, { master_item_id: m.id, kelompok: m.kelompok, nama: m.nama, nominal: m.harga_default, mata_uang: m.mata_uang, basis: m.basis_default || 'jamaah', trigger_kunci: m.trigger_kunci || null, modul_negara_id: m.modul_negara_id || null }] });
    setTambahKelompok(prev => ({ ...prev, [kelompok]: '' }));
  }

  function tambahCustom(kelompok) {
    autoSeedBersih.current = false;
    onChange({ ...value, items: [...value.items, { master_item_id: null, kelompok, nama: '', nominal: '', mata_uang: 'IDR', basis: 'jamaah', trigger_kunci: null }] });
  }

  const kelompokList = [...new Set([...masterList.map(m => m.kelompok), ...value.items.map(it => it.kelompok)])];
  if (kelompokList.length === 0) kelompokList.push('Lain-lain');
  // Tiket Flight & Visa TL DIHITUNG OTOMATIS dari pax_tl (bukan item Master
  // manual, lihat tlShareTiket/tlShareVisa) — paksa munculin section "Cost
  // Tour Leader" begitu ada nilainya, biarpun admin belum nambah item apapun
  // ke situ, biar gak ketutup/kehilangan (dikonfirmasi user 2026-08-18,
  // "cost tour leader di internal rusak, gak kehitung flight dan visa").
  const tlTiketGlobal = tlShareTiket(value);
  const tlVisaGlobal = tlShareVisa(value);
  if ((tlTiketGlobal > 0 || tlVisaGlobal > 0) && !kelompokList.includes('Cost Tour Leader')) kelompokList.push('Cost Tour Leader');

  return (
    <div className="space-y-4">
      {showNama && (
        <div>
          <label className={lbl}>Nama Costing Program/Template</label>
          <input value={value.nama} onChange={e => set({ nama: e.target.value })} placeholder="Mis. Umroh 9 Hari Regular" className={inp} />
        </div>
      )}

      {!hideHotel && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-gray-500">🕋 Hotel Mekkah (per kamar/malam)</div>
          <input value={value.hotel_mekkah_nama} onChange={e => set({ hotel_mekkah_nama: e.target.value })} placeholder="Nama hotel" className={inp} />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={value.hotel_mekkah_rate_double} onChange={e => set({ hotel_mekkah_rate_double: e.target.value })} placeholder="Rate Double" className={inp} />
            <input type="number" value={value.hotel_mekkah_rate_triple} onChange={e => set({ hotel_mekkah_rate_triple: e.target.value })} placeholder="Rate Triple" className={inp} />
            <input type="number" value={value.hotel_mekkah_rate_quad} onChange={e => set({ hotel_mekkah_rate_quad: e.target.value })} placeholder="Rate Quad" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={value.hotel_mekkah_malam} onChange={e => set({ hotel_mekkah_malam: e.target.value })} placeholder="Jml malam" className={inp} />
            <select value={value.hotel_mekkah_mata_uang} onChange={e => set({ hotel_mekkah_mata_uang: e.target.value })} className={inp}>
              {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-gray-500">🕌 Hotel Madinah (per kamar/malam)</div>
          <input value={value.hotel_madinah_nama} onChange={e => set({ hotel_madinah_nama: e.target.value })} placeholder="Nama hotel" className={inp} />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={value.hotel_madinah_rate_double} onChange={e => set({ hotel_madinah_rate_double: e.target.value })} placeholder="Rate Double" className={inp} />
            <input type="number" value={value.hotel_madinah_rate_triple} onChange={e => set({ hotel_madinah_rate_triple: e.target.value })} placeholder="Rate Triple" className={inp} />
            <input type="number" value={value.hotel_madinah_rate_quad} onChange={e => set({ hotel_madinah_rate_quad: e.target.value })} placeholder="Rate Quad" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={value.hotel_madinah_malam} onChange={e => set({ hotel_madinah_malam: e.target.value })} placeholder="Jml malam" className={inp} />
            <select value={value.hotel_madinah_mata_uang} onChange={e => set({ hotel_madinah_mata_uang: e.target.value })} className={inp}>
              {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>}

      {kelompokList.map(kelompok => {
        const itemsKelompok = value.items.map((it, idx) => ({ ...it, idx })).filter(it => it.kelompok === kelompok);
        const pilihanMaster = masterList.filter(m => m.kelompok === kelompok);
        const totalItem = (it) => nilaiItem(it, value, katalogModul);
        const pakaiTlKelompok = kelompok === 'Cost Tour Leader';
        const subtotalKelompok = itemsKelompok.reduce((s, it) => s + totalItem(it), 0) + (pakaiTlKelompok ? tlTiketGlobal + tlVisaGlobal : 0);
        return (
          <div key={kelompok} className="border border-gray-200 rounded-xl p-3">
            <div className="text-xs font-bold text-[#0E2F6E] mb-2">{kelompok}</div>
            <div className="space-y-2 mb-2">
              {itemsKelompok.map(it => {
                const aktifTrigger = itemAktif(it.trigger_kunci, value);
                const modul = it.modul_negara_id ? katalogModul.find(m => String(m.id) === String(it.modul_negara_id)) : null;
                const tierKetemu = modul ? cariTierModulNegara(modul, dimsUntukModul(value, it.modul_negara_id), Number(value.pax_jamaah) || 0) : null;
                return (
                  <div key={it.idx} className={`flex flex-wrap gap-2 items-center ${!aktifTrigger ? 'opacity-50' : ''}`}>
                    <input value={it.nama} onChange={e => ubahItem(it.idx, { nama: e.target.value })} placeholder="Nama item" className={`${inpSm} flex-1 min-w-[140px]`} />
                    {modul ? (
                      <>
                        <span className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2 py-1.5 rounded-lg shrink-0 whitespace-nowrap" title="Nominal item ini otomatis dari tabel tier modul negara, bukan diketik manual">
                          📦 {modul.nama}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-500 shrink-0 whitespace-nowrap" title="Total dari tabel tier (harga per-pax × pax jamaah)">
                          = Rp {Math.round(totalItem(it)).toLocaleString('id-ID')}
                        </span>
                        {aktifTrigger && !tierKetemu && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-red-100 text-red-700">
                            ⚠ Tidak ada tarif utk kombinasi ini — cek tabel tier
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <input type="number" value={it.nominal} onChange={e => ubahItem(it.idx, { nominal: e.target.value })} placeholder="Nominal" className={`${inpSm} w-24`} />
                        <select value={it.mata_uang} onChange={e => ubahItem(it.idx, { mata_uang: e.target.value })} className={inpSm}>
                          {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <BasisPicker value={it.basis} onChange={v => ubahItem(it.idx, { basis: v })} />
                        <span className="text-[10px] font-semibold text-gray-500 shrink-0 whitespace-nowrap" title="Total gelondongan item ini (nominal × qty)">
                          = Rp {Math.round(totalItem(it)).toLocaleString('id-ID')}
                        </span>
                        <select value={it.trigger_kunci || ''} onChange={e => ubahItem(it.idx, { trigger_kunci: e.target.value || null })} className={inpSm} title="Trigger yang nentuin item ini ke-hitung atau enggak">
                          {TRIGGER_KUNCI_LIST.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {it.trigger_kunci && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${aktifTrigger ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            {aktifTrigger ? 'ON' : 'trigger OFF'}
                          </span>
                        )}
                      </>
                    )}
                    <button type="button" onClick={() => hapusItem(it.idx)} className="text-red-500 text-xs font-bold hover:underline shrink-0">Hapus</button>
                  </div>
                );
              })}
              {pakaiTlKelompok && (tlTiketGlobal > 0 || tlVisaGlobal > 0) && (
                <>
                  {tlTiketGlobal > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="flex-1 min-w-[140px] text-xs">Tiket Flight TL</span>
                      <span className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2 py-1.5 rounded-lg shrink-0 whitespace-nowrap" title="Otomatis dari Tiket Pesawat × jumlah TL, gak diketik manual">🤖 Otomatis (pax_tl)</span>
                      <span className="text-[10px] font-semibold text-gray-500 shrink-0 whitespace-nowrap">= Rp {Math.round(tlTiketGlobal).toLocaleString('id-ID')}</span>
                    </div>
                  )}
                  {tlVisaGlobal > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="flex-1 min-w-[140px] text-xs">Visa Umroh TL</span>
                      <span className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2 py-1.5 rounded-lg shrink-0 whitespace-nowrap" title="Otomatis dari Visa × jumlah TL, gak diketik manual">🤖 Otomatis (pax_tl)</span>
                      <span className="text-[10px] font-semibold text-gray-500 shrink-0 whitespace-nowrap">= Rp {Math.round(tlVisaGlobal).toLocaleString('id-ID')}</span>
                    </div>
                  )}
                </>
              )}
              {itemsKelompok.length === 0 && !(pakaiTlKelompok && (tlTiketGlobal > 0 || tlVisaGlobal > 0)) && <div className="text-xs text-gray-400">Belum ada item di kelompok ini.</div>}
            </div>
            {(itemsKelompok.length > 0 || (pakaiTlKelompok && (tlTiketGlobal > 0 || tlVisaGlobal > 0))) && (
              <div className="text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] rounded-lg px-2.5 py-1.5 mb-2">
                Subtotal {kelompok}: Rp {Math.round(subtotalKelompok).toLocaleString('id-ID')}
              </div>
            )}
            <div className="flex gap-2 items-center">
              {pilihanMaster.length > 0 && (
                <select value={tambahKelompok[kelompok] || ''} onChange={e => tambahDariMaster(kelompok, e.target.value)} className={`${inpSm} flex-1`}>
                  <option value="">+ Tambah dari Master...</option>
                  {pilihanMaster.map(m => <option key={m.id} value={m.id}>{m.nama} ({m.mata_uang} {Number(m.harga_default).toLocaleString('id-ID')})</option>)}
                </select>
              )}
              <button type="button" onClick={() => tambahCustom(kelompok)} className="text-xs font-bold text-[#1A4FA0] hover:underline shrink-0">+ Custom</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => {
        const nama = prompt('Nama kelompok biaya baru (mis. "Handling Alfiyah"):');
        if (nama?.trim()) tambahCustom(nama.trim());
      }} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Kelompok Biaya Baru</button>
    </div>
  );
}
