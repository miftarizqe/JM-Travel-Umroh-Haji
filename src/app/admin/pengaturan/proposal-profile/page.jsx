'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const input = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white';
const lbl = 'text-xs font-semibold text-gray-600 block mb-3';

// Upload "tempel apa adanya" buat halaman yang gak ada yang berubah —
// nempel di kartu section-nya sendiri (bukan dikumpulin terpisah), biar
// jelas itu jadi pengganti/fallback punya section itu doang. Komponen
// top-level (bukan dibikin di dalam render) biar state file input gak
// direset tiap parent re-render.
function UploadHalamanPenuh({ form, slot, label, catatan, uploadingSlot, onUpload, onClear }) {
  return (
    <div className="bg-white/70 border border-white rounded-lg p-3 mb-4">
      <div className="text-xs font-bold text-gray-700 mb-1">{label} — upload langsung (opsional)</div>
      <div className="text-[11px] text-gray-500 mb-2">{catatan || 'Kalau diisi, halaman ini ditempel apa adanya dari file yang diupload, field teks di bawah gak dipakai.'}</div>
      {form[slot] && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={form[slot]} alt={label} className="w-full max-w-xs rounded-lg border border-gray-200 mb-2" />
      )}
      <input type="file" accept="image/*" onChange={e => onUpload(e, slot)} disabled={!!uploadingSlot} className="text-xs" />
      {form[slot] && (
        <button onClick={() => onClear(slot)} className="block text-red-500 text-xs font-bold mt-1">Hapus, pakai versi teks di bawah</button>
      )}
    </div>
  );
}

