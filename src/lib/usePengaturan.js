'use client';
import { useEffect, useState } from 'react';

const DEFAULT = {
  wa_kantor: '', bank_nama: '', bank_rekening: '', bank_atas_nama: '',
  alamat_kantor: '', ig_url: '', tiktok_url: '', fb_url: '',
  nama_penandatangan: '', jabatan_penandatangan: '',
  nama_perusahaan: '', telepon_kantor: '', email_kantor: '',
  nama_penandatangan_keuangan: '', jabatan_penandatangan_keuangan: '',
  ttd_penandatangan_keuangan_path: '', cap_perusahaan_path: '',
};

// Cache sederhana di module scope — banyak komponen di halaman yang sama
// bisa pakai usePengaturan() tanpa fetch berkali-kali dalam 1 page load.
let cache = null;

// Nomor WA disimpan macam-macam format (dengan/tanpa 0 di depan) — normalisasi
// dulu sebelum dipakai jadi link wa.me, biar konsisten di semua pemanggil.
export function waLink(nomor, pesan) {
  if (!nomor) return null;
  let n = String(nomor).replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return `https://wa.me/${n}${pesan ? `?text=${encodeURIComponent(pesan)}` : ''}`;
}

// Format tampilan lokal (0823-1057-2050) dari nomor yang disimpan dalam
// format internasional (6282310572050) atau format apa pun.
export function waDisplay(nomor) {
  if (!nomor) return '';
  let n = String(nomor).replace(/\D/g, '');
  if (n.startsWith('62')) n = '0' + n.slice(2);
  return n.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
}

// Pengaturan umum (WA, rekening, alamat, sosmed) — dipakai halaman
// marketing/transaksi. Isi pasal dokumen legal (SPKA/SPKA-Ins/SPKL/Jamaah)
// pakai sumber terpisah (tabel dokumen_pasal, lihat lib/pasalMarkup.jsx) —
// diedit sendiri lewat /admin/pasal, bukan ikut Pengaturan Umum.
export function usePengaturan() {
  const [data, setData] = useState(cache || DEFAULT);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    fetch('/api/pengaturan')
      .then(r => r.json())
      .then(d => {
        cache = d.pengaturan || DEFAULT;
        setData(cache);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return [data, loading];
}
