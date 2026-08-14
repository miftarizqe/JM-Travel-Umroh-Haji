'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import DownlineModal from '@/app/components/DownlineModal';
import { useCurrentUser } from '@/lib/useCurrentUser';

// Halaman Jaringan Downline — dipakai perwakilan (sebelumnya jadi section di
// masing-masing dashboard, sekarang dipindah ke sini biar dashboard lebih ringkas).
export default function DashboardDownlinePage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [downline, setDownline] = useState([]);
  const [kodeUnik, setKodeUnik] = useState('');
  const [loading, setLoading] = useState(true);
  const [openDownlineId, setOpenDownlineId] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'perwakilan') { router.push('/dashboard/jamaah'); return; }
    fetch(`/api/perwakilan/dashboard?perw_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        setDownline(d.downline || []);
        setKodeUnik(d.perwakilan?.kode_unik || user.kode_unik || '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="🌳 Jaringan Downline" showBack>
      {downline.length === 0 ? (
        <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
          Belum ada downline. Ajak perwakilan baru pakai kode <strong>{kodeUnik}</strong> untuk mulai dapat margin reseller.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0E2F6E] text-white text-xs">
                  <th className="px-4 py-3 text-left">Nama</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Kode</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Closing Selesai</th>
                </tr>
              </thead>
              <tbody>
                {downline.map((d, i) => (
                  <tr key={d.id} onClick={() => setOpenDownlineId(d.id)}
                    className={`cursor-pointer hover:bg-blue-50 ${i%2===0?'bg-white':'bg-gray-50'}`}>
                    <td className="px-4 py-3 font-semibold text-[#0E2F6E]">
                      {d.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{d.role}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.kode_unik}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        d.status==='active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                      }`}>{d.status==='active'?'Aktif':d.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.closing_selesai} jamaah</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openDownlineId && (
        <DownlineModal userId={user.id} targetId={openDownlineId} onClose={() => setOpenDownlineId(null)} />
      )}
    </Layout>
  );
}
