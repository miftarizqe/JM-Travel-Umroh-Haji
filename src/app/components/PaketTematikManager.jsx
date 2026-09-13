'use client';
import { useEffect, useState } from 'react';
import { KOSONG_BREAKDOWN } from '@/app/components/KalkulatorBiaya';
import KalkulatorTerpadu from '@/app/components/KalkulatorTerpadu';

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";
const KALKULATOR_HOTEL_KOSONG = { mekkah_nama: '', mekkah_rate_double: '', mekkah_rate_triple: '', mekkah_rate_quad: '', mekkah_mata_uang: 'SAR', madinah_nama: '', madinah_rate_double: '', madinah_rate_triple: '', madinah_rate_quad: '', madinah_mata_uang: 'SAR' };

function kosongShared() {
  return {
    ...KOSONG_BREAKDOWN, jenis_program: 'umroh_regular',
    total_hari_program: '', manasik_umroh: '', perlengkapan_jamaah: '', haramain_express: '0', handling_jeddah: '',
    city_tour_mekkah: '', city_tour_madinah: '', city_tour_thaif: '', transportasi_pilihan: null,
  };
}
function kosongHotelSet() {
  return { deluxe: { ...KALKULATOR_HOTEL_KOSONG }, eksekutif: { ...KALKULATOR_HOTEL_KOSONG }, signature: { ...KALKULATOR_HOTEL_KOSONG } };
}

