// Urutkan array of object berdasar satu field, aman buat angka & string.
export function urutkan(rows, field, dir) {
  if (!field) return rows;
  return [...rows].sort((a, b) => {
    let av = a[field], bv = b[field];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// Cocokkan query pencarian (case-insensitive) ke salah satu field yang dikasih
export const cocok = (q, ...fields) => !q.trim() || fields.some(f => String(f||'').toLowerCase().includes(q.trim().toLowerCase()));