export default function ProposalProfilePage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [legalLabel, setLegalLabel] = useState('');
  const [uploadingLegal, setUploadingLegal] = useState(false);
  const [galeriFoto, setGaleriFoto] = useState([]);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  useEffect(() => {
    fetch('/api/admin/galeri').then(r => r.json()).then(d => setGaleriFoto(d.rows || []));
  }, []);

  useEffect(() => {
    fetch('/api/admin/proposal-profile').then(r => r.json()).then(d => setForm(d.profile || {}));
  }, []);

  function ubah(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function ubahL3(i, key, val) {
    setForm(f => ({ ...f, org_l3: (f.org_l3 || []).map((b, idx) => idx === i ? { ...b, [key]: val } : b) }));
  }
  function tambahL3() { setForm(f => ({ ...f, org_l3: [...(f.org_l3 || []), { jabatan: '', nama: '' }] })); }
  function hapusL3(i) { setForm(f => ({ ...f, org_l3: (f.org_l3 || []).filter((_, idx) => idx !== i) })); }

  function toggleFotoDokumentasi(id) {
    setForm(f => {
      const ids = f.dokumentasi_foto_ids || [];
      return { ...f, dokumentasi_foto_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
    });
  }

  async function simpan() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/proposal-profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusy(false); return; }
      alert('Company Profile disimpan!');
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function uploadFoto(e, slot) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSlot(slot);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', slot);
    const res = await fetch('/api/admin/proposal-profile/upload-foto', { method: 'POST', body: fd });
    const d = await res.json();
    if (res.ok) ubah(slot, d.path);
    else alert(d.error || 'Gagal upload');
    setUploadingSlot(null);
    e.target.value = '';
  }

  async function uploadLegal(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!legalLabel.trim()) { alert('Isi label dokumennya dulu (mis. "SK Haji")'); e.target.value = ''; return; }
    setUploadingLegal(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', legalLabel.trim());
    const res = await fetch('/api/admin/proposal-profile/upload-dokumen-legal', { method: 'POST', body: fd });
    const d = await res.json();
    if (res.ok) { ubah('legal_dokumen', d.legal_dokumen); setLegalLabel(''); }
    else alert(d.error || 'Gagal upload');
    setUploadingLegal(false);
    e.target.value = '';
  }

  async function hapusLegal(i) {
    if (!confirm('Hapus dokumen ini?')) return;
    const res = await fetch(`/api/admin/proposal-profile/upload-dokumen-legal?index=${i}`, { method: 'DELETE' });
    const d = await res.json();
    if (res.ok) ubah('legal_dokumen', d.legal_dokumen);
  }

  if (!user || user.role !== 'super_admin' || !form) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🤝 Company Profile — Proposal Corporate" backHref="/admin/proposal-corporate">
      <div className="text-sm text-gray-500 mb-4">
        Konten di sini diisi <b>sekali</b>, otomatis ikut ke SEMUA Proposal Corporate baru. Urutan kartu di bawah <b>sama persis</b> sama urutan halaman di proposal aslinya — isi dari atas ke bawah.
      </div>

      {/* 1. COVER */}
      <div className="bg-amber-50 rounded-xl p-4 mb-4">
        <div className="text-xs font-bold text-amber-700 mb-3">🖼️ 1. Halaman Cover</div>
        <UploadHalamanPenuh form={form} slot="gambar_cover" label="Halaman Cover" uploadingSlot={uploadingSlot} onUpload={uploadFoto} onClear={s => ubah(s, '')} />
        <label className={lbl}>Tagline
          <input value={form.tagline || ''} onChange={e => ubah('tagline', e.target.value)} className={input} placeholder='"Bersama Jaya Megah, Semua Bisa ke Baitullah"' />
        </label>
        <label className={lbl}>Deskripsi Singkat
          <textarea value={form.deskripsi_singkat || ''} onChange={e => ubah('deskripsi_singkat', e.target.value)} rows={2} className={input} />
        </label>
      </div>

      {/* 2. PROFILE, VISI MISI, BOD TEAM */}
      <div className="bg-emerald-50 rounded-xl p-4 mb-4">
        <div className="text-xs font-bold text-emerald-700 mb-3">🏢 2. Profile, Visi Misi &amp; Struktur Organisasi</div>
        <label className={lbl}>Profil Perusahaan (paragraf sejarah singkat)
          <textarea value={form.profil || ''} onChange={e => ubah('profil', e.target.value)} rows={3} className={input} />
        </label>
        <label className={lbl}>Visi
          <textarea value={form.visi || ''} onChange={e => ubah('visi', e.target.value)} rows={2} className={input} />
        </label>
        <label className={lbl}>Misi (1 baris = 1 poin)
          <textarea value={form.misi || ''} onChange={e => ubah('misi', e.target.value)} rows={4} className={input} />
        </label>

        <div className="text-xs font-semibold text-gray-600 mb-2 mt-2">Struktur Organisasi (Org Chart)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="text-xs font-semibold text-gray-600">Nama CEO
            <input value={form.org_ceo_nama || ''} onChange={e => ubah('org_ceo_nama', e.target.value)} className={input} />
          </label>
          <label className="text-xs font-semibold text-gray-600">Jabatan CEO
            <input value={form.org_ceo_jabatan || ''} onChange={e => ubah('org_ceo_jabatan', e.target.value)} className={input} placeholder="CEO" />
          </label>
          <label className="text-xs font-semibold text-gray-600">Nama Level 2
            <input value={form.org_l2_nama || ''} onChange={e => ubah('org_l2_nama', e.target.value)} className={input} />
          </label>
          <label className="text-xs font-semibold text-gray-600">Jabatan Level 2
            <input value={form.org_l2_jabatan || ''} onChange={e => ubah('org_l2_jabatan', e.target.value)} className={input} />
          </label>
        </div>
        <div className="text-xs font-semibold text-gray-600 mb-2">Jajaran di bawah Level 2</div>
        <div className="space-y-2">
          {(form.org_l3 || []).map((b, i) => (
            <div key={i} className="flex gap-2">
              <input value={b.jabatan} onChange={e => ubahL3(i, 'jabatan', e.target.value)} placeholder="Jabatan" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
              <input value={b.nama} onChange={e => ubahL3(i, 'nama', e.target.value)} placeholder="Nama" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
              <button onClick={() => hapusL3(i)} className="text-red-500 text-xs font-bold px-2">✕</button>
            </div>
          ))}
          <button onClick={tambahL3} className="text-xs font-bold text-[#1A4FA0]">+ Tambah Jajaran</button>
        </div>
      </div>

      {/* 3. KEUTAMAAN, PAKET UMROH, PERLENGKAPAN JAMAAH */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4">
        <div className="text-xs font-bold text-gray-700 mb-3">⭐ 3. Keutamaan, Paket Umroh &amp; Perlengkapan Jamaah</div>
        <UploadHalamanPenuh form={form} slot="gambar_keutamaan" label="Halaman Keutamaan/Paket/Perlengkapan" uploadingSlot={uploadingSlot} onUpload={uploadFoto} onClear={s => ubah(s, '')} />
        <label className={lbl}>Keutamaan JM Travel (1 baris = 1 poin)
          <textarea value={form.keutamaan || ''} onChange={e => ubah('keutamaan', e.target.value)} rows={5} className={input} />
        </label>
        <label className={lbl}>Paket Umroh yang Ditawarkan (1 baris = 1 poin)
          <textarea value={form.paket_umroh || ''} onChange={e => ubah('paket_umroh', e.target.value)} rows={5} className={input} />
        </label>
        <label className={lbl}>Perlengkapan Jamaah (1 baris = 1 poin)
          <textarea value={form.perlengkapan_jamaah || ''} onChange={e => ubah('perlengkapan_jamaah', e.target.value)} rows={5} className={input} />
        </label>
        <div className="text-xs font-semibold text-gray-600 mb-2">Foto Perlengkapan Jamaah</div>
        {form.perlengkapan_foto && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={form.perlengkapan_foto} alt="Perlengkapan Jamaah" className="w-40 rounded-lg border border-gray-200 mb-3" />
        )}
        <input type="file" accept="image/*" onChange={e => uploadFoto(e, 'perlengkapan_foto')} disabled={!!uploadingSlot} className="text-sm" />
      </div>

      {/* 4. SYARAT & KETENTUAN */}
      <div className="bg-orange-50 rounded-xl p-4 mb-4">
        <div className="text-xs font-bold text-orange-700 mb-3">📋 4. Syarat &amp; Ketentuan</div>
        <label className={lbl}>Persyaratan Umroh (1 baris = 1 poin)
          <textarea value={form.syarat_persyaratan_umroh || ''} onChange={e => ubah('syarat_persyaratan_umroh', e.target.value)} rows={4} className={input} />
        </label>
        <label className={lbl}>Pembatalan Umroh (1 baris = 1 poin)
          <textarea value={form.syarat_pembatalan_umroh || ''} onChange={e => ubah('syarat_pembatalan_umroh', e.target.value)} rows={3} className={input} />
        </label>
        <label className={lbl}>Haji Khusus (bebas, boleh multi-paragraf)
          <textarea value={form.syarat_haji_khusus || ''} onChange={e => ubah('syarat_haji_khusus', e.target.value)} rows={6} className={input} />
        </label>
        <label className={lbl}>Layanan Umroh Mandiri (1 baris = 1 poin)
          <textarea value={form.layanan_umroh_mandiri || ''} onChange={e => ubah('layanan_umroh_mandiri', e.target.value)} rows={3} className={input} />
        </label>
        <label className={lbl}>Perjalanan Wisata Non Umroh
          <textarea value={form.wisata_non_umroh || ''} onChange={e => ubah('wisata_non_umroh', e.target.value)} rows={2} className={input} />
        </label>
        <label className={lbl}>Perjalanan Dinas Dalam Negeri
          <textarea value={form.dinas_dalam_negeri || ''} onChange={e => ubah('dinas_dalam_negeri', e.target.value)} rows={2} className={input} />
        </label>
      </div>

      {/* 5. LEGALITAS */}
      <div className="bg-[#E8F0FB] rounded-xl p-4 mb-4">
        <div className="text-xs font-bold text-[#1A4FA0] mb-3">🔒 5. Legalitas Perusahaan</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <label className="text-xs font-semibold text-gray-600">Merk Dagang
            <input value={form.merk_dagang || ''} onChange={e => ubah('merk_dagang', e.target.value)} className={input} placeholder="Jaya Megah Tour (JM Travel)" />
          </label>
          <label className="text-xs font-semibold text-gray-600">No. Registrasi Ghapura
            <input value={form.no_registrasi_ghapura || ''} onChange={e => ubah('no_registrasi_ghapura', e.target.value)} className={input} />
          </label>
          <label className="text-xs font-semibold text-gray-600">No. SK Haji (PIHK)
            <input value={form.no_sk_haji || ''} onChange={e => ubah('no_sk_haji', e.target.value)} className={input} />
          </label>
          <label className="text-xs font-semibold text-gray-600">No. SK PPIU
            <input value={form.no_sk_ppiu || ''} onChange={e => ubah('no_sk_ppiu', e.target.value)} className={input} />
          </label>
          <label className="text-xs font-semibold text-gray-600">No. Sertifikat PPIU
            <input value={form.no_sertifikat_ppiu || ''} onChange={e => ubah('no_sertifikat_ppiu', e.target.value)} className={input} />
          </label>
        </div>

        <div className="text-xs font-semibold text-gray-600 mb-2">Dokumen Legal (scan izin, sertifikat, NIB, dst)</div>
        <div className="space-y-2 mb-4">
          {(form.legal_dokumen || []).map((d, i) => (
            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
              <a href={d.path} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#1A4FA0] hover:underline">{d.label}</a>
              <button onClick={() => hapusLegal(i)} className="text-red-500 text-xs font-bold px-2">Hapus</button>
            </div>
          ))}
          {(!form.legal_dokumen || form.legal_dokumen.length === 0) && <div className="text-xs text-gray-400">Belum ada dokumen legal diunggah.</div>}
        </div>
        <div className="flex gap-2 items-center">
          <input value={legalLabel} onChange={e => setLegalLabel(e.target.value)} placeholder="Label (mis. SK Haji)" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white w-48" />
          <input type="file" accept="image/*,application/pdf" onChange={uploadLegal} disabled={uploadingLegal} className="text-sm" />
        </div>
      </div>

      {/* 6. DOKUMENTASI */}
      <div className="bg-sky-50 rounded-xl p-4 mb-4">
        <div className="text-xs font-bold text-sky-700 mb-1">📷 6. Dokumentasi</div>
        <div className="text-[11px] text-gray-500 mb-3">
          Pilih foto dari Galeri Dokumentasi yang mau ditampilin di Proposal Corporate. Kosongin semua (gak pilih satu pun) = otomatis pakai 6 foto terbaru.
        </div>
        {galeriFoto.length === 0 ? (
          <div className="text-xs text-gray-400">Belum ada foto di Galeri Dokumentasi. Upload dulu di <a href="/admin/galeri" className="text-[#1A4FA0] font-semibold hover:underline">halaman Galeri</a>.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-80 overflow-y-auto">
            {galeriFoto.map(f => {
              const dipilih = (form.dokumentasi_foto_ids || []).includes(f.id);
              return (
                <button key={f.id} type="button" onClick={() => toggleFotoDokumentasi(f.id)}
                  className={`relative rounded-lg overflow-hidden border-2 ${dipilih ? 'border-[#1A4FA0]' : 'border-transparent'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.foto_path} alt={f.batch_judul} className="w-full h-20 object-cover" />
                  {dipilih && <div className="absolute inset-0 bg-[#1A4FA0]/30 flex items-center justify-center text-white font-bold text-lg">✓</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. POSTER PENUTUP */}
      <div className="bg-rose-50 rounded-xl p-4 mb-4">
        <div className="text-xs font-bold text-rose-700 mb-3">🎉 7. Poster Penutup</div>
        <UploadHalamanPenuh form={form} slot="gambar_penutup" label="Halaman Poster Penutup" uploadingSlot={uploadingSlot} onUpload={uploadFoto} onClear={s => ubah(s, '')}
          catatan="Kalau kosong, halaman ini otomatis dirakit dari Keutamaan JM Travel (poin 3) + info rekening di Pengaturan Umum." />
      </div>

      <button onClick={simpan} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-6 py-3 rounded-xl">
        {busy ? 'Menyimpan...' : 'Simpan Company Profile'}
      </button>
    </Layout>
  );
}
