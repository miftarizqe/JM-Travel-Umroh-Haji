'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

export default function AdminPromoPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [judul, setJudul] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [kodeVoucher, setKodeVoucher] = useState('');
  const [flyerPath, setFlyerPath] = useState('');
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const [link, setLink] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [saving, setSaving] = useState(false);

  function muatData() {
    fetch('/api/admin/promo')
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muatData();
  }, [user]);

  if (!user || loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  async function pilihFlyer(file) {
    if (!file) return;
    setUploadingFlyer(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/promo/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setFlyerPath(d.path);
      else alert(d.error || 'Gagal mengunggah flyer');
    } catch { alert('Terjadi kesalahan saat mengunggah flyer'); }
    setUploadingFlyer(false);
  }

  async function pasang() {
    if (!judul.trim()) { alert('Isi judul banner dulu!'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/promo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judul: judul.trim(),
          deskripsi: deskripsi.trim() || null,
          flyer_path: flyerPath || null,
          kode_voucher: kodeVoucher.trim() || null,
          link: link.trim() || null,
          link_label: linkLabel.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal memasang banner'); return; }
      setJudul(''); setDeskripsi(''); setKodeVoucher(''); setFlyerPath(''); setLink(''); setLinkLabel('');
      muatData();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function toggle(row) {
    await fetch('/api/admin/promo', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, aktif: row.aktif ? 0 : 1 }),
    });
    muatData();
  }

  async function hapus(id) {
    if (!confirm('Hapus riwayat banner ini?')) return;
    await fetch(`/api/admin/promo?id=${id}`, { method: 'DELETE' });
    muatData();
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <Layout title="📣 Banner Promo" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Banner tampil sebagai strip dismissible di landing page. Klik &quot;Lihat Detail&quot; buka modal berisi flyer, S&amp;K, dan kode voucher (bisa di-copy). Cuma 1 yang aktif sekaligus — pasang baru otomatis nonaktifin yang lama.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Pasang Banner Baru</div>

        <label className={lbl}>Judul Banner *</label>
        <input value={judul} onChange={e => setJudul(e.target.value)} placeholder="Mis. Promo Umroh Ramadhan — DP mulai Rp 3 juta!"
          className={`${inp} mb-3`} />

        <label className={lbl}>Deskripsi / Syarat &amp; Ketentuan (opsional)</label>
        <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)} rows={4}
          placeholder="Detail promo, S&K, periode berlaku, dst."
          className={`${inp} mb-3`} />

        <label className={lbl}>Flyer Promo (opsional, JPG/PNG maks 5MB)</label>
        <div className="flex items-center gap-3 mb-3">
          {flyerPath && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={flyerPath} alt="Flyer" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
          )}
          <label className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-2 rounded-full cursor-pointer whitespace-nowrap">
            {uploadingFlyer ? 'Mengunggah...' : flyerPath ? 'Ganti Flyer' : 'Unggah Flyer'}
            <input type="file" accept=".jpg,.jpeg,.png" className="hidden" disabled={uploadingFlyer}
              onChange={e => pilihFlyer(e.target.files?.[0])} />
          </label>
        </div>

        <label className={lbl}>Kode Voucher (opsional — tampil sebagai chip copy-able)</label>
        <input value={kodeVoucher} onChange={e => setKodeVoucher(e.target.value.toUpperCase())} placeholder="Mis. UMROH50"
          className={`${inp} mb-3`} />

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={lbl}>Link Tujuan (opsional)</label>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://wa.me/... atau /programs"
              className={inp} />
          </div>
          <div>
            <label className={lbl}>Teks Tombol Link (opsional)</label>
            <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Mis. Booking Sekarang"
              className={inp} />
          </div>
        </div>
        <button onClick={pasang} disabled={saving}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Memasang...' : '📣 Pasang Banner'}
        </button>
      </div>

      <div className="font-bold text-[#0E2F6E] mb-2">Riwayat Banner</div>
      {rows.length === 0 ? (
        <div className="text-center text-gray-400 py-12">Belum ada banner pernah dipasang.</div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className={`flex items-center justify-between gap-3 rounded-xl p-3 border ${r.aktif ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
              <div className="min-w-0 flex items-center gap-3">
                {r.flyer_path && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={r.flyer_path} alt="" className="w-10 h-10 object-cover rounded-lg border border-gray-200 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-700 truncate">{r.judul}</div>
                  <div className="text-xs text-gray-400">
                    {r.kode_voucher && <>🎟️ {r.kode_voucher} · </>}
                    {r.link && <>🔗 {r.link_label || r.link} · </>}
                    {tgl(r.created_at)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggle(r)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${r.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {r.aktif ? '✅ Aktif' : 'Aktifkan'}
                </button>
                <button onClick={() => hapus(r.id)} className="text-xs font-bold text-red-500 hover:underline">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
