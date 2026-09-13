'use client';
import { useEffect, useState } from 'react';
import { KOSONG_BREAKDOWN } from '@/app/components/KalkulatorBiaya';
import KalkulatorTerpadu from '@/app/components/KalkulatorTerpadu';

const KALKULATOR_HOTEL_KOSONG = { mekkah_nama: '', mekkah_rate_double: '', mekkah_rate_triple: '', mekkah_rate_quad: '', mekkah_mata_uang: 'SAR', madinah_nama: '', madinah_rate_double: '', madinah_rate_triple: '', madinah_rate_quad: '', madinah_mata_uang: 'SAR' };
function kosongShared(jenisProgram) {
  return {
    ...KOSONG_BREAKDOWN, jenis_program: jenisProgram,
    total_hari_program: '', manasik_umroh: '', perlengkapan_jamaah: '', haramain_express: '0', handling_jeddah: '',
    city_tour_mekkah: '', city_tour_madinah: '', city_tour_thaif: '', transportasi_pilihan: null,
  };
}
function kosongHotelSet() {
  return { deluxe: { ...KALKULATOR_HOTEL_KOSONG }, eksekutif: { ...KALKULATOR_HOTEL_KOSONG }, signature: { ...KALKULATOR_HOTEL_KOSONG } };
}

// Editor "Kalkulator Acuan" (baseline, 1 per jenis program, dasar biaya
// jalur "Umroh Private") — dibuka INLINE dari baris Jenis Program di Master
// Data, BUKAN halaman terpisah (dulu /admin/kalkulator-template?jenis_program=X
// — user bilang kerasa "double" buat 2 hal yang sebenernya 1 konsep, acuan
// itu atribut Jenis Program bukan entitas sendiri). Datanya TETAP 1 baris
// tipe='baseline' di kalkulator_template_publik di belakang layar (gak ada
// migrasi/skema baru) — cuma pengalaman ngeditnya yang disatuin di sini.
export default function KalkulatorAcuanEditor({ jenisProgramValue, jenisProgramLabel, onTutup = null }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState(null);
  const [kalkulatorShared, setKalkulatorShared] = useState(kosongShared(jenisProgramValue));
  const [kalkulatorHotel, setKalkulatorHotel] = useState(kosongHotelSet());
  const [kalkulatorMalam, setKalkulatorMalam] = useState({ mekkah: '', madinah: '' });
  const [kalkulatorKomisi, setKalkulatorKomisi] = useState({ deluxe: '', eksekutif: '', signature: '' });
  const [kalkulatorMargin, setKalkulatorMargin] = useState({ deluxe: '', eksekutif: '', signature: '' });

  async function bukaExisting(id) {
    const res = await fetch(`/api/admin/kalkulator-template?id=${id}`);
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal memuat kalkulator acuan'); setLoading(false); return; }
    const t = d.template;
    let config = t.config_json;
    if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = null; } }
    if (config) {
      setTemplateId(t.id);
      setKalkulatorShared({ ...kosongShared(jenisProgramValue), ...(config.shared || {}) });
      setKalkulatorHotel({ ...kosongHotelSet(), ...(config.hotel || {}) });
      setKalkulatorMalam(config.malam || { mekkah: '', madinah: '' });
      setKalkulatorKomisi(config.komisi || { deluxe: '', eksekutif: '', signature: '' });
      setKalkulatorMargin(config.margin || { deluxe: '', eksekutif: '', signature: '' });
    }
    setLoading(false);
  }

  useEffect(() => {
    fetch('/api/admin/kalkulator-template').then(r => r.json())
      .then(d => {
        const existing = (d.template || []).find(t => t.tipe === 'baseline' && t.jenis_program === jenisProgramValue);
        if (existing) bukaExisting(existing.id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jenisProgramValue]);

  async function simpan() {
    setBusy(true);
    try {
      const transportasiEfektif = (Number(kalkulatorShared.pax_jamaah) || 0) >= 15 ? 'bus' : kalkulatorShared.transportasi_pilihan;
      const configJson = {
        shared: { ...kalkulatorShared, transportasi_pilihan: transportasiEfektif },
        hotel: kalkulatorHotel, malam: kalkulatorMalam, komisi: kalkulatorKomisi, margin: kalkulatorMargin,
      };
      const payload = { tipe: 'baseline', jenis_program: jenisProgramValue, config_json: configJson };
      const res = await fetch('/api/admin/kalkulator-template', {
        method: templateId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateId ? { ...payload, id: templateId } : payload),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
      if (!templateId) setTemplateId(d.id);
      alert('Kalkulator acuan tersimpan!');
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  return (
    <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-purple-700 text-sm">🧮 Kalkulator Acuan — {jenisProgramLabel}</div>
        {onTutup && <button onClick={onTutup} className="text-xs font-bold text-gray-500 hover:underline">Tutup</button>}
      </div>
      <div className="text-[10px] text-purple-600/80 mb-3">
        Bukan paket bernama — dasar biaya buat jalur &quot;Umroh Private&quot;: pengunjung pilih jenis program ini sendiri di /kalkulator, lalu isi preferensinya (durasi, malam, hotel, dst) sendiri.
      </div>
      {loading ? (
        <div className="text-xs text-gray-400 py-6 text-center">Memuat...</div>
      ) : (
        <>
          <KalkulatorTerpadu
            aktif={true} onToggle={() => {}}
            shared={kalkulatorShared} setShared={setKalkulatorShared}
            hotel={kalkulatorHotel} setHotel={setKalkulatorHotel}
            malam={kalkulatorMalam} setMalam={setKalkulatorMalam}
            komisi={kalkulatorKomisi} setKomisi={setKalkulatorKomisi}
            margin={kalkulatorMargin} setMargin={setKalkulatorMargin}
            showTemplatePicker={false} showToggle={false} showOpsiPublik={true} showOpsiHotelAlternatif={true} sembunyikanTotalHari={true}
          />
          <div className="flex gap-2 mt-4">
            <button onClick={simpan} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {busy ? 'Menyimpan...' : '💾 Simpan'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
