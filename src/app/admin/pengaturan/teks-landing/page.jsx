'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function AdminTeksLandingPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({}); // kunci -> nilai (lokal, belum disimpan)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    fetch('/api/admin/landing-teks')
      .then(r => r.json())
      .then(d => {
        setRows(d.teks || []);
        const initial = {};
        (d.teks || []).forEach(r => { initial[r.kunci] = r.nilai; });
        setForm(initial);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user || !['admin','super_admin'].includes(user.role) || loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  function ubah(kunci, nilai) {
    setForm(f => ({ ...f, [kunci]: nilai }));
    setSaved(false);
  }

  async function simpanSemua() {
    setSaving(true);
    try {
      const updates = rows.map(r => ({ kunci: r.kunci, nilai: form[r.kunci] ?? '' }));
      const res = await fetch('/api/admin/landing-teks', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
      setSaved(true);
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  const groups = [...new Set(rows.map(r => r.grup))];
  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <Layout title="✏️ Teks Landing Page" backHref="/admin/pengaturan/dokumen">
      <div className="text-xs text-gray-400 mb-4">
        Semua headline, tagline, dan deskripsi statis di landing page — ubah di sini, gak perlu ubah kode. Field yang keterangannya &quot;1 baris = 1 item&quot; artinya tiap baris baru jadi 1 poin/tag terpisah di tampilan.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-6">
        {groups.map(grup => (
          <div key={grup}>
            <div className="font-bold text-[#0E2F6E] mb-3">{grup}</div>
            <div className="space-y-3">
              {rows.filter(r => r.grup === grup).map(r => (
                <div key={r.kunci}>
                  <label className={lbl}>{r.label}</label>
                  {r.multiline ? (
                    <textarea value={form[r.kunci] ?? ''} onChange={e => ubah(r.kunci, e.target.value)}
                      rows={4} className={`${inp} font-mono text-xs`} />
                  ) : (
                    <input value={form[r.kunci] ?? ''} onChange={e => ubah(r.kunci, e.target.value)} className={inp} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button onClick={simpanSemua} disabled={saving}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            {saving ? 'Menyimpan...' : '💾 Simpan Semua'}
          </button>
          {saved && <span className="text-sm text-green-600 font-semibold">✅ Tersimpan!</span>}
        </div>
      </div>
    </Layout>
  );
}
