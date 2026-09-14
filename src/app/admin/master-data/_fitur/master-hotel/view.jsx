'use client';
import { inp, lbl, rp, sudahKadaluarsa, labelPeriode, KOTA_LABEL } from '../util';

export default function MasterHotelView({
  hotelList,
  hotelFormTerbuka, editHotelId, formHotel, formPeriodeBaru, busyHotel,
  periodeFormUntuk, formPeriode, busyPeriode,
  onMulaiBaruHotel, onBukaEditHotel, onTutupFormHotel, onUbahFormHotel,
  onTambahBarisPeriodeBaru, onUbahBarisPeriodeBaru, onHapusBarisPeriodeBaru,
  onSimpanHotel, onToggleAktifHotel, onHapusHotel,
  onMulaiBaruPeriode, onBukaEditPeriode, onTutupPeriode, onUbahFormPeriode, onSimpanPeriode, onHapusPeriode,
}) {
  return (
    <>
      {!hotelFormTerbuka && (
        <button onClick={onMulaiBaruHotel} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl mb-6">
          + Tambah Hotel
        </button>
      )}

      {hotelFormTerbuka && (
        <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 mb-6">
          <div className="font-bold text-[#0E2F6E] mb-3">{editHotelId ? 'Edit' : 'Tambah'} Hotel</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Kota</label>
              <select value={formHotel.kota} onChange={e => onUbahFormHotel({ kota: e.target.value })} className={inp}>
                <option value="mekkah">Mekkah</option>
                <option value="madinah">Madinah</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Bintang</label>
              <select value={formHotel.bintang} onChange={e => onUbahFormHotel({ bintang: Number(e.target.value) })} className={inp}>
                <option value={3}>Bintang 3</option>
                <option value={4}>Bintang 4</option>
                <option value={5}>Bintang 5</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Nama Hotel *</label>
              <input value={formHotel.nama_hotel} onChange={e => onUbahFormHotel({ nama_hotel: e.target.value })} placeholder="Mis. Hilton Suites" className={inp} />
            </div>
          </div>

          {!editHotelId && (
            <div className="mt-3 space-y-2">
              {formPeriodeBaru.map((p, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-gray-500">Harga Periode {idx + 1}</div>
                    {formPeriodeBaru.length > 1 && (
                      <button type="button" onClick={() => onHapusBarisPeriodeBaru(idx)} className="text-[10px] font-bold text-red-500 hover:underline">Hapus Baris</button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
                      <input type="date" value={p.periode_mulai} onChange={e => onUbahBarisPeriodeBaru(idx, { periode_mulai: e.target.value })} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Periode Selesai</label>
                      <input type="date" value={p.periode_selesai} onChange={e => onUbahBarisPeriodeBaru(idx, { periode_selesai: e.target.value })} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
                      <input type="date" value={p.berlaku_sampai} onChange={e => onUbahBarisPeriodeBaru(idx, { berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={lbl}>Rate Double</label>
                      <input type="number" value={p.rate_double} onChange={e => onUbahBarisPeriodeBaru(idx, { rate_double: e.target.value })} placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Rate Triple</label>
                      <input type="number" value={p.rate_triple} onChange={e => onUbahBarisPeriodeBaru(idx, { rate_triple: e.target.value })} placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Rate Quad</label>
                      <input type="number" value={p.rate_quad} onChange={e => onUbahBarisPeriodeBaru(idx, { rate_quad: e.target.value })} placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Mata Uang</label>
                      <select value={p.mata_uang} onChange={e => onUbahBarisPeriodeBaru(idx, { mata_uang: e.target.value })} className={inp}>
                        <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={onTambahBarisPeriodeBaru} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Periode Lagi</button>
            </div>
          )}
          <div className="text-[10px] text-gray-400 mt-2 mb-3">{editHotelId ? 'Kota/Bintang/Nama Hotel di atas — periode harga dikelola langsung di kartu hotelnya (tutup form ini dulu).' : 'Semua baris periode di atas kesimpen bareng pas Simpan ditekan. Kalau kelewat/mau nambah periode LAGI belakangan (mis. musim baru), tinggal klik "+ Tambah Periode" di kartu hotel — gak perlu bikin ulang hotel baru.'}</div>
          <div className="flex gap-2">
            <button onClick={onSimpanHotel} disabled={busyHotel} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {busyHotel ? 'Menyimpan...' : '💾 Simpan'}
            </button>
            <button onClick={onTutupFormHotel} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Tutup</button>
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
                            <button onClick={() => onBukaEditHotel(h)} className="font-bold text-[#0E2F6E] hover:underline text-sm text-left">{h.nama_hotel}{!h.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}</button>
                            <div className="flex gap-3 shrink-0">
                              <button onClick={() => onMulaiBaruPeriode(h.id)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Periode</button>
                              <button onClick={() => onToggleAktifHotel(h)} className="text-xs font-bold text-amber-600 hover:underline">{h.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                              <button onClick={() => onHapusHotel(h)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
                            </div>
                          </div>

                          {periodeFormUntuk === h.id && (
                            <div className="bg-gray-50 rounded-lg p-3 mb-2">
                              <div className="grid sm:grid-cols-3 gap-2 mb-2">
                                <div>
                                  <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
                                  <input type="date" value={formPeriode.periode_mulai} onChange={e => onUbahFormPeriode({ periode_mulai: e.target.value })} className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Periode Selesai</label>
                                  <input type="date" value={formPeriode.periode_selesai} onChange={e => onUbahFormPeriode({ periode_selesai: e.target.value })} className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
                                  <input type="date" value={formPeriode.berlaku_sampai} onChange={e => onUbahFormPeriode({ berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                <div>
                                  <label className={lbl}>Rate Double</label>
                                  <input type="number" value={formPeriode.rate_double} onChange={e => onUbahFormPeriode({ rate_double: e.target.value })} placeholder="0" className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Rate Triple</label>
                                  <input type="number" value={formPeriode.rate_triple} onChange={e => onUbahFormPeriode({ rate_triple: e.target.value })} placeholder="0" className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Rate Quad</label>
                                  <input type="number" value={formPeriode.rate_quad} onChange={e => onUbahFormPeriode({ rate_quad: e.target.value })} placeholder="0" className={inp} />
                                </div>
                                <div>
                                  <label className={lbl}>Mata Uang</label>
                                  <select value={formPeriode.mata_uang} onChange={e => onUbahFormPeriode({ mata_uang: e.target.value })} className={inp}>
                                    <option value="SAR">SAR</option><option value="USD">USD</option><option value="IDR">IDR</option>
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => onSimpanPeriode(h.id)} disabled={busyPeriode} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">
                                  {busyPeriode ? 'Menyimpan...' : '💾 Simpan Periode'}
                                </button>
                                <button onClick={onTutupPeriode} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-4 py-2 rounded-lg">Tutup</button>
                              </div>
                            </div>
                          )}

                          <div className="space-y-1">
                            {(h.periode || []).length === 0 && <div className="text-xs text-gray-400">Belum ada periode harga.</div>}
                            {(h.periode || []).map(p => (
                              <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 gap-2">
                                <button onClick={() => onBukaEditPeriode(h.id, p)} className="text-left">
                                  <span className={`text-xs ${sudahKadaluarsa(p.periode_selesai, p.berlaku_sampai) ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{labelPeriode(p.periode_mulai, p.periode_selesai, p.berlaku_sampai)}</span>
                                  <span className="text-xs text-gray-500"> · Double {rp(p.rate_double)} / Triple {rp(p.rate_triple)} / Quad {rp(p.rate_quad)} {p.mata_uang}</span>
                                </button>
                                <button onClick={() => onHapusPeriode(p)} className="text-[10px] font-bold text-red-500 hover:underline shrink-0">Hapus</button>
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