// Kurasi "Paket Tematik" (mis. "Program Umroh Berdua" dkk, private/custom,
// dijual lewat Kalkulator Estimasi Publik) — SAMA PERSIS embed KalkulatorTerpadu
// yang dipakai /admin/program-costing (dasar biaya, hotel per bintang, margin,
// komisi), ditambah nama/deskripsi/foto yang beneran dilihat pengunjung
// publik. config_json (dasar biaya) TIDAK PERNAH keluar ke halaman publik —
// cuma diproses server-side pas pengunjung klik "Hitung Estimasi".
//
// Digabung jadi 1 tab di Master Data (bukan halaman /admin/kalkulator-template
// terpisah lagi) biar admin gak perlu bolak-balik 2 tempat buat data yang
// saling nyambung — dikonfirmasi user 2026-08-18. API-nya TETAP di
// /api/admin/kalkulator-template (gak ganti, cuma tempat UI-nya yang gabung).
//
// Acuan "Umroh Private" (1 per jenis program, BUKAN paket bernama) dikelola
// dari tab Jenis Program (tombol "🧮 Kalkulator Acuan" inline di baris
// masing-masing), bukan di sini — biar gak double tempat buat 1 konsep yang
// sama. Baris tipe='baseline' tetap ada di tabel yang sama, cuma disaring
// keluar dari daftar di sini.
export default function PaketTematikManager() {
  const [templateList, setTemplateList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  const [editorTerbuka, setEditorTerbuka] = useState(false);
  const [editId, setEditId] = useState(null);
  const [nama, setNama] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [gambar, setGambar] = useState('');
  const [urutan, setUrutan] = useState(0);
  const [kalkulatorShared, setKalkulatorShared] = useState(kosongShared());
  const [kalkulatorHotel, setKalkulatorHotel] = useState(kosongHotelSet());
  const [kalkulatorMalam, setKalkulatorMalam] = useState({ mekkah: '', madinah: '' });
  const [kalkulatorKomisi, setKalkulatorKomisi] = useState({ deluxe: '', eksekutif: '', signature: '' });
  const [kalkulatorMargin, setKalkulatorMargin] = useState({ deluxe: '', eksekutif: '', signature: '' });

  function muat() {
    fetch('/api/admin/kalkulator-template').then(r => r.json())
      .then(d => { setTemplateList(d.template || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { muat(); }, []);

  function mulaiBaru() {
    setEditId(null);
    setNama(''); setDeskripsi(''); setGambar(''); setUrutan(0);
    setKalkulatorShared(kosongShared());
    setKalkulatorHotel(kosongHotelSet());
    setKalkulatorMalam({ mekkah: '', madinah: '' });
    setKalkulatorKomisi({ deluxe: '', eksekutif: '', signature: '' });
    setKalkulatorMargin({ deluxe: '', eksekutif: '', signature: '' });
    setEditorTerbuka(true);
  }

  async function bukaTemplate(id) {
    const res = await fetch(`/api/admin/kalkulator-template?id=${id}`);
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal memuat template'); return; }
    const t = d.template;
    let config = t.config_json;
    if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = null; } }
    if (!config) { alert('config_json template ini rusak/kosong'); return; }

    setEditId(t.id);
    setNama(t.nama || ''); setDeskripsi(t.deskripsi || ''); setGambar(t.gambar || ''); setUrutan(t.urutan || 0);
    setKalkulatorShared({ ...kosongShared(), ...(config.shared || {}) });
    setKalkulatorHotel({ ...kosongHotelSet(), ...(config.hotel || {}) });
    setKalkulatorMalam(config.malam || { mekkah: '', madinah: '' });
    setKalkulatorKomisi(config.komisi || { deluxe: '', eksekutif: '', signature: '' });
    setKalkulatorMargin(config.margin || { deluxe: '', eksekutif: '', signature: '' });
    setEditorTerbuka(true);
  }

  async function pilihFoto(file) {
    if (!file) return;
    setUploadingFoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/kalkulator-template/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setGambar(d.path);
      else alert(d.error || 'Gagal mengunggah foto');
    } catch { alert('Terjadi kesalahan saat mengunggah foto'); }
    setUploadingFoto(false);
  }

  async function simpan() {
    if (!nama.trim()) { alert('Nama paket wajib diisi'); return; }
    setBusy(true);
    try {
      const transportasiEfektif = (Number(kalkulatorShared.pax_jamaah) || 0) >= 15 ? 'bus' : kalkulatorShared.transportasi_pilihan;
      const configJson = {
        shared: { ...kalkulatorShared, transportasi_pilihan: transportasiEfektif },
        hotel: kalkulatorHotel, malam: kalkulatorMalam, komisi: kalkulatorKomisi, margin: kalkulatorMargin,
      };
      const payload = {
        nama: nama.trim() || null, deskripsi: deskripsi.trim() || null, gambar: gambar || null, config_json: configJson, urutan: Number(urutan) || 0,
        tipe: 'kurasi', jenis_program: null,
      };
      const res = await fetch('/api/admin/kalkulator-template', {
        method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? { ...payload, id: editId } : payload),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
      setEditorTerbuka(false);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function toggleAktif(t) {
    await fetch('/api/admin/kalkulator-template', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, aktif: !t.aktif }),
    });
    muat();
  }

  async function hapus(t) {
    if (!confirm(`Hapus paket "${t.nama}"?`)) return;
    const res = await fetch(`/api/admin/kalkulator-template?id=${t.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    muat();
  }

  return (
    <div>
      <div className="text-xs text-gray-400 mb-4">
        Paket private/custom (mis. &quot;Program Umroh Berdua&quot;) yang ditawarkan pengunjung website hitung
        estimasi sendiri di <span className="font-semibold">/kalkulator</span> — dasar biaya diatur persis kayak{' '}
        <a href="/admin/program-costing" className="text-[#1A4FA0] font-semibold hover:underline">Costing Program</a>, HPP/margin/komisi
        TIDAK PERNAH dikirim ke pengunjung, cuma harga jual final. Lihat juga{' '}
        <a href="/admin/kalkulator-leads" className="text-[#1A4FA0] font-semibold hover:underline">Ajuan Budget Kalkulator</a> buat follow-up siapa aja yang pakai.
        Acuan &quot;Umroh Private&quot; per jenis program dikelola dari tab{' '}
        <span className="font-semibold">Jenis Program</span> di atas, bukan di sini.
      </div>

      {!editorTerbuka && (
        <button onClick={mulaiBaru} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl mb-6">
          + Paket Baru
        </button>
      )}

      {editorTerbuka && (
        <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 mb-6">
          <div className="font-bold text-[#0E2F6E] mb-3">{editId ? 'Edit Paket' : 'Paket Baru'}</div>

          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className={lbl}>Nama Paket (dilihat pengunjung) *</label>
              <input value={nama} onChange={e => setNama(e.target.value)} placeholder="Mis. Program Umroh Berdua" className={inp} />
            </div>
            <div>
              <label className={lbl}>Urutan Tampil</label>
              <input type="number" value={urutan} onChange={e => setUrutan(e.target.value)} className={inp} />
            </div>
          </div>
          <div className="mb-3">
            <label className={lbl}>Deskripsi (dilihat pengunjung)</label>
            <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)} rows={3} placeholder="Ceritakan paket ini singkat..." className={inp} />
          </div>
          <div className="mb-4">
            <label className={lbl}>Foto Paket (opsional, JPG/PNG maks 10MB)</label>
            <div className="flex items-center gap-3 mb-3">
              {gambar && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={gambar} alt="Foto paket" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
              )}
              <label className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-2 rounded-full cursor-pointer whitespace-nowrap">
                {uploadingFoto ? 'Mengunggah...' : gambar ? 'Ganti Foto' : 'Unggah Foto'}
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" disabled={uploadingFoto}
                  onChange={e => pilihFoto(e.target.files?.[0])} />
              </label>
            </div>

            {/* Foto flyer sering lebih tinggi dari kartu di landing (yang
                crop tetap h-40 object-cover) — slider ini geser bagian
                mana dari foto yang kepotong, tanpa perlu crop ulang
                filenya. Preview di kanan pakai crop persis sama kayak
                kartu landing beneran, biar hasilnya kelihatan langsung. */}
            {gambar && (
              <div className="grid sm:grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
                <div>
                  <label className={lbl}>Posisi Foto (naik/turun di kartu landing)</label>
                  <input type="range" min={0} max={100} step={1}
                    value={kalkulatorShared.gambar_posisi_y ?? 50}
                    onChange={e => setKalkulatorShared({ ...kalkulatorShared, gambar_posisi_y: Number(e.target.value) })}
                    className="w-full accent-[#1A4FA0]" />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Atas</span>
                    <span>Tengah</span>
                    <span>Bawah</span>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Preview Kartu Landing</label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gambar} alt="Preview posisi foto" className="w-full h-40 object-cover rounded-lg border border-gray-200"
                    style={{ objectPosition: `50% ${kalkulatorShared.gambar_posisi_y ?? 50}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-3">
            <div className="text-xs font-bold text-gray-500 mb-2">Dasar Biaya (HPP/Margin/Komisi — internal, gak pernah dilihat pengunjung)</div>
            <KalkulatorTerpadu
              aktif={true} onToggle={() => {}}
              shared={kalkulatorShared} setShared={setKalkulatorShared}
              hotel={kalkulatorHotel} setHotel={setKalkulatorHotel}
              malam={kalkulatorMalam} setMalam={setKalkulatorMalam}
              komisi={kalkulatorKomisi} setKomisi={setKalkulatorKomisi}
              margin={kalkulatorMargin} setMargin={setKalkulatorMargin}
              showTemplatePicker={false} showToggle={false} showOpsiPublik={true} showOpsiHotelAlternatif={true}
            />
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={simpan} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {busy ? 'Menyimpan...' : '💾 Simpan sebagai Paket Tematik'}
            </button>
            <button onClick={() => setEditorTerbuka(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Tutup</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <div className="space-y-2">
          {templateList.filter(t => t.tipe !== 'baseline').length === 0 && (
            <div className="text-center text-gray-400 py-10 text-sm">Belum ada paket tersimpan.</div>
          )}
          {templateList.filter(t => t.tipe !== 'baseline').map(t => (
            <div key={t.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
              <button onClick={() => bukaTemplate(t.id)} className="text-left flex items-center gap-3">
                {t.gambar && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={t.gambar} alt={t.nama} className="w-10 h-10 object-cover rounded-lg border border-gray-200" />
                )}
                <span>
                  <span className="font-bold text-[#0E2F6E] hover:underline block">{t.nama}</span>
                  {!t.aktif && <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">NONAKTIF</span>}
                </span>
              </button>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => toggleAktif(t)} className="text-xs font-bold text-amber-600 hover:underline">{t.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button onClick={() => hapus(t)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
