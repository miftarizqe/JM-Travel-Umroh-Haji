'use client';
import { useState } from 'react';

// Pilihan alasan "Tolak Permanen" (dikonfirmasi user 2026-10-16: pilih dari
// dropdown, sama kayak Minta Perbaiki) — tampil ke pendaftar (modal
// "Pendaftaran Ditolak Permanen" / notifikasi), jadi ditulis buat dibaca dia.
// Satu daftar dipakai bareng: Pendaftaran Sahabat, Database Anggota, dan
// verifikasi akun di dashboard admin.
export const ALASAN_TOLAK_PERMANEN = [
  'Akun palsu atau data identitas fiktif',
  'Akun ganda — sudah terdaftar dengan akun lain',
  'NIK/KTP yang digunakan milik orang lain',
  'Dokumen yang diunggah palsu atau dimanipulasi',
  'Tidak memenuhi syarat pendaftaran',
  'Pendaftaran spam atau tidak serius',
  'Dibatalkan atas permintaan pendaftar',
];
const LAINNYA = '__lainnya__';

// Gabung alasan terpilih + keterangan tambahan jadi satu teks catatan.
// null = alasan belum lengkap.
export function catatanTolakPermanen(alasanPilih, alasanLain, keterangan) {
  const alasan = alasanPilih === LAINNYA ? alasanLain.trim() : alasanPilih;
  if (!alasan) return null;
  const tambahan = keterangan.trim();
  return tambahan ? `${alasan} — ${tambahan}` : alasan;
}

// Isian alasan (dropdown + Lainnya + keterangan) — dipakai inline di modal
// detail Pendaftaran Sahabat & di dalam ModalTolakPermanen di bawah.
export function IsianAlasanTolak({ alasanPilih, setAlasanPilih, alasanLain, setAlasanLain, keterangan, setKeterangan }) {
  const kelas = 'w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-red-400 focus:outline-none text-xs bg-white';
  return (
    <>
      <div>
        <label className="block text-[11px] text-gray-600 mb-1">Alasan <span className="text-red-500">*</span></label>
        <select value={alasanPilih} onChange={e => setAlasanPilih(e.target.value)} className={kelas}>
          <option value="">— Pilih alasan —</option>
          {ALASAN_TOLAK_PERMANEN.map(a => <option key={a} value={a}>{a}</option>)}
          <option value={LAINNYA}>Lainnya (tulis sendiri)</option>
        </select>
      </div>
      {alasanPilih === LAINNYA && (
        <input value={alasanLain} onChange={e => setAlasanLain(e.target.value)} placeholder="Tulis alasannya..." className={kelas} />
      )}
      <div>
        <label className="block text-[11px] text-gray-600 mb-1">Keterangan tambahan (opsional)</label>
        <textarea value={keterangan} onChange={e => setKeterangan(e.target.value)} rows={2}
          placeholder="Mis. NIK sama dengan akun atas nama ..." className={kelas} />
      </div>
    </>
  );
}

// Modal konfirmasi Tolak Permanen — pengganti prompt() bebas ketik.
// onKirim(catatan) dipanggil dengan teks alasan gabungan.
export default function ModalTolakPermanen({ nama, busy, onBatal, onKirim }) {
  const [alasanPilih, setAlasanPilih] = useState('');
  const [alasanLain, setAlasanLain] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const catatan = catatanTolakPermanen(alasanPilih, alasanLain, keterangan);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && onBatal()}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="font-bold text-red-700">⛔ Tolak permanen {nama}?</div>
        <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
          Akun ini <b>tidak akan bisa login lagi</b>. Pakai hanya untuk akun spam/palsu — kalau datanya cuma ada yang salah,
          pilih &quot;Minta Perbaiki&quot;.
        </div>
        <IsianAlasanTolak alasanPilih={alasanPilih} setAlasanPilih={setAlasanPilih} alasanLain={alasanLain}
          setAlasanLain={setAlasanLain} keterangan={keterangan} setKeterangan={setKeterangan} />
        <div className="flex gap-2">
          <button disabled={busy} onClick={onBatal}
            className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-full text-sm disabled:opacity-50">Batal</button>
          <button disabled={busy || !catatan} onClick={() => onKirim(catatan)}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-full text-sm disabled:opacity-50">
            {busy ? 'Memproses...' : 'Ya, Tolak Permanen'}
          </button>
        </div>
      </div>
    </div>
  );
}
