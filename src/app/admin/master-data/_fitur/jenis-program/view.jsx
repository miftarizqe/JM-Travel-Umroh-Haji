'use client';
import KalkulatorAcuanEditor from '@/app/components/KalkulatorAcuanEditor';
import { inp, lbl } from '../util';

const TIPE_PROGRAM_LIST = ['Umroh', 'Haji', 'Wisata Muslim'];

// Form tambah/edit Jenis Program (Umroh Regular/Plus/Haji/Wisata dkk) — dulu
// daftar hardcode developer, sekarang admin yang kelola sendiri. `value`
// (slug) diturunkan OTOMATIS dari label pas dibuat, gak bisa diubah lagi
// setelahnya (dipakai sebagai identifier stabil di banyak tabel lain).
function FormJenisProgram({ value, onChange, onSimpan, onBatal, busy }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border-2 border-[#1A4FA0]/30">
      <div>
        <label className={lbl}>Nama Kategori *</label>
        <input value={value.label} onChange={e => onChange({ ...value, label: e.target.value })} placeholder="Mis. Umroh VIP" className={inp} />
        {value.value && <div className="text-[10px] text-gray-400 mt-1">Kode internal: {value.value} (gak bisa diubah setelah dibuat)</div>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.punya_umroh} onChange={e => onChange({ ...value, punya_umroh: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Ada leg Mekkah/Madinah (Umroh)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!value.boleh_modul_negara} onChange={e => onChange({ ...value, boleh_modul_negara: e.target.checked })} className="w-4 h-4 accent-[#1A4FA0]" />
          Boleh tambah Negara (Turkey/Dubai/dll)
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Tipe Program (buat kategori Program nanti)</label>
          <select value={value.tipe_program} onChange={e => onChange({ ...value, tipe_program: e.target.value })} className={inp}>
            {TIPE_PROGRAM_LIST.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Urutan Tampil</label>
          <input type="number" value={value.urutan} onChange={e => onChange({ ...value, urutan: e.target.value })} className={inp} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">{busy ? 'Menyimpan...' : '💾 Simpan'}</button>
        <button onClick={onBatal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">Batal</button>
      </div>
    </div>
  );
}

export default function JenisProgramView({
  jenisProgramList, formJenisProgram, busyJenisProgram,
  onBukaTambah, onPilihEdit, onChangeForm, onSimpan, onBatal, onToggleAktif, onHapus,
}) {
  return (
    <>
      <div className="text-xs text-gray-400 mb-4">
        Kategori paket (Umroh Regular/Plus/Haji/Wisata dkk) — dipakai di dropdown &quot;Jenis Program&quot; pas bikin Program baru & Template Kalkulator baseline. &quot;Ada leg Mekkah/Madinah&quot; nentuin field-field Umroh (mutawwif, city tour, dst) muncul atau enggak; &quot;Boleh tambah Negara&quot; nentuin bisa nawarin Turkey/Dubai/dll atau enggak.
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[#0E2F6E]">Daftar Jenis Program</div>
        {!formJenisProgram && (
          <button onClick={onBukaTambah} className="text-xs font-bold text-[#1A4FA0] hover:underline">+ Tambah Jenis Program</button>
        )}
      </div>
      {formJenisProgram && !formJenisProgram.value && (
        <div className="mb-4">
          <FormJenisProgram value={formJenisProgram} onChange={onChangeForm} onSimpan={onSimpan} onBatal={onBatal} busy={busyJenisProgram} />
        </div>
      )}
      <div className="space-y-2">
        {jenisProgramList.map(j => (
          formJenisProgram?.value === j.value ? (
            <div key={j.value} className="space-y-3">
              <FormJenisProgram value={formJenisProgram} onChange={onChangeForm} onSimpan={onSimpan} onBatal={onBatal} busy={busyJenisProgram} />
              <KalkulatorAcuanEditor jenisProgramValue={j.value} jenisProgramLabel={j.label} />
            </div>
          ) : (
            <div key={j.value} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 bg-white">
              <div className="text-sm">
                <span className="font-semibold text-gray-700">{j.label}</span>{' '}
                <span className="text-xs text-gray-400">({j.tipe_program})</span>
                {!!j.punya_umroh && <span className="ml-2 text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-1.5 py-0.5 rounded">🕌 Umroh</span>}
                {!!j.boleh_modul_negara && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">🌍 Modul Negara</span>}
                {!j.aktif && <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">NONAKTIF</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onPilihEdit(j)} className="text-xs font-bold text-[#1A4FA0] hover:underline" title={'Edit kategori ini + Kalkulator Acuan (dasar harga jalur "Umroh Private")'}>Edit</button>
                <button onClick={() => onToggleAktif(j)} className="text-xs font-bold text-amber-600 hover:underline">{j.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button onClick={() => onHapus(j)} className="text-xs font-bold text-red-600 hover:underline">Hapus</button>
              </div>
            </div>
          )
        ))}
        {jenisProgramList.length === 0 && <div className="text-xs text-gray-400">Belum ada jenis program.</div>}
      </div>
    </>
  );
}
