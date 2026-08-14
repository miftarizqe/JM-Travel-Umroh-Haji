const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

function angkaKeKata(n) {
  n = Math.floor(n);
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${angkaKeKata(n - 10)} Belas`.trim();
  if (n < 100) return `${angkaKeKata(Math.floor(n / 10))} Puluh ${angkaKeKata(n % 10)}`.trim();
  if (n < 200) return `Seratus ${angkaKeKata(n - 100)}`.trim();
  if (n < 1000) return `${angkaKeKata(Math.floor(n / 100))} Ratus ${angkaKeKata(n % 100)}`.trim();
  if (n < 2000) return `Seribu ${angkaKeKata(n - 1000)}`.trim();
  if (n < 1000000) return `${angkaKeKata(Math.floor(n / 1000))} Ribu ${angkaKeKata(n % 1000)}`.trim();
  if (n < 1000000000) return `${angkaKeKata(Math.floor(n / 1000000))} Juta ${angkaKeKata(n % 1000000)}`.trim();
  return `${angkaKeKata(Math.floor(n / 1000000000))} Miliar ${angkaKeKata(n % 1000000000)}`.trim();
}

// Angka -> kata dalam Bahasa Indonesia, dipakai buat baris "Terbilang" di
// invoice/kwitansi. Cukup buat nominal wajar (sampai miliaran) — bukan
// buat presisi matematis arbitrary-precision.
export function terbilang(n) {
  const bulat = Math.round(Number(n) || 0);
  if (bulat === 0) return 'Nol Rupiah';
  return `${angkaKeKata(bulat).replace(/\s+/g, ' ').trim()} Rupiah`;
}
