'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const FIELDS = [
  { key: 'nama_perusahaan', label: 'Nama Perusahaan', placeholder: 'Mis. PT. Alkhalid Jaya Megah Tours & Travel', group: 'Kop Surat (Dokumen Cetak)' },
  { key: 'telepon_kantor', label: 'Telepon Kantor', placeholder: 'Mis. (021) 7234343, 7222303', group: 'Kop Surat (Dokumen Cetak)' },
  { key: 'email_kantor', label: 'Email Kantor', placeholder: 'Mis. headoffice@jmtourtravel.com', group: 'Kop Surat (Dokumen Cetak)' },
  { key: 'wa_kantor', label: 'Nomor WhatsApp Kantor', placeholder: 'Mis. 6282310572050', group: 'Kontak' },
  { key: 'alamat_kantor', label: 'Alamat Kantor', placeholder: 'Jl. ...', group: 'Kontak', textarea: true },
  { key: 'ig_url', label: 'Link Instagram', placeholder: 'https://www.instagram.com/...', group: 'Media Sosial' },
  { key: 'tiktok_url', label: 'Link TikTok', placeholder: 'https://www.tiktok.com/@...', group: 'Media Sosial' },
  { key: 'fb_url', label: 'Link Facebook', placeholder: 'https://www.facebook.com/...', group: 'Media Sosial' },
];
const GROUPS = ['Kop Surat (Dokumen Cetak)', 'Kontak', 'Media Sosial'];

export default function AdminPengaturanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    fetch('/api/admin/pengaturan')
      .then(r => r.json())
      .then(d => { setForm(d.pengaturan || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user || loading || !form) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  function ubah(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setSaved(false);
  }

  async function simpan() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pengaturan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan pengaturan'); return; }
      setSaved(true);
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <Layout title="⚙️ Pengaturan Umum" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Nilai di sini dipakai otomatis di landing page, checkout, pelunasan, kop surat dokumen cetak, dan halaman lain yang butuh kontak/sosmed — ubah di sini, gak perlu ubah kode.
        Buat rekening/cara bayar, lihat <a href="/admin/pengaturan/pembayaran" className="text-[#1A4FA0] font-semibold hover:underline">Metode Pembayaran</a>.
        Buat isi pasal & penandatangan dokumen legal (SPKA/SPKA-Ins/SPKL/Jamaah), lihat <a href="/admin/pengaturan/dokumen" className="text-[#1A4FA0] font-semibold hover:underline">Pengaturan Dokumen</a>.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-6">
        {GROUPS.map(group => (
          <div key={group}>
            <div className="font-bold text-[#0E2F6E] mb-3">{group}</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {FIELDS.filter(f => f.group === group).map(f => (
                <div key={f.key} className={f.textarea ? 'sm:col-span-2' : ''}>
                  <label className={lbl}>{f.label}</label>
                  {f.textarea ? (
                    <textarea value={form[f.key] || ''} onChange={e => ubah(f.key, e.target.value)}
                      placeholder={f.placeholder} rows={2} className={inp} />
                  ) : (
                    <input value={form[f.key] || ''} onChange={e => ubah(f.key, e.target.value)}
                      placeholder={f.placeholder} className={inp} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button onClick={simpan} disabled={saving}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            {saving ? 'Menyimpan...' : '💾 Simpan Pengaturan'}
          </button>
          {saved && <span className="text-sm text-green-600 font-semibold">✅ Tersimpan!</span>}
        </div>
      </div>
    </Layout>
  );
}
