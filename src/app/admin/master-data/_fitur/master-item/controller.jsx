'use client';
import { useState } from 'react';
import MasterItemView from './view';
import { KOSONG_MASTER, urutkanKelompok } from './helpers';
import { simpanMasterItem, toggleAktifMasterItem, hapusMasterItem } from './model';

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

  // Reminder dulu sebelum beneran hapus (dikonfirmasi user 2026-10-02):
  // baris breakdown di program DRAFT/TEMPLATE yang masih makai item ini
  // bakal IKUT TERHAPUS, sementara baris breakdown di program yang SUDAH
  // DIBUAT/publish SAMA SEKALI gak berubah (cuma lepas link traceability-nya,
  // nama/harga di program itu tetap apa adanya).
  async function hapus(m) {
    const { res, d } = await hapusMasterItem(m.id);
    if (res.ok) { reload(); return; }
    if (res.status === 409 && d.confirm_required) {
      const pesan = [
        `Hapus item master "${m.nama}"?`,
        '',
        d.draft_count > 0 ? `• ${d.draft_count} baris biaya di program draft/template — baris ini akan IKUT TERHAPUS.` : null,
        d.published_count > 0 ? `• ${d.published_count} baris biaya di program yang sudah dibuat — TIDAK akan berubah (nama/harga tetap, cuma kehilangan link ke item master ini).` : null,
        '',
        'Lanjutkan hapus?',
      ].filter(Boolean).join('\n');
      if (!confirm(pesan)) return;
      const ulang = await hapusMasterItem(m.id, { paksa: true });
      if (!ulang.res.ok) { alert(ulang.d.error || 'Gagal menghapus'); return; }
      reload();
      return;
    }
    alert(d.error || 'Gagal menghapus');
  }

  return (
    <MasterItemView
      masterList={masterList} modulList={modulList} kelompokMaster={kelompokMaster} formMaster={formMaster}
      onBukaTambahItem={bukaTambahItem} onBukaTambahKategori={bukaTambahKategori} onPilihEdit={pilihEdit}
      onChangeForm={setFormMaster} onSimpan={simpanMaster} onBatal={batal} onToggleAktif={toggleAktif} onHapus={hapus}
    />
  );
}
