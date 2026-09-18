'use client';
import { BasisPicker, TRIGGER_KUNCI_LIST } from '@/app/components/KalkulatorBiaya';
import { inp, lbl, MATA_UANG_LIST } from '../util';

// Form tambah/edit Master Item — dipakai baik buat "+ Tambah Item" (di atas
// list) maupun buat Edit (nempel inline di baris item yang diedit) biar gak
// perlu scroll ke atas pas edit.
function FormMasterItem({ value, onChange, onSimpan, onBatal, kelompokMaster, modulList = [] }) {
  const modulTerpilih = value.modul_negara_id ? modulList.find(m => String(m.id) === String(value.modul_negara_id)) : null;

  function pilihModul(id) {
    if (!id) { onChange({ ...value, modul_negara_id: null, trigger_kunci: '' }); return; }
    onChange({ ...value, modul_negara_id: Number(id), trigger_kunci: `modul_negara_${id}` });
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border-2 border-[#1A4FA0]/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Kelompok</label>
          <input value={value.kelompok} onChange={e => onChange({ ...value, kelompok: e.target.value })} placeholder="Mis. Cost Saudi (Via Mutawwif)" className={inp} list="kelompok-list" />
          <datalist id="kelompok-list">{kelompokMaster.map(k => <option key={k} value={k} />)}</datalist>
        </div>
        <div>
          <label className={lbl}>Nama Item</label>
          <input value={value.nama} onChange={e => onChange({ ...value, nama: e.target.value })} placeholder="Mis. Ongkos mutawwif ke Airport Jeddah" className={inp} />
        </div>
      </div>
      <div>
        <label className={lbl}>Keterangan (opsional)</label>
        <input value={value.keterangan} onChange={e => onChange({ ...value, keterangan: e.target.value })} className={inp} />
      </div>

      <div>
        <label className={lbl}>Modul Negara (LAWAS — sejak 2026-07-27 sudah gak perlu dipakai lagi, lihat catatan di bawah)</label>
        <select value={value.modul_negara_id || ''} onChange={e => pilihModul(e.target.value)} className={inp}>
          <option value="">— Tidak terkait —</option>
          {modulList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
        </select>
      </div>

      {modulTerpilih ? (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          ⚠ Mekanisme lama — sekarang cost modul negara dihitung LANGSUNG dari &quot;Pilih Modul Negara&quot; di kalkulator
          (gak butuh Item Master lagi). Item ini gak lagi ikut ke-hitung ke HPP; kalau cuma buat data lama, boleh dibiarkan,
          tapi jangan dipakai buat item baru — pilih &quot;— Tidak terkait —&quot; di atas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Harga Default</label>
              <input type="number" value={value.harga_default} onChange={e => onChange({ ...value, harga_default: e.target.value })} className={inp} />
            </div>
            <div>
              <label className={lbl}>Mata Uang</label>
              <select value={value.mata_uang} onChange={e => onChange({ ...value, mata_uang: e.target.value })} className={inp}>
                {MATA_UANG_LIST.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>Basis Qty (item ini ngikut headcount apa)</label>
            <BasisPicker value={value.basis_default} onChange={v => onChange({ ...value, basis_default: v })} />
          </div>
          <div>
            <label className={lbl}>Trigger (kapan item ini ke-hitung otomatis)</label>
            <select value={value.trigger_kunci || ''} onChange={e => onChange({ ...value, trigger_kunci: e.target.value })} className={inp}>
              {TRIGGER_KUNCI_LIST.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={onSimpan} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">💾 Simpan</button>
        <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>
    </div>
  );
}

export default function MasterItemView({
  masterList, modulList, kelompokMaster, formMaster,
  onBukaTambahItem, onBukaTambahKategori, onPilihEdit, onChangeForm, onSimpan, onBatal, onToggleAktif,
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[#0E2F6E]">Daftar Harga Acuan (Master Item)</div>
        {!formMaster && (
          <div className="flex gap-3">
            <button onClick={onBukaTambahKategori} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Kategori Baru</button>
            <button onClick={onBukaTambahItem} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Item</button>
          </div>
        )}
      </div>
      {formMaster && !formMaster.id && (
        <div className="mb-4">
          <FormMasterItem value={formMaster} onChange={onChangeForm} onSimpan={onSimpan} onBatal={onBatal} kelompokMaster={kelompokMaster} modulList={modulList} />
        </div>
      )}

      {kelompokMaster.map(kelompok => (
        <div key={kelompok} className="mb-4">
          <div className="text-xs font-bold text-gray-500 mb-2">{kelompok}</div>
          <div className="space-y-2">
            {masterList.filter(m => m.kelompok === kelompok).map(m => (
              formMaster?.id === m.id ? (
                <FormMasterItem key={m.id} value={formMaster} onChange={onChangeForm} onSimpan={onSimpan} onBatal={onBatal} kelompokMaster={kelompokMaster} modulList={modulList} />
              ) : (
                <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 bg-white">
                  <div className="text-sm">
                    <span className="font-semibold text-gray-700">{m.nama}</span>{' '}
                    {m.modul_negara_id ? (
                      <span className="text-xs text-[#1A4FA0]">(📦 {modulList.find(mn => mn.id === m.modul_negara_id)?.nama || 'Modul Negara'})</span>
                    ) : (
                      <span className="text-xs text-gray-400">({m.mata_uang} {Number(m.harga_default).toLocaleString('id-ID')})</span>
                    )}
                    {!m.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => onPilihEdit(m)} className="text-xs font-bold text-[#1A4FA0] hover:underline">Edit</button>
                    <button onClick={() => onToggleAktif(m)} className="text-xs font-bold text-amber-600 hover:underline">{m.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      ))}
      {masterList.length === 0 && <div className="text-xs text-gray-400">Belum ada item master.</div>}
    </>
  );
}
