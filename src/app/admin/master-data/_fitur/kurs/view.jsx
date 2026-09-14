'use client';
import { inp, lbl } from '../util';

export default function KursView({ formKurs, busyKurs, savedKurs, onUbahField, onSimpan }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-md">
      <div className="font-bold text-[#0E2F6E] mb-1">💱 Kurs Kalkulator Publik (Estimasi)</div>
      <div className="text-xs text-gray-400 mb-4">
        Dipakai SEMUA template di Kalkulator Estimasi Publik (Kurasi &amp; Kalkulator Acuan) — ubah di sini otomatis kepakai ke semua, gak perlu edit satu-satu. Kurs di Costing Program internal (per program) TETAP manual &amp; terkunci, gak kepengaruh ini.
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className={lbl}>Kurs SAR → IDR</label>
          <input type="number" value={formKurs.kurs_sar_idr} onChange={e => onUbahField('kurs_sar_idr', e.target.value)} placeholder="5000" className={inp} />
        </div>
        <div>
          <label className={lbl}>Kurs USD → IDR</label>
          <input type="number" value={formKurs.kurs_usd_idr} onChange={e => onUbahField('kurs_usd_idr', e.target.value)} placeholder="18000" className={inp} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onSimpan} disabled={busyKurs} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {busyKurs ? 'Menyimpan...' : '💾 Simpan'}
        </button>
        {savedKurs && <span className="text-sm text-green-600 font-semibold">✅ Tersimpan!</span>}
      </div>
    </div>
  );
}
