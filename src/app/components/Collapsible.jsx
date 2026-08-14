'use client';
import { useState } from 'react';

// Section list yang bisa ditutup/dibuka — header (judul + badge opsional + tombol aksi)
// tetap selalu terlihat, isi disembunyikan saat collapsed. `actions` dipisah dari
// tombol toggle supaya klik tombol export/dsb di header tidak ikut toggle collapse.
export function CollapsibleSection({ title, badge, defaultOpen = true, actions, children, className = '', bodyClassName = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left">
          <span className="text-gray-400 text-xs w-3 inline-block">{open ? '▼' : '▶'}</span>
          {title}
          {(badge || badge === 0) && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{badge}</span>
          )}
        </button>
        {actions}
      </div>
      {open && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}

// Item accordion — untuk kartu/baris list yang ringkas secara default lalu
// diklik untuk lihat detail lengkap. `header` selalu tampil, `children` cuma
// dirender kalau item ini yang lagi expanded (dikontrol dari parent, biar cuma
// 1 yang kebuka dalam satu list kalau parent mau begitu).
export function AccordionItem({ header, open, onToggle, children, className = '' }) {
  return (
    <div className={className}>
      <div className="cursor-pointer" onClick={onToggle}>{header}</div>
      {open && children}
    </div>
  );
}
