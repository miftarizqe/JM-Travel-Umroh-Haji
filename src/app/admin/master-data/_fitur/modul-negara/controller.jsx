'use client';
import { useState } from 'react';
import ModulNegaraView from './view';
import { KOSONG_MODUL } from './helpers';
import { simpanHeaderModulNegara, simpanTierModulNegara, simpanAddonModulNegara, toggleAktifModulNegara, hapusModulNegara } from './model';

// Controller — pegang state UI + orkestrasi Model, teruskan ke View lewat
// props. `modulList` datang dari page.jsx (dimuat bareng data master lain
// via model.ambilModulNegara), `reload` dipanggil abis mutasi biar data di
// semua tab ke-refresh (beberapa item lintas-tab nunjuk balik ke modul
// negara, mis. Master Item & Master Tiket).
export default function ModulNegaraTab({ modulList, reload }) {
  const [formModul, setFormModul] = useState(null);
  const [busyModul, setBusyModul] = useState(false);
  const [busyDuplikat, setBusyDuplikat] = useState(false);

  function bukaTambah() {
    setFormModul(KOSONG_MODUL);
  }
  function pilihEdit(m) {
    setFormModul({ ...m, tiers: m.tiers || [], addons: m.addons || [], itinerary_per_hari: m.itinerary_per_hari || {}, include_exclude: m.include_exclude || {}, tl_gratis_min_pax: m.tl_gratis_min_pax ?? '' });
  }
  function batal() {
    setFormModul(null);
  }

  async function simpanModul() {
    if (!formModul.nama.trim()) { alert('Nama wajib diisi'); return; }
    setBusyModul(true);
    const { res, d } = await simpanHeaderModulNegara(formModul);
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyModul(false); return; }
    const modulId = formModul.id || d.id;

    const [tierOk, addonOk] = await Promise.all([
      simpanTierModulNegara(modulId, formModul.tiers),
      simpanAddonModulNegara(modulId, formModul.addons),
    ]);
    setBusyModul(false);
    if (!tierOk || !addonOk) { alert('Header kesimpen, tapi tier/biaya tambahan gagal kesimpen — coba klik Simpan sekali lagi.'); await reload(); return; }
    await reload();
    setFormModul(null);
  }

  async function toggleAktifModul(m) {
    await toggleAktifModulNegara(m);
    reload();
  }

  // Hapus permanen (tier & addon ikut kehapus lewat ON DELETE CASCADE). Kalau
  // modul ini masih ditautkan ke Item Master/breakdown, DB nolak lewat FK
  // constraint — API balikin pesan yang jelasin itu, bukan cuma "gagal".
  async function hapusModul(m) {
    if (!confirm(`Hapus modul negara "${m.nama}"? Semua tabel tier & biaya tambahannya ikut kehapus. Kalau masih dipakai program lain, sebaiknya "Nonaktifkan" saja.`)) return;
    const { res, d } = await hapusModulNegara(m.id);
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    if (formModul?.id === m.id) setFormModul(null);
    reload();
  }

  // Duplikat 1 modul negara (header + SEMUA tier + addon) jadi modul BARU —
  // LANGSUNG kesimpen ke DB berurutan (header dulu buat dapet id baru, baru
  // tier & addon nempel ke id itu), bukan cuma disalin ke form lokal kayak
  // sebelumnya. Versi lama bikin tier/addon BARU beneran kesimpen kalau admin
  // masih inget klik "Simpan Tabel Tier"/"Simpan Biaya Tambahan" manual
  // sesudahnya — gampang kelewat, jadi duplikatnya keliatan "kosong" tier-nya.
  async function duplikatModul(m) {
    setBusyDuplikat(true);
    const header = {
      nama: `${m.nama} (Copy)`, mata_uang: m.mata_uang,
      pakai_periode: m.pakai_periode, pakai_hotel_star: m.pakai_hotel_star, info_hotel: m.info_hotel || '', pakai_city_tour_opsi: m.pakai_city_tour_opsi,
      urutan: m.urutan, itinerary_per_hari: m.itinerary_per_hari || {}, include_exclude: m.include_exclude || {}, tl_gratis_min_pax: m.tl_gratis_min_pax ?? '',
    };
    const { res: resHeader, d: dHeader } = await simpanHeaderModulNegara(header);
    if (!resHeader.ok) { alert(dHeader.error || 'Gagal duplikat modul'); setBusyDuplikat(false); return; }
    const newId = dHeader.id;

    const tiers = (m.tiers || []).map(t => ({ ...t, id: undefined, modul_negara_id: undefined }));
    const addons = (m.addons || []).map(a => ({ ...a, id: undefined, modul_negara_id: undefined }));
    const [tierOk, addonOk] = await Promise.all([
      simpanTierModulNegara(newId, tiers),
      simpanAddonModulNegara(newId, addons),
    ]);
    if (!tierOk || !addonOk) alert('Header berhasil diduplikat, tapi ada tier/biaya tambahan yang gagal ikut tersalin — cek & simpan ulang manual di form-nya.');

    setBusyDuplikat(false);
    await reload();
    setFormModul({ ...header, id: newId, aktif: true, tiers, addons });
  }

  return (
    <ModulNegaraView
      modulList={modulList} formModul={formModul} busyModul={busyModul} busyDuplikat={busyDuplikat}
      onBukaTambah={bukaTambah} onPilihEdit={pilihEdit} onChangeForm={setFormModul}
      onSimpan={simpanModul} onBatal={batal} onToggleAktif={toggleAktifModul} onHapus={hapusModul} onDuplikat={duplikatModul}
    />
  );
}
