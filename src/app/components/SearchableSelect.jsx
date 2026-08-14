'use client';
import { useEffect, useRef, useState } from 'react';

// Dropdown yang bisa diketik buat nyari — dipakai gantiin <select> biasa
// pas daftar opsinya panjang (mis. daftar nama perwakilan) supaya
// nggak perlu scroll manual nyari nama.
export default function SearchableSelect({ options, value, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <input
        value={open ? query : (selected?.label || '')}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border-2 border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">Tidak ditemukan</div>
          ) : filtered.map(o => (
            <div key={o.value}
              onClick={() => { onChange(o.value); setQuery(''); setOpen(false); }}
              className="px-3 py-2 text-sm hover:bg-[#E8F0FB] cursor-pointer">
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
