'use client';
import { useState } from 'react';
import MasterItemView from './view';
import { KOSONG_MASTER, urutkanKelompok } from './helpers';
import { simpanMasterItem, toggleAktifMasterItem } from './model';

export default function MasterItemTab({ masterList, modulList, reload }) {
  const [formMaster, setFormMaster] = useState(null);
  const kelompokMaster = urutkanKelompok([...new Set(masterList.map(m => m.kelompok))]);

  function bukaTambahItem() {
    setFormMaster(KOSONG_MASTER);
  }
  function bukaTambahKategori() {
    const nama = prompt('Nama kategori/kelompok biaya baru (mis. "Handling Alfiyah"):');
    if (nama?.trim()) setFormMaster({ ...KOSONG_MASTER, kelompok: nama.trim() });
  }
  function pilihEdit(m) {
    setFormMaster({ ...m, keterangan: m.keterangan || '', harga_default: m.harga_default, aktif: !!m.aktif });
  }
  function batal() {
    setFormMaster(null);
  }

  async function simpanMaster() {
    if (!formMaster.kelompok.trim() || !formMaster.nama.trim()) { alert('Kelompok & nama wajib diisi'); return; }
    const { res, d } = await simpanMasterItem(formMaster);
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
    setFormMaster(null);
    reload();
  }

  async function toggleAktif(m) {
    await toggleAktifMasterItem(m);
    reload();
  }

  return (
    <MasterItemView
      masterList={masterList} modulList={modulList} kelompokMaster={kelompokMaster} formMaster={formMaster}
      onBukaTambahItem={bukaTambahItem} onBukaTambahKategori={bukaTambahKategori} onPilihEdit={pilihEdit}
      onChangeForm={setFormMaster} onSimpan={simpanMaster} onBatal={batal} onToggleAktif={toggleAktif}
    />
  );
}
