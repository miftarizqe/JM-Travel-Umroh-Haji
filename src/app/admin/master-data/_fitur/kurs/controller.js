'use client';
import { useState } from 'react';
import { simpanPengaturanKurs } from './model';

// Controller Kurs berbentuk HOOK (bukan komponen) sengaja dipanggil dari
// page.jsx (bukan di-mount/unmount per-tab kayak fitur lain) — biar draft
// kurs yang belum disimpan gak hilang kalau admin pindah tab dulu sebelum
// klik Simpan (perilaku asli sebelum dipecah per-fitur).
export function useKursController() {
  const [formKurs, setFormKurs] = useState({ kurs_sar_idr: '', kurs_usd_idr: '' });
  const [busyKurs, setBusyKurs] = useState(false);
  const [savedKurs, setSavedKurs] = useState(false);

  function ubahField(field, nilai) {
    setFormKurs(prev => ({ ...prev, [field]: nilai }));
    setSavedKurs(false);
  }

  async function simpanKurs() {
    setBusyKurs(true);
    setSavedKurs(false);
    try {
      const { res, d } = await simpanPengaturanKurs(formKurs);
      if (!res.ok) { alert(d.error || 'Gagal menyimpan kurs'); setBusyKurs(false); return; }
      setSavedKurs(true);
    } catch { alert('Terjadi kesalahan'); }
    setBusyKurs(false);
  }

  return { formKurs, setFormKurs, ubahField, busyKurs, savedKurs, simpanKurs };
}
