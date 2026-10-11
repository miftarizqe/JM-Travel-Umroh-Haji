'use client';

// Kartu "Janji Temu Datang ke Kantor" di cluster "Perlu Perhatian" —
// daftar ringkas "nama (kode) · tanggal" (desain versi HoP, dipakai juga di
// dashboard admin; dikonfirmasi user 2026-10-09, gantiin agenda kalender
// AgendaJanjiTemu). Murni tampilan: data & filter role tetap dari parent.
// `onItemClick` / `onTindakLanjut` opsional — HoP read-only jadi gak ngirim.

const tglPendek = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function KartuJanjiTemu({
  items, judul = 'Janji Temu Datang ke Kantor', batas = 3, terbuka, onToggle,
  tampilSumber = false, onItemClick, onTindakLanjut, className = '',
}) {
  const ada = items.length > 0;
  const tampil = terbuka ? items : items.slice(0, batas);
  const label = (it) => `${it.nama || 'User'} (${it.kode_unik || '-'})${tampilSumber && it.sumber ? ` — ${it.sumber}` : ''}${it.tanggal ? ` · ${tglPendek(it.tanggal)}` : ''}`;

  return (
    <div className={`border ${ada ? 'border-cyan-200 bg-cyan-50' : 'border-gray-100 bg-gray-50'} rounded-xl p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`font-semibold text-sm ${ada ? 'text-gray-700' : 'text-gray-400'}`}>🏢 {judul}</div>
        <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full ${ada ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400'}`}>{items.length}</span>
      </div>
      {ada && (
        <div className="mt-2 space-y-1">
          {tampil.map((it, idx) => (
            <div key={`${it.user_id}-${idx}`} onClick={onItemClick ? () => onItemClick(it) : undefined}
              className={`text-xs text-gray-600 bg-white/70 rounded px-2 py-1 truncate ${onItemClick ? 'cursor-pointer hover:bg-white hover:text-[#1A4FA0]' : ''}`}>
              {label(it)}
            </div>
          ))}
          {items.length > batas && (
            <button onClick={onToggle} className="text-[11px] text-gray-500 underline pl-1">
              {terbuka ? 'Tutup ▲' : `+${items.length - batas} lainnya`}
            </button>
          )}
          {onTindakLanjut && (
            <button onClick={onTindakLanjut} className="block text-[11px] font-bold text-[#1A4FA0] underline mt-1">Tindak lanjut →</button>
          )}
        </div>
      )}
    </div>
  );
}
