'use client';
import { useState } from 'react';
import { inp, lbl, rp, sudahKadaluarsa, labelPeriode } from './util';

const RUTE_LABEL = { direct: 'Direct', transit: 'Transit' };
function kosongTiket() {
  return { nama_rute: '', kota_asal: '', kota_tujuan: '', rute: '', negara_transit_id: '', periode_mulai: '', periode_selesai: '', berlaku_sampai: '', rate: '', mata_uang: 'IDR' };
}

// Tab "✈️ Tiket Pesawat" (Master Harga Tiket Pesawat). `modulList` cuma
// dipakai buat dropdown "Negara Transit" — fitur ini gak nulis/mutasi
// modul negara.
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
  async function simpanHarga() {
    setBusy(true);
    try {
      if (!formTiket.kota_asal.trim() || !formTiket.kota_tujuan.trim()) { alert('Asal dan Tujuan wajib diisi'); setBusy(false); return; }
      // nama_rute (label yang dipakai di mana-mana: list, "Isi dari Master",
      // checklist opsi publik) di-compose otomatis dari Asal + Tujuan — admin
      // gak ngetik langsung lagi, biar strukturnya jelas & konsisten.
      const payload = { ...formTiket, nama_rute: `${formTiket.kota_asal.trim()} - ${formTiket.kota_tujuan.trim()}` };

      const res = await fetch('/api/admin/master-tiket-rate', {
        method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? { ...payload, id: editId } : payload),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
      setEditorTerbuka(false);
      reload();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }
  async function toggleAktifTiket(item) {
    await fetch('/api/admin/master-tiket-rate', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, aktif: !item.aktif }),
    });
    reload();
  }
  async function hapusTiket(item) {
    if (!confirm(`Hapus "${item.nama_rute}"?`)) return;
    const res = await fetch(`/api/admin/master-tiket-rate?id=${item.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    reload();
  }

  return (
    <>
      {!editorTerbuka && (
        <button onClick={mulaiBaruHarga} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl mb-6">
          + Tambah Rate Tiket
        </button>
      )}

      {editorTerbuka && (
        <div className="bg-white rounded-xl border-2 border-[#1A4FA0] p-4 mb-6">
          <div className="font-bold text-[#0E2F6E] mb-3">{editId ? 'Edit' : 'Tambah'} Rate Tiket Pesawat</div>

          <div className="bg-gray-50 rounded-xl p-3 mb-3">
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className={lbl}>Dari (Asal) *</label>
                <input value={formTiket.kota_asal} onChange={e => setFormTiket({ ...formTiket, kota_asal: e.target.value })} placeholder="Mis. Jakarta" className={inp} />
              </div>
              <div>
                <label className={lbl}>Ke (Tujuan) *</label>
                <input value={formTiket.kota_tujuan} onChange={e => setFormTiket({ ...formTiket, kota_tujuan: e.target.value })} placeholder="Mis. Jeddah" className={inp} />
              </div>
            </div>
            <div className={formTiket.rute === 'transit' ? 'grid sm:grid-cols-2 gap-3' : ''}>
              <div>
                <label className={lbl}>Tipe Rute (opsional)</label>
                <select value={formTiket.rute} onChange={e => setFormTiket({ ...formTiket, rute: e.target.value, negara_transit_id: e.target.value === 'transit' ? formTiket.negara_transit_id : '' })} className={inp}>
                  <option value="">— Gak dibedain —</option>
                  <option value="direct">Direct</option>
                  <option value="transit">Transit</option>
                </select>
              </div>
              {formTiket.rute === 'transit' && (
                <div>
                  <label className={lbl}>Negara Transit</label>
                  <select value={formTiket.negara_transit_id} onChange={e => setFormTiket({ ...formTiket, negara_transit_id: e.target.value })} className={inp}>
                    <option value="">— Pilih Negara —</option>
                    {modulList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className={lbl}>Periode Mulai (opsional, kosong = selamanya)</label>
              <input type="date" value={formTiket.periode_mulai} onChange={e => setFormTiket({ ...formTiket, periode_mulai: e.target.value })} className={inp} />
            </div>
            <div>
              <label className={lbl}>Periode Selesai</label>
              <input type="date" value={formTiket.periode_selesai} onChange={e => setFormTiket({ ...formTiket, periode_selesai: e.target.value })} className={inp} />
            </div>
            <div>
              <label className={lbl}>Berlaku Sampai (kalau gak pakai periode)</label>
              <input type="date" value={formTiket.berlaku_sampai} onChange={e => setFormTiket({ ...formTiket, berlaku_sampai: e.target.value })} className={inp} title="Jaring pengaman biar gak diem-diem kepake kalau harganya udah basi — dipakai kalau Periode di atas dibiarin kosong." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={lbl}>Rate</label>
              <input type="number" value={formTiket.rate} onChange={e => setFormTiket({ ...formTiket, rate: e.target.value })} placeholder="0" className={inp} />
            </div>
            <div>
              <label className={lbl}>Mata Uang</label>
              <select value={formTiket.mata_uang} onChange={e => setFormTiket({ ...formTiket, mata_uang: e.target.value })} className={inp}>
                <option value="IDR">IDR</option><option value="SAR">SAR</option><option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={simpanHarga} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {busy ? 'Menyimpan...' : '💾 Simpan'}
            </button>
            <button onClick={() => setEditorTerbuka(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Tutup</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {tiketList.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">Belum ada rate tiket tersimpan.</div>}
        {tiketList.map(t => (
          <div key={t.id} className={`flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 ${!t.aktif ? 'opacity-50' : ''}`}>
            <button onClick={() => bukaTiket(t)} className="text-left">
              <div className="font-bold text-[#0E2F6E] hover:underline">
                {t.nama_rute} {t.rute && <span className="text-xs font-normal text-gray-400">({RUTE_LABEL[t.rute]}{t.rute === 'transit' && t.negara_transit_id ? ` via ${modulList.find(m => m.id === t.negara_transit_id)?.nama || '?'}` : ''})</span>}
              </div>
              <div className={`text-xs ${sudahKadaluarsa(t.periode_selesai, t.berlaku_sampai) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{labelPeriode(t.periode_mulai, t.periode_selesai, t.berlaku_sampai)} · {rp(t.rate)} {t.mata_uang}</div>
            </button>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => toggleAktifTiket(t)} className="text-xs font-bold text-amber-600 hover:underline">{t.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
              <button onClick={() => hapusTiket(t)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
