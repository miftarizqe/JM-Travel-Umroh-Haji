'use client';
import { inp, lbl, MATA_UANG_LIST, sudahKadaluarsa } from '../util';
import { KOSONG_ADDON, KOSONG_BRACKET, KOSONG_CLUSTER, BASIS_ADDON_LIST, variantUnikTier, cityTourUnikTier, kelompokkanTier, ratakanCluster } from './helpers';

// View — presentational murni: gak ada fetch, gak ada useState. Semua data
// & aksi datang lewat props dari controller.jsx.

// Form tambah/edit Modul Negara (Dubai/Turkey dkk) + editor tabel tier-nya.
// Header (nama/flag pakai_*) disimpan terpisah dari tier (tier
// butuh id modul dulu) — makanya ada 2 tombol simpan berbeda.
//
// Tier di-edit sebagai "cluster": 1 kombinasi Periode/Bintang Hotel/City Tour/
// Hari diisi SEKALI, lalu di bawahnya tinggal nambah baris pax-bracket
// (pax_min/pax_max/harga) — bukan ngulang semua dimensi di tiap baris pax
// kayak sebelumnya. `value.tiers` tetap flat (satu baris per bracket, sesuai
// bentuk yang disimpan API) — cluster cuma tampilan, di-explode balik ke flat
// tiap kali berubah lewat ratakanCluster().
function FormModulNegara({ value, onChange, onSimpan, onBatal, busy }) {
  function batal() {
    if (confirm('Batal? Perubahan yang belum disimpan bakal hilang.')) onBatal();
  }
  const clusters = kelompokkanTier(value.tiers);

  function terapkanCluster(next) {
    onChange({ ...value, tiers: ratakanCluster(next) });
  }
  function tambahCluster() {
    terapkanCluster([...clusters, { ...KOSONG_CLUSTER, brackets: [{ ...KOSONG_BRACKET }] }]);
  }
  function ubahCluster(ci, patch) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, ...patch } : c));
  }
  function hapusCluster(ci) {
    terapkanCluster(clusters.filter((_, i) => i !== ci));
  }
  // Duplikat 1 cluster (periode/bintang/city tour + semua bracket pax-nya) —
  // buat bikin varian baru (mis. Hari yang beda tapi harga per-pax mirip)
  // tanpa harus ngetik ulang semua bracket harga dari nol. `hari` SENGAJA
  // dikosongin (bukan ikut di-copy) — cluster dikelompokkan berdasar kombinasi
  // periode+bintang+city_tour+HARI (lihat kelompokkanTier), jadi kalau hari-nya
  // ikut sama persis, cluster hasil duplikat bakal langsung KE-MERGE BALIK ke
  // cluster asli begitu di-render ulang (key-nya identik), bukan jadi cluster
  // terpisah. Wajib diisi beda dulu sama admin biar gak collide.
  function duplikatCluster(ci) {
    const asli = clusters[ci];
    terapkanCluster([...clusters, { ...asli, hari: '', brackets: asli.brackets.map(b => ({ ...b })) }]);
  }
  function tambahBracket(ci) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, brackets: [...c.brackets, { ...KOSONG_BRACKET }] } : c));
  }
  function ubahBracket(ci, bi, patch) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, brackets: c.brackets.map((b, j) => j === bi ? { ...b, ...patch } : b) } : c));
  }
  function hapusBracket(ci, bi) {
    terapkanCluster(clusters.map((c, i) => i === ci ? { ...c, brackets: c.brackets.filter((_, j) => j !== bi) } : c));
  }

  function tambahAddon() {
    onChange({ ...value, addons: [...(value.addons || []), { ...KOSONG_ADDON }] });
  }
  function ubahAddon(ai, patch) {
    onChange({ ...value, addons: value.addons.map((a, i) => i === ai ? { ...a, ...patch } : a) });
  }
  function hapusAddon(ai) {
    onChange({ ...value, addons: value.addons.filter((_, i) => i !== ai) });
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border-2 border-[#1A4FA0]/30">
      <div>
        <label className={lbl}>Nama Tampil</label>
        <input value={value.nama} onChange={e => onChange({ ...value, nama: e.target.value })} placeholder="Mis. Dubai - MED Alliance" className={inp} />
      </div>
      <div className="w-40">
        <label className={lbl}>Mata Uang Tarif</label>
        <select value={value.mata_uang} onChange={e => onChange({ ...value, mata_uang: e.target.value })} className={inp}>
          {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.pakai_periode} onChange={e => onChange({ ...value, pakai_periode: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Tarif beda per Periode (musim)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.pakai_hotel_star} onChange={e => onChange({ ...value, pakai_hotel_star: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Tarif beda per Bintang Hotel
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.pakai_city_tour_opsi} onChange={e => onChange({ ...value, pakai_city_tour_opsi: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Tarif beda per City Tour
        </label>
      </div>
      <div>
        <label className={lbl}>Info Hotel (opsional)</label>
        <input value={value.info_hotel || ''} onChange={e => onChange({ ...value, info_hotel: e.target.value })} placeholder="Mis. Bintang 4" className={`${inp} max-w-xs`} />
        <div className="text-[10px] text-gray-400 mt-1">
          Cuma info tampilan (mis. buat itinerary/PDF) — gak ngaruh ke harga. Kalau tarifnya emang beda per bintang, pakai toggle &quot;Tarif beda per Bintang Hotel&quot; di atas, bukan field ini.
        </div>
      </div>
      <div>
        <label className={lbl}>TL Gratis Mulai Berapa Jamaah (opsional)</label>
        <input type="number" value={value.tl_gratis_min_pax} onChange={e => onChange({ ...value, tl_gratis_min_pax: e.target.value })} placeholder="Kosongkan kalau TL selalu gratis" className={`${inp} max-w-xs`} />
        <div className="text-[10px] text-gray-400 mt-1">
          Skema umum vendor: &quot;20 jamaah + 1 TL gratis&quot; — isi 20 kalau TL baru gratis mulai grup 20 jamaah (di bawah itu TL tetap kena tarif per-pax penuh). Kosongkan kalau TL emang selalu gratis apapun jumlah jamaahnya.
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">{busy ? 'Menyimpan...' : '💾 Simpan'}</button>
        <button onClick={batal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>

      <div className="border-t border-gray-200 pt-3 space-y-3">
          <div className="text-xs font-bold text-gray-500">Tabel Tier (harga per-pax berdasar jumlah jamaah)</div>
          <div className="text-[10px] text-gray-400 -mt-2">
            Dikelompokkan Hari → City Tour → Bintang Hotel biar gampang dibaca. <b>Bintang Hotel &amp; Nama City Tour BOLEH dikosongin</b> per cluster kalau harganya emang sama terlepas dari dimensi itu — gak perlu bikin kombinasi silang penuh (mis. kalau City Tour &quot;Thaif&quot; harganya sama aja mau hotel bintang berapa, cukup 1 cluster City Tour Thaif tanpa isi Bintang Hotel).
          </div>

          {(() => {
            const urut = clusters
              .map((c, ci) => ({ c, ci }))
              .sort((a, b) => {
                const h = Number(a.c.hari || 0) - Number(b.c.hari || 0);
                if (h !== 0) return h;
                const ct = String(a.c.city_tour_opsi || '').localeCompare(String(b.c.city_tour_opsi || ''));
                if (ct !== 0) return ct;
                return Number(a.c.hotel_star || 0) - Number(b.c.hotel_star || 0);
              });
            let hariSebelumnya, cityTourSebelumnya;
            const elemen = [];
            urut.forEach(({ c, ci }) => {
              if (c.hari !== hariSebelumnya) {
                hariSebelumnya = c.hari; cityTourSebelumnya = undefined;
                elemen.push(
                  <div key={`hari-${ci}`} className="text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] rounded px-2 py-1 mt-2">
                    📅 Hari {c.hari || '?'}
                  </div>
                );
              }
              if (!!value.pakai_city_tour_opsi && c.city_tour_opsi !== cityTourSebelumnya) {
                cityTourSebelumnya = c.city_tour_opsi;
                elemen.push(
                  <div key={`ct-${ci}`} className="text-[11px] font-bold text-gray-500 pl-2 mt-1">
                    🚌 {c.city_tour_opsi || 'Tanpa City Tour spesifik (berlaku semua)'}
                  </div>
                );
              }
              elemen.push(
                <div key={ci} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2 ml-3">
                  {sudahKadaluarsa(c.periode_selesai, c.berlaku_sampai) && (
                    <div className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded inline-block">⚠️ Kadaluarsa — masih bisa dipakai, tapi cek dulu harganya masih valid apa enggak</div>
                  )}
                  <div className="flex flex-wrap gap-2 items-end">
                    {!!value.pakai_periode && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Periode Mulai</div>
                        <input type="date" value={c.periode_mulai} onChange={e => { if (e.target.value) ubahCluster(ci, { periode_mulai: e.target.value }); }} className={`${inp} w-36`} />
                      </div>
                    )}
                    {!!value.pakai_periode && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Periode Selesai</div>
                        <input type="date" value={c.periode_selesai} onChange={e => { if (e.target.value) ubahCluster(ci, { periode_selesai: e.target.value }); }} className={`${inp} w-36`} />
                      </div>
                    )}
                    {!value.pakai_periode && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Berlaku Sampai (opsional)</div>
                        <input type="date" value={c.berlaku_sampai} onChange={e => ubahCluster(ci, { berlaku_sampai: e.target.value })} className={`${inp} w-36`} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — gak pakai musim/periode, kosongkan kalau emang berlaku selamanya." />
                      </div>
                    )}
                    {!!value.pakai_hotel_star && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Bintang Hotel (kosongkan = semua bintang)</div>
                        <input type="number" value={c.hotel_star} onChange={e => ubahCluster(ci, { hotel_star: e.target.value })} placeholder="Semua" className={`${inp} w-24`} />
                      </div>
                    )}
                    {!!value.pakai_city_tour_opsi && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-1">Nama City Tour (kosongkan = semua opsi)</div>
                        <input value={c.city_tour_opsi} onChange={e => ubahCluster(ci, { city_tour_opsi: e.target.value })} placeholder="Mis. Thaif" className={`${inp} w-36`} />
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">Hari</div>
                      <input type="number" value={c.hari} onChange={e => ubahCluster(ci, { hari: e.target.value })} placeholder="Wajib diisi" className={`${inp} w-16`} />
                    </div>
                    <button onClick={() => duplikatCluster(ci)} className="text-[#1A4FA0] text-xs font-bold hover:underline mb-2 ml-auto shrink-0">Duplikat Cluster</button>
                    <button onClick={() => hapusCluster(ci)} className="text-red-500 text-xs font-bold hover:underline mb-2 shrink-0">Hapus Cluster</button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-left text-gray-400">
                          <th className="p-1">Pax Min</th>
                          <th className="p-1">Pax Max (kosong = +)</th>
                          <th className="p-1">Harga/Pax</th>
                          <th className="p-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.brackets.map((b, bi) => (
                          <tr key={bi} className="border-t border-gray-100">
                            <td className="p-1"><input type="number" value={b.pax_min ?? ''} onChange={e => ubahBracket(ci, bi, { pax_min: e.target.value })} className={`${inp} w-20`} /></td>
                            <td className="p-1"><input type="number" value={b.pax_max ?? ''} onChange={e => ubahBracket(ci, bi, { pax_max: e.target.value })} className={`${inp} w-20`} /></td>
                            <td className="p-1"><input type="number" value={b.harga_per_pax ?? ''} onChange={e => ubahBracket(ci, bi, { harga_per_pax: e.target.value })} className={`${inp} w-24`} /></td>
                            <td className="p-1"><button onClick={() => hapusBracket(ci, bi)} className="text-red-500 text-xs font-bold hover:underline">Hapus</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => tambahBracket(ci)} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Pax Bracket</button>
                </div>
              );
            });
            return elemen;
          })()}
          {clusters.length === 0 && <div className="text-xs text-gray-400">Belum ada cluster tier.</div>}

          <button onClick={tambahCluster} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Cluster Baru</button>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="text-xs font-bold text-gray-500">Biaya Tambahan (Visa, Tips Guide, Porter, dkk)</div>
            <div className="text-[10px] text-gray-400">
              Beda dari tabel tier di atas — ini biaya linear (rate tetap × qty), bukan bracket per-jumlah-jamaah. Kalau ada
              beberapa pilihan tarif buat 1 jenis biaya (mis. Visa Regular/Express/Turis), tambahin masing-masing sebagai baris
              terpisah lalu nonaktifkan yang gak dipakai — cuma yang ✅ Aktif yang ke-hitung.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="p-1">Nama</th>
                    <th className="p-1">Mata Uang</th>
                    <th className="p-1">Harga/Unit</th>
                    <th className="p-1">Basis</th>
                    <th className="p-1" title="Kalau dicontreng, headcount-nya jamaah + TL. Kalau enggak, cuma jamaah aja (mis. Tips Guide biasanya cuma ditanggung jamaah, tapi Porter Airport/Hotel tetap kena buat TL juga).">Termasuk TL</th>
                    <th className="p-1">Aktif</th>
                    <th className="p-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {(value.addons || []).map((a, ai) => (
                    <tr key={ai} className="border-t border-gray-100">
                      <td className="p-1"><input value={a.nama} onChange={e => ubahAddon(ai, { nama: e.target.value })} placeholder="Mis. Tips Guide" className={`${inp} w-36`} /></td>
                      <td className="p-1">
                        <select value={a.mata_uang} onChange={e => ubahAddon(ai, { mata_uang: e.target.value })} className={inp}>
                          {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input type="number" value={a.harga_per_unit} onChange={e => ubahAddon(ai, { harga_per_unit: e.target.value })} className={`${inp} w-24`} /></td>
                      <td className="p-1">
                        <select value={a.basis} onChange={e => ubahAddon(ai, { basis: e.target.value })} className={inp}>
                          {BASIS_ADDON_LIST.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                        </select>
                      </td>
                      <td className="p-1 text-center"><input type="checkbox" checked={a.sertakan_tl !== 0 && a.sertakan_tl !== false} onChange={e => ubahAddon(ai, { sertakan_tl: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" /></td>
                      <td className="p-1 text-center"><input type="checkbox" checked={!!a.aktif} onChange={e => ubahAddon(ai, { aktif: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" /></td>
                      <td className="p-1"><button onClick={() => hapusAddon(ai)} className="text-red-500 text-xs font-bold hover:underline">Hapus</button></td>
                    </tr>
                  ))}
                  {(value.addons || []).length === 0 && (
                    <tr><td colSpan={7} className="p-2 text-gray-400">Belum ada biaya tambahan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <button onClick={tambahAddon} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Biaya Tambahan</button>
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="text-xs font-bold text-gray-500">Itinerary (per Program Wisata/Umroh Plus yang pakai modul ini)</div>
            <div className="text-[10px] text-gray-400">
              Diisi per varian Hari (dari tabel tier di atas) — begitu admin pilih modul ini + Hari sekian di kalkulator,
              itinerary di bawah ini otomatis kepasang, gak perlu diketik ulang tiap bikin kalkulator baru.
              {!!value.pakai_city_tour_opsi && ' City Tour beda (mis. Half Day vs Full Day) bisa diisi itinerary beda-beda walau jumlah Hari-nya sama.'}
            </div>
            {(() => {
              const varian = variantUnikTier(value.tiers, value.pakai_city_tour_opsi);
              if (varian.length === 0) {
                return <div className="text-xs text-gray-400">Isi dulu tabel tier di atas (butuh nilai Hari) buat munculin kolom itinerary.</div>;
              }
              function ambilArr(hari, cityTour) {
                const data = value.itinerary_per_hari?.[hari];
                if (Array.isArray(data)) return data;
                if (data && typeof data === 'object') return data[cityTour] || data[''] || [];
                return [];
              }
              function ubahTeks(hari, cityTour, i, teks) {
                const existing = value.itinerary_per_hari?.[hari];
                if (!value.pakai_city_tour_opsi) {
                  const arr = Array.isArray(existing) ? [...existing] : [];
                  arr[i] = teks;
                  onChange({ ...value, itinerary_per_hari: { ...(value.itinerary_per_hari || {}), [hari]: arr } });
                  return;
                }
                const obj = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? { ...existing } : {};
                const arr = Array.isArray(obj[cityTour]) ? [...obj[cityTour]] : [];
                arr[i] = teks;
                onChange({ ...value, itinerary_per_hari: { ...(value.itinerary_per_hari || {}), [hari]: { ...obj, [cityTour]: arr } } });
              }
              let hariSebelumnya;
              const elemen = [];
              varian.forEach(({ hari, cityTour }) => {
                if (hari !== hariSebelumnya) {
                  hariSebelumnya = hari;
                  elemen.push(
                    <div key={`h-${hari}`} className="text-xs font-bold text-[#0E2F6E] bg-[#E8F0FB] rounded px-2 py-1 mt-2">📅 Hari {hari}</div>
                  );
                }
                elemen.push(
                  <div key={`${hari}::${cityTour}`} className="bg-white border border-gray-200 rounded-lg p-3 ml-3">
                    {!!value.pakai_city_tour_opsi && (
                      <div className="text-[11px] font-bold text-gray-500 mb-2">🚌 {cityTour || 'Tanpa City Tour spesifik (berlaku semua)'}</div>
                    )}
                    <div className="space-y-2">
                      {Array.from({ length: Number(hari) }, (_, i) => (
                        <div key={i}>
                          <div className="text-[10px] text-gray-400 mb-1">Hari {i + 1}</div>
                          <textarea
                            value={ambilArr(hari, cityTour)[i] || ''}
                            onChange={e => ubahTeks(hari, cityTour, i, e.target.value)}
                            rows={2} className={`${inp} text-xs`} placeholder={`Kegiatan hari ke-${i + 1}...`} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
              return elemen;
            })()}
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="text-xs font-bold text-gray-500">Include / Exclude (opsional — tambahan info)</div>
            <div className="text-[10px] text-gray-400">
              Digabung OTOMATIS ke daftar Termasuk/Tidak Termasuk Program begitu modul ini dipilih — gak perlu diketik ulang tiap bikin kalkulator baru.
              {!!value.pakai_city_tour_opsi && ' Boleh beda per City Tour (mis. Full Day include makan siang, Half Day enggak).'}
            </div>
            {cityTourUnikTier(value.tiers, value.pakai_city_tour_opsi).map(cityTour => {
              const entry = value.include_exclude?.[cityTour] || {};
              function ubah(field, teks) {
                onChange({ ...value, include_exclude: { ...(value.include_exclude || {}), [cityTour]: { ...entry, [field]: teks } } });
              }
              return (
                <div key={cityTour || '_default'} className="bg-white border border-gray-200 rounded-lg p-3">
                  {!!value.pakai_city_tour_opsi && (
                    <div className="text-[11px] font-bold text-gray-500 mb-2">🚌 {cityTour || 'Tanpa City Tour spesifik (berlaku semua)'}</div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">✅ Termasuk (1 baris per item)</div>
                      <textarea value={entry.include || ''} onChange={e => ubah('include', e.target.value)} rows={3} className={`${inp} text-xs`} placeholder={'Mis.\nTiket masuk Burj Khalifa\nAC bus'} />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">❌ Tidak Termasuk (1 baris per item)</div>
                      <textarea value={entry.exclude || ''} onChange={e => ubah('exclude', e.target.value)} rows={3} className={`${inp} text-xs`} placeholder={'Mis.\nTips guide\nPengeluaran pribadi'} />
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={onSimpan} disabled={busy} className="bg-[#C9952A] hover:bg-[#a97d20] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">{busy ? 'Menyimpan...' : '💾 Simpan'}</button>
          </div>
        </div>
    </div>
  );
}

export default function ModulNegaraView({
  modulList, formModul, busyModul, busyDuplikat,
  onBukaTambah, onPilihEdit, onChangeForm, onSimpan, onBatal, onToggleAktif, onHapus, onDuplikat,
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[#0E2F6E]">Daftar Modul Negara</div>
        {!formModul && (
          <button onClick={onBukaTambah} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Modul Negara</button>
        )}
      </div>
      {formModul && !formModul.id && (
        <div className="mb-4">
          <FormModulNegara value={formModul} onChange={onChangeForm} onSimpan={onSimpan} onBatal={onBatal} busy={busyModul} />
        </div>
      )}
      <div className="space-y-2">
        {modulList.map(m => (
          formModul?.id === m.id ? (
            <FormModulNegara key={m.id} value={formModul} onChange={onChangeForm} onSimpan={onSimpan} onBatal={onBatal} busy={busyModul} />
          ) : (
            <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 bg-white">
              <div className="text-sm">
                <span className="font-semibold text-gray-700">{m.nama}</span>{' '}
                <span className="text-xs text-gray-400">
                  ({m.mata_uang}, {(m.tiers || []).length} tier)
                </span>
                {m.info_hotel && <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🏨 {m.info_hotel}</span>}
                {!m.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onPilihEdit(m)} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                <button onClick={() => onDuplikat(m)} disabled={busyDuplikat} className="text-xs font-bold text-emerald-600 hover:underline disabled:opacity-50">{busyDuplikat ? 'Menduplikat...' : 'Duplikat'}</button>
                <button onClick={() => onToggleAktif(m)} className="text-xs font-bold text-amber-600 hover:underline">{m.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button onClick={() => onHapus(m)} className="text-xs font-bold text-red-600 hover:underline">Hapus</button>
              </div>
            </div>
          )
        ))}
        {modulList.length === 0 && <div className="text-xs text-gray-400">Belum ada modul negara.</div>}
      </div>
    </>
  );
}
