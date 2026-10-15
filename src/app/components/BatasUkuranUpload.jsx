'use client';
import { useEffect } from 'react';
import { pesanUkuranFile } from '@/lib/batasUpload';

// Guard global semua <input type="file"> di app: file kebesaran (gambar >3MB,
// PDF >5MB) langsung ditolak pas dipilih, SEBELUM onChange React jalan —
// jadi tiap halaman upload gak perlu nulis cek ukuran sendiri-sendiri.
// Listener capture di window jalan duluan sebelum listener root React, jadi
// stopImmediatePropagation bikin onChange halaman gak kepanggil sama sekali.
// Input yang file-nya diproses dulu sebelum diunggah (mis. crop/rotate di
// UploadBon) bisa opt-out pakai data-cek-ukuran="off" lalu cek hasil akhirnya
// sendiri. Server tetap validasi ulang di tiap endpoint.
export default function BatasUkuranUpload() {
  useEffect(() => {
    function onChange(e) {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
      if (input.dataset.cekUkuran === 'off') return;
      const pesan = [...(input.files || [])].map(pesanUkuranFile).filter(Boolean);
      if (pesan.length === 0) return;
      e.stopImmediatePropagation();
      input.value = '';
      alert(pesan.join('\n'));
    }
    window.addEventListener('change', onChange, true);
    return () => window.removeEventListener('change', onChange, true);
  }, []);
  return null;
}
