'use client';
import { useState } from 'react';
import { inp, lbl, rp, sudahKadaluarsa, labelPeriode, KOTA_LABEL } from './util';

function kosongHotel() {
  return { kota: 'mekkah', bintang: 3, nama_hotel: '' };
}
function kosongPeriode() {
  return { periode_mulai: '', periode_selesai: '', berlaku_sampai: '', rate_double: '', rate_triple: '', rate_quad: '', mata_uang: 'SAR' };
}

// Tab "🏨 Hotel" (Master Harga Hotel: kota+bintang+nama, entitas induk +
// banyak periode-rate anaknya).
export default function MasterHotelTab({ hotelList, reload }) {
  const [hotelFormTerbuka, setHotelFormTerbuka] = useState(false);
  const [editHotelId, setEditHotelId] = useState(null);
  const [formHotel, setFormHotel] = useState(kosongHotel());
  // Periode-periode yang diisi LANGSUNG di form "Tambah Hotel" (sebelum
  // hotelnya kesimpen sama sekali) — admin bisa "+ Tambah Periode Lagi"
  // berkali-kali di sini, semuanya baru beneran di-POST bareng pas Simpan
  // hotel ditekan (dikonfirmasi user 2026-08-18: gak mau nunggu save dulu
  // baru bisa isi periode lain).
  const [formPeriodeBaru, setFormPeriodeBaru] = useState([kosongPeriode()]);
  const [busyHotel, setBusyHotel] = useState(false);
  const [periodeFormUntuk, setPeriodeFormUntuk] = useState(null); // id master_hotel yang lagi dibuka form periode-nya
  const [editPeriodeId, setEditPeriodeId] = useState(null);
  const [formPeriode, setFormPeriode] = useState(kosongPeriode());
  const [busyPeriode, setBusyPeriode] = useState(false);

  function mulaiBaruHotel() {
    setEditHotelId(null);
    setFormHotel(kosongHotel());
    setFormPeriodeBaru([kosongPeriode()]);
    setHotelFormTerbuka(true);
  }
  function bukaEditHotel(h) {
    setEditHotelId(h.id);
    setFormHotel({ kota: h.kota, bintang: h.bintang, nama_hotel: h.nama_hotel });
    setHotelFormTerbuka(true);
  }
  function tambahBarisPeriodeBaru() {
    setFormPeriodeBaru([...formPeriodeBaru, kosongPeriode()]);
  }
  function ubahBarisPeriodeBaru(idx, patch) {
    setFormPeriodeBaru(formPeriodeBaru.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }
  function hapusBarisPeriodeBaru(idx) {
    setFormPeriodeBaru(formPeriodeBaru.filter((_, i) => i !== idx));
  }
  async function simpanHotel() {
    setBusyHotel(true);
    try {
      if (!formHotel.nama_hotel.trim()) { alert('Nama hotel wajib diisi'); setBusyHotel(false); return; }
      const res = await fetch('/api/admin/master-hotel', {
        method: editHotelId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editHotelId ? { ...formHotel, id: editHotelId } : formHotel),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyHotel(false); return; }
      // Hotel BARU (bukan edit) — sekalian bikin SEMUA baris periode yang
      // udah diisi admin di form yang sama (bisa lebih dari 1, lihat
      // "+ Tambah Periode Lagi") dalam 1 langkah, biar gak perlu nunggu
      // hotel-nya kesimpen dulu baru bisa isi periode lain (dikonfirmasi
      // user 2026-08-18). Baris kosong (rate semua 0/kosong) di-skip, gak
      // ikut kesimpen jadi periode nyampah. Nambah periode BERIKUTNYA (buat
      // hotel yang udah ada) tetap lewat "+ Tambah Periode" di kartu hotel.
      if (!editHotelId) {
        const periodeDiisi = formPeriodeBaru.filter(p => (Number(p.rate_double) || 0) + (Number(p.rate_triple) || 0) + (Number(p.rate_quad) || 0) > 0);
        const hasilPeriode = await Promise.all(periodeDiisi.map(p => fetch('/api/admin/master-hotel-periode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...p, master_hotel_id: d.id }),
        }).then(r => r.json().then(dp => ({ ok: r.ok, dp })))));
        const gagal = hasilPeriode.find(h => !h.ok);
        if (gagal) alert(gagal.dp.error || 'Hotel tersimpan, tapi ada periode yang gagal kesimpen — buka hotelnya & tambah periode manual.');
      }
      setHotelFormTerbuka(false);
      reload();
    } catch { alert('Terjadi kesalahan'); }
    setBusyHotel(false);
  }
  async function toggleAktifHotel(h) {
    await fetch('/api/admin/master-hotel', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: h.id, aktif: !h.aktif }),
    });
    reload();
  }
  async function hapusHotel(h) {
    if (!confirm(`Hapus hotel "${h.nama_hotel}" beserta semua periode harganya?`)) return;
    const res = await fetch(`/api/admin/master-hotel?id=${h.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    reload();
  }

  // ---- Periode-Rate handlers (anak dari Master Hotel) ----
  function mulaiBaruPeriode(hotelId) {
    setEditPeriodeId(null);
    setFormPeriode(kosongPeriode());
    setPeriodeFormUntuk(hotelId);
  }
  function bukaEditPeriode(hotelId, p) {
    setEditPeriodeId(p.id);
    setFormPeriode({
      periode_mulai: p.periode_mulai ? String(p.periode_mulai).slice(0, 10) : '',
      periode_selesai: p.periode_selesai ? String(p.periode_selesai).slice(0, 10) : '',
      berlaku_sampai: p.berlaku_sampai ? String(p.berlaku_sampai).slice(0, 10) : '',
      rate_double: p.rate_double, rate_triple: p.rate_triple, rate_quad: p.rate_quad, mata_uang: p.mata_uang,
    });
    setPeriodeFormUntuk(hotelId);
  }
  async function simpanPeriode(hotelId) {
    setBusyPeriode(true);
    try {
      const payload = { ...formPeriode, master_hotel_id: hotelId };
      const res = await fetch('/api/admin/master-hotel-periode', {
        method: editPeriodeId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPeriodeId ? { ...payload, id: editPeriodeId } : payload),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyPeriode(false); return; }
      setPeriodeFormUntuk(null);
      reload();
    } catch { alert('Terjadi kesalahan'); }
    setBusyPeriode(false);
  }
  async function hapusPeriode(p) {
    if (!confirm('Hapus periode harga ini?')) return;
    const res = await fetch(`/api/admin/master-hotel-periode?id=${p.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    reload();
  }

  return (
    <>
      {!hotelFormTerbuka && (
        <button onClick={mulaiBaruHotel} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl mb-6">
          + Tambah Hotel
        </button>
      )}

      {hotelFormTerbuka && (
        <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 mb-6">
          <div className="font-bold text-[#0E2F6E] mb-3">{editHotelId ? 'Edit' : 'Tambah'} Hotel</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Kota</label>
              <select value={formHotel.kota} onChange={e => setFormHotel({ ...formHotel, kota: e.target.value })} className={inp}>
                <option value="mekkah">Mekkah</option>
                <option value="madinah">Madinah</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Bintang</label>
              <select value={formHotel.bintang} onChange={e => setFormHotel({ ...formHotel, bintang: Number(e.target.value) })} className={inp}>
                <option value={3}>Bintang 3</option>
                <option value={4}>Bintang 4</option>
                <option value={5}>Bintang 5</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Nama Hotel *</label>
              <input value={formHotel.nama_hotel} onChange={e => setFormHotel({ ...formHotel, nama_hotel: e.target.value })} placeholder="Mis. Hilton Suites" className={inp} />
            </div>
          </div>

          {!editHotelId && (
            <div className="mt-3 space-y-2">
              {formPeriodeBaru.map((p, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-gray-500">Harga Periode {idx + 1}</div>
                    {formPeriodeBaru.length > 1 && (
                      <button type="button" onClick={() => hapusBarisPeriodeBaru(idx)} className="text-[10px] font-bold text-red-500 hover:underline">Hapus Baris</button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
                      <input type="date" value={p.periode_mulai} onChange={e => ubahBarisPeriodeBaru(idx, { periode_mulai: e.target.value })} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Periode Selesai</label>
                      <input type="date" value={p.periode_selesai} onChange={e => ubahBarisPeriodeBaru(idx, { periode_selesai: e.target.value })} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
                      <input type="date" value={p.berlaku_sampai} onChange={e => ubahBarisPeriodeBaru(idx, { berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={lbl}>Rate Double</label>
                      <input type="number" value={p.rate_double} onChange={e => ubahBarisPeriodeBaru(idx, { rate_double: e.target.value })} placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Rate Triple</label>
                      <input type="number" value={p.rate_triple} onChange={e => ubahBarisPeriodeBaru(idx, { rate_triple: e.target.value })} placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Rate Quad</label>
                      <input type="number" value={p.rate_quad} onChange={e => ubahBarisPeriodeBaru(idx, { rate_quad: e.target.value })} placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Mata Uang</label>
                      <select value={p.mata_uang} onChange={e => ubahBarisPeriodeBaru(idx, { mata_uang: e.target.value })} className={inp}>
                        <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={tambahBarisPeriodeBaru} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Periode Lagi</button>
            </div>
          )}
          <div className="text-[10px] text-gray-400 mt-2 mb-3">{editHotelId ? 'Kota/Bintang/Nama Hotel di atas — periode harga dikelola langsung di kartu hotelnya (tutup form ini dulu).' : 'Semua baris periode di atas kesimpen bareng pas Simpan ditekan. Kalau kelewat/mau nambah periode LAGI belakangan (mis. musim baru), tinggal klik "+ Tambah Periode" di kartu hotel — gak perlu bikin ulang hotel baru.'}</div>
          <div className="flex gap-2">
            <button onClick={simpanHotel} disabled={busyHotel} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {busyHotel ? 'Menyimpan...' : '💾 Simpan'}
            </button>
            <button onClick={() => setHotelFormTerbuka(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Tutup</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {hotelList.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">Belum ada hotel tersimpan.</div>}
        {['mekkah', 'madinah'].map(kota => {
          const hotelKota = hotelList.filter(h => h.kota === kota);
          if (hotelKota.length === 0) return null;
          return (
            <div key={kota}>
              <div className="text-sm font-bold text-[#0E2F6E] mb-2">{KOTA_LABEL[kota]}</div>
              {[5, 4, 3].map(bintang => {
                const hotelBintang = hotelKota.filter(h => h.bintang === bintang);
                if (hotelBintang.length === 0) return null;
                return (
                  <div key={bintang} className="mb-3">
                    <div className="text-[10px] font-bold text-amber-600 mb-1.5">{'⭐'.repeat(bintang)} Bintang {bintang}</div>
                    <div className="space-y-2">
                      {hotelBintang.map(h => (
                        <div key={h.id} className={`bg-white rounded-xl border border-gray-200 p-3 ${!h.aktif ? 'opacity-50' : ''}`}>
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <button onClick={() => bukaEditHotel(h)} className="font-bold text-[#0E2F6E] hover:underline text-sm text-left">{h.nama_hotel}{!h.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}</button>
                            <div className="flex gap-3 shrink-0">
                              <button onClick={() => mulaiBaruPeriode(h.id)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Periode</button>
                              <button onClick={() => toggleAktifHotel(h)} className="text-xs font-bold text-amber-600 hover:underline">{h.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                              <button onClick={() => hapusHotel(h)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
                            </div>
                          </div>

                          {periodeFormUntuk === h.id && (
                            <div className="bg-gray-50 rounded-lg p-3 mb-2">
                              <div className="grid sm:grid-cols-3 gap-2 mb-2">
                                <div>
                                  <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
                                  <input type="date" value={formPeriode.periode_mulai} onChange={e => setFormPeriode({ ...formPeriode, periode_mulai: e.target.value })} className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Periode Selesai</label>
                                  <input type="date" value={formPeriode.periode_selesai} onChange={e => setFormPeriode({ ...formPeriode, periode_selesai: e.target.value })} className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
                                  <input type="date" value={formPeriode.berlaku_sampai} onChange={e => setFormPeriode({ ...formPeriode, berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                <div>
                                  <label className={lbl}>Rate Double</label>
                                  <input type="number" value={formPeriode.rate_double} onChange={e => setFormPeriode({ ...formPeriode, rate_double: e.target.value })} placeholder="0" className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Rate Triple</label>
                                  <input type="number" value={formPeriode.rate_triple} onChange={e => setFormPeriode({ ...formPeriode, rate_triple: e.target.value })} placeholder="0" className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Rate Quad</label>
                                  <input type="number" value={formPeriode.rate_quad} onChange={e => setFormPeriode({ ...formPeriode, rate_quad: e.target.value })} placeholder="0" className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Mata Uang</label>
                                  <select value={formPeriode.mata_uang} onChange={e => setFormPeriode({ ...formPeriode, mata_uang: e.target.value })} className={inp}>
                                    <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => simpanPeriode(h.id)} disabled={busyPeriode} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">
                                  {busyPeriode ? 'Menyimpan...' : '💾 Simpan Periode'}
                                </button>
                                <button onClick={() => setPeriodeFormUntuk(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-4 py-2 rounded-lg">Tutup</button>
                              </div>
                            </div>
                          )}

                          <div className="space-y-1">
                            {(h.periode || []).length === 0 && <div className="text-xs text-gray-400">Belum ada periode harga.</div>}
                            {(h.periode || []).map(p => (
                              <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 gap-2">
                                <button onClick={() => bukaEditPeriode(h.id, p)} className="text-left">
                                  <span className={`text-xs ${sudahKadaluarsa(p.periode_selesai, p.berlaku_sampai) ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{labelPeriode(p.periode_mulai, p.periode_selesai, p.berlaku_sampai)}</span>
                                  <span className="text-xs text-gray-500"> · Double {rp(p.rate_double)} / Triple {rp(p.rate_triple)} / Quad {rp(p.rate_quad)} {p.mata_uang}</span>
                                </button>
                                <button onClick={() => hapusPeriode(p)} className="text-[10px] font-bold text-red-500 hover:underline shrink-0">Hapus</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
