'use client';
import { useState } from 'react';
import MasterTiketView from './view';
import { kosongTiket } from './helpers';
import { simpanTiket, toggleAktifTiket, hapusTiket } from './model';

export default function MasterTiketTab({ tiketList, modulList, reload }) {
  const [editorTerbuka, setEditorTerbuka] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formTiket, setFormTiket] = useState(kosongTiket());
  const [busy, setBusy] = useState(false);

  function mulaiBaruHarga() {
    setEditId(null);
    setFormTiket(kosongTiket());
    setEditorTerbuka(true);
  }
  function bukaTiket(t) {
    setEditId(t.id);
    setFormTiket({
      nama_rute: t.nama_rute, kota_asal: t.kota_asal || '', kota_tujuan: t.kota_tujuan || '',
      rute: t.rute || '', negara_transit_id: t.negara_transit_id || '',
      periode_mulai: t.periode_mulai ? String(t.periode_mulai).slice(0, 10) : '',
      periode_selesai: t.periode_selesai ? String(t.periode_selesai).slice(0, 10) : '',
      berlaku_sampai: t.berlaku_sampai ? String(t.berlaku_sampai).slice(0, 10) : '',
      rate: t.rate, mata_uang: t.mata_uang,
    });
    setEditorTerbuka(true);
  }
  function ubahForm(patch) {
    setFormTiket(prev => ({ ...prev, ...patch }));
  }
  async function simpanHarga() {
    setBusy(true);
    try {
      if (!formTiket.kota_asal.trim() || !formTiket.kota_tujuan.trim()) { alert('Asal dan Tujuan wajib diisi'); setBusy(false); return; }
      // nama_rute (label yang dipakai di mana-mana: list, "Isi dari Master",
      // checklist opsi publik) di-compose otomatis dari Asal + Tujuan — admin
      // gak ngetik langsung lagi, biar strukturnya jelas & konsisten.
      const payload = { ...formTiket, nama_rute: `${formTiket.kota_asal.trim()} - ${formTiket.kota_tujuan.trim()}` };
      const { res, d } = await simpanTiket(payload, editId);
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
      setEditorTerbuka(false);
      reload();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }
  async function toggleAktif(item) {
    await toggleAktifTiket(item);
    reload();
  }
  async function hapus(item) {
    if (!confirm(`Hapus "${item.nama_rute}"?`)) return;
    const { res, d } = await hapusTiket(item.id);
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    reload();
  }

  return (
    <MasterTiketView
      tiketList={tiketList} modulList={modulList} editorTerbuka={editorTerbuka} editId={editId} formTiket={formTiket} busy={busy}
      onMulaiBaruHarga={mulaiBaruHarga} onBukaTiket={bukaTiket} onTutupEditor={() => setEditorTerbuka(false)} onUbahForm={ubahForm}
      onSimpanHarga={simpanHarga} onToggleAktif={toggleAktif} onHapus={hapus}
    />
  );
}
