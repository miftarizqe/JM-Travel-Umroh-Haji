'use client';
import { useEffect, useState } from 'react';

function useWilayahOptionsTL(level, parentId) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const active = level === 'provinsi' || !!parentId;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    const qs = level === 'provinsi' ? '' : `&parent_id=${parentId}`;
    fetch(`/api/wilayah?level=${level}${qs}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setOptions(d.items || []); })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [level, parentId, active]);

  return { options: active ? options : [], loading: active && loading };
}

// Field "Tempat Lahir" — dropdown Provinsi -> Kota/Kabupaten dari database
// wilayah (dikonfirmasi user 2026-10-21, biar gak ada variasi penulisan
// beda-beda kayak alamat), dengan opsi "Lahir di Luar Negeri" buat ketik
// manual (database wilayah cuma isinya wilayah Indonesia). `value` tetap
// string nama kota/nama manual apa adanya -- drop-in replacement buat input
// teks biasa, kompatibel sama tempat_lahir VARCHAR(100) yang udah ada.
export default function TempatLahirField({ value, onChange, inp, lbl }) {
  const [provinsiIdSel, setProvinsiIdSel] = useState('');
  const [modeLuarNegeri, setModeLuarNegeri] = useState(false);
  const { options: provinsiOpt } = useWilayahOptionsTL('provinsi', null);
  const { options: kotaOpt, loading: loadingKota } = useWilayahOptionsTL('kota', provinsiIdSel);

  if (modeLuarNegeri) {
    return (
      <div>
        {lbl && <label className={lbl}>Tempat Lahir</label>}
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder="Ketik nama kota/negara" className={inp} />
        <button type="button" onClick={() => { setModeLuarNegeri(false); onChange(''); }}
          className="text-[11px] font-bold text-[#1A4FA0] mt-1 hover:underline">← Pilih dari daftar wilayah Indonesia</button>
      </div>
    );
  }

  return (
    <div>
      {lbl && <label className={lbl}>Tempat Lahir</label>}
      <div className="grid grid-cols-2 gap-2">
        <select value={provinsiIdSel} onChange={e => { setProvinsiIdSel(e.target.value); onChange(''); }} className={inp}>
          <option value="">Pilih Provinsi</option>
          {provinsiOpt.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={value && kotaOpt.find(o => o.name === value) ? value : ''} disabled={!provinsiIdSel}
          onChange={e => onChange(e.target.value)} className={inp}>
          <option value="">{!provinsiIdSel ? 'Pilih provinsi dulu' : loadingKota ? 'Memuat...' : 'Pilih Kota/Kabupaten'}</option>
          {kotaOpt.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
        </select>
      </div>
      <button type="button" onClick={() => { setModeLuarNegeri(true); onChange(''); }}
        className="text-[11px] font-bold text-[#1A4FA0] mt-1 hover:underline">Lahir di Luar Negeri? Ketik manual →</button>
    </div>
  );
}
