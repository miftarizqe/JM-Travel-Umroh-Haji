'use client';

// Agenda "Janji Temu Datang ke Kantor" versi ringkas (dikonfirmasi user
// 2026-10-06 — sebelumnya cuma baris teks "nama (kode) — tanggal", kurang
// kebaca mana yang udah lewat/dekat). Murni tampilan: data & filter role
// tetap dari server/parent, komponen ini gak nentuin siapa boleh lihat apa.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function selisihHari(iso) {
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

// Urgensi -> warna blok kalender + label sisa hari.
function urgensi(n) {
  if (n < 0) return { label: `Terlewat ${-n} hari`, tile: 'bg-red-500 text-white', chip: 'bg-red-100 text-red-700', garis: 'bg-red-300' };
  if (n === 0) return { label: 'Hari ini', tile: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800 animate-pulse', garis: 'bg-amber-300' };
  if (n === 1) return { label: 'Besok', tile: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', garis: 'bg-cyan-300' };
  if (n <= 7) return { label: `${n} hari lagi`, tile: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', garis: 'bg-cyan-300' };
  return { label: `${n} hari lagi`, tile: 'bg-white text-[#0E2F6E] border border-cyan-200', chip: 'bg-gray-100 text-gray-500', garis: 'bg-cyan-100' };
}

export default function AgendaJanjiTemu({ items, batas = 3, terbuka, onToggle, tampilSumber = true }) {
  const data = items
    .filter(it => it.tanggal)
    .map(it => ({ ...it, n: selisihHari(it.tanggal) }))
    .sort((a, b) => a.n - b.n);
  const terlewat = data.filter(d => d.n < 0).length;
  const hariIni = data.filter(d => d.n === 0).length;
  const mingguIni = data.filter(d => d.n > 0 && d.n <= 7).length;
  const tampil = terbuka ? data : data.slice(0, batas);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {terlewat > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠️ {terlewat} terlewat</span>}
        {hariIni > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">📍 {hariIni} hari ini</span>}
        {mingguIni > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800">🗓️ {mingguIni} minggu ini</span>}
      </div>

      <ol className="relative">
        {tampil.map((it, idx) => {
          const d = new Date(it.tanggal);
          const u = urgensi(it.n);
          const terakhir = idx === tampil.length - 1;
          return (
            <li key={`${it.user_id}-${idx}`} className="relative flex gap-3 pb-3">
              {!terakhir && <span className={`absolute left-[23px] top-14 bottom-0 w-0.5 ${u.garis}`} aria-hidden />}
              <div className={`shrink-0 w-12 h-14 rounded-xl flex flex-col items-center justify-center shadow-sm ${u.tile}`}>
                <span className="text-[10px] font-semibold uppercase leading-none opacity-80">{HARI[d.getDay()]}</span>
                <span className="text-lg font-black leading-tight">{String(d.getDate()).padStart(2, '0')}</span>
                <span className="text-[10px] font-semibold uppercase leading-none opacity-80">{BULAN[d.getMonth()]} {String(d.getFullYear()).slice(2)}</span>
              </div>
              <div className="min-w-0 flex-1 bg-white/80 rounded-xl px-3 py-2 border border-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-gray-800 truncate">{it.nama || 'User'}</div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${u.chip}`}>{u.label}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="font-mono bg-gray-100 rounded px-1.5 py-px">{it.kode_unik || '-'}</span>
                  {tampilSumber && it.sumber && <span className="truncate">· {it.sumber}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {data.length > batas && (
        <button onClick={onToggle} className="text-[11px] font-semibold text-cyan-700 hover:underline pl-1">
          {terbuka ? 'Tutup ▲' : `Lihat ${data.length - batas} janji temu lainnya ▼`}
        </button>
      )}
    </div>
  );
}
