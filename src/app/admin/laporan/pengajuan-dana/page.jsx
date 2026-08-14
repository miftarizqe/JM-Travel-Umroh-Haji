'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const namaBulan = (b) => {
  if (!b) return '-';
  const [y, m] = b.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};
const bulanDepan = () => {
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-500',
  diajukan: 'bg-amber-100 text-amber-700',
  disetujui: 'bg-green-100 text-green-700',
  ditolak: 'bg-red-100 text-red-700',
};
const STATUS_LABEL = { draft: 'Draft', diajukan: 'Menunggu Persetujuan', disetujui: 'Disetujui', ditolak: 'Ditolak' };

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";

export default function PengajuanDanaListPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bulanBaru, setBulanBaru] = useState(bulanDepan());
  const [busy, setBusy] = useState(false);

  function muat() {
    fetch('/api/admin/pengajuan-dana').then(r => r.json())
      .then(d => { setList(d.pengajuan || []); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { if (user) muat(); }, [user]);

  async function buatBaru() {
    if (!/^\d{4}-\d{2}$/.test(bulanBaru)) { alert('Pilih bulan dulu'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/pengajuan-dana', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulan: bulanBaru }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat draft'); setBusy(false); return; }
      router.push(`/admin/laporan/pengajuan-dana/${d.id}`);
    } catch { alert('Terjadi kesalahan'); setBusy(false); }
  }

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="🧾 Pengajuan Dana Bulanan" backHref="/admin?tab=dashboard">
      <div className="max-w-2xl mx-auto">
        <div className="text-xs text-gray-400 mb-4">
          Rencana kebutuhan dana buat bulan yang akan datang (operasional + reimburse yang masih nunggak) — diajukan
          dulu buat disetujui, TERPISAH dari <a href="/admin/laporan/cashflow" className="text-[#1A4FA0] font-semibold hover:underline">Cashflow</a> (yang nyatetin uang yang udah beneran gerak).
        </div>

        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Bulan yang Diajukan</label>
            <input type="month" value={bulanBaru} onChange={e => setBulanBaru(e.target.value)} className={inp} />
          </div>
          <button onClick={buatBaru} disabled={busy}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            {busy ? 'Membuat...' : '+ Pengajuan Baru'}
          </button>
        </div>

        <div className="space-y-2">
          {list.map(p => (
            <button key={p.id} onClick={() => router.push(`/admin/laporan/pengajuan-dana/${p.id}`)}
              className="w-full text-left bg-white rounded-xl border border-[#e0e8f0] hover:border-[#1A4FA0] p-4 flex items-center justify-between transition-colors">
              <div>
                <div className="font-bold text-[#0E2F6E]">{namaBulan(p.bulan)}</div>
                <div className="text-xs text-gray-400">
                  Diajukan oleh {p.created_by_nama || '-'}
                  {p.status !== 'draft' && p.diajukan_oleh_nama ? ` · disubmit oleh ${p.diajukan_oleh_nama}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-[#0E2F6E]">{rp(p.total)}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
              </div>
            </button>
          ))}
          {list.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">Belum ada pengajuan dana.</div>}
        </div>
      </div>
    </Layout>
  );
}
