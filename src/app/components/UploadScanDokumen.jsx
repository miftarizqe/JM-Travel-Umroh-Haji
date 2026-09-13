'use client';
import { useState } from 'react';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tglIndoJam(t) {
  const d = new Date(t);
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

// Widget upload scan/foto dokumen fisik yang sudah ditandatangani — dipakai
// di cetak-pks-mitra (dokumen_pks_fisik_path) & cetak-formulir-mitra
// (formulir_pendaftaran_fisik_path). Endpoint & nama field beda per jenis
// dokumen, komponennya sendiri generik.
export default function UploadScanDokumen({ label, uploadUrl, userId, path: filePath, uploadedAt, onUploaded, extraFields }) {
  const [uploading, setUploading] = useState(false);

  async function pilihFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_id', userId);
      // Route terparameterisasi (mis. upload-dokumen-sahabat-fisik) butuh
      // field pembeda tambahan (jenis) — opsional, gak dipakai endpoint
      // bespoke lama.
      Object.entries(extraFields || {}).forEach(([k, v]) => fd.append(k, v));
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) onUploaded(d.path);
      else alert(d.error || 'Gagal mengunggah dokumen');
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  return (
    <div className="no-print" style={{ textAlign: 'center', marginBottom: 16, fontSize: 12 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F8F9FD', border: '1px solid #e0e8f0', borderRadius: 20, padding: '6px 14px' }}>
        {filePath ? (
          <>
            <span style={{ color: '#047857' }}>📎 {label} terunggah ({tglIndoJam(uploadedAt)})</span>
            <a href={filePath} target="_blank" rel="noopener noreferrer" style={{ color: '#1A4FA0', fontWeight: 700 }}>Lihat</a>
          </>
        ) : (
          <span style={{ color: '#999' }}>Belum ada scan {label.toLowerCase()}</span>
        )}
        <label style={{ color: '#1A4FA0', fontWeight: 700, cursor: 'pointer' }}>
          {uploading ? 'Mengunggah...' : filePath ? 'Ganti' : 'Unggah'}
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }} disabled={uploading}
            onChange={e => pilihFile(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}
