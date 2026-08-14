'use client';

// Header kolom yang bisa diklik buat sort asc/desc — dipakai tiap tabel yang
// butuh sort. Tabel yang urutannya merepresentasikan struktur pohon
// (indentasi berjenjang) SENGAJA tidak dikasih ini — sort per-kolom bakal
// ngerusak tampilan hierarkinya.
export default function SortTh({ field, sort, onSort, align = 'left', children }) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-${align} cursor-pointer select-none hover:bg-white/10 whitespace-nowrap`}
    >
      {children}
      <span className="inline-block w-3 ml-0.5 text-[10px] opacity-80">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
    </th>
  );
}
