'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const URUTAN_STATUS = ['belum_diproses', 'disiapkan', 'dikirim', 'diterima'];
const STATUS_LABEL = { belum_diproses: 'Belum Diproses', disiapkan: 'Disiapkan', dikirim: 'Dikirim', diterima: 'Diterima' };
const STATUS_WARNA = {
  belum_diproses: 'bg-gray-100 text-gray-500',
  disiapkan: 'bg-blue-100 text-blue-700',
  dikirim: 'bg-yellow-100 text-yellow-700',
  diterima: 'bg-green-100 text-green-700',
};
const jkSingkat = (jk) => jk === 'Laki-Laki' ? 'L' : jk === 'Perempuan' ? 'P' : '-';

export default function PerlengkapanPengirimanPage() {
  const router = useRouter();
  const params = useParams();
  const programName = params?.program ? decodeURIComponent(params.program) : '';

  const [user] = useCurrentUser();
  const [jamaah, setJamaah] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  function muat() {
    fetch(`/api/admin/perlengkapan-pengiriman?program=${encodeURIComponent(programName)}`)
      .then(r => r.json())
      .then(d => { setJamaah(d.jamaah || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    if (!programName) return;
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, programName]);

  async function majukanStatus(j) {
    const idx = URUTAN_STATUS.indexOf(j.status);
    const statusBaru = URUTAN_STATUS[idx + 1];
    if (!statusBaru) return;
    setUpdating(`${j.booking_id}:${j.idx}`);
    try {
      const res = await fetch('/api/admin/perlengkapan-pengiriman', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: j.booking_id, jamaah_idx: j.idx, jk: j.jk, status: statusBaru }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setUpdating(null); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setUpdating(null);
  }

  if (loading) return <Layout title="📦 Status Pengiriman Perlengkapan"><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  return (
    <Layout title="📦 Status Pengiriman Perlengkapan" showBack>
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="text-sm text-gray-500">Program: <b className="text-[#0E2F6E]">{programName}</b></div>
        <div className="text-xs text-gray-400">Cuma jamaah yang DP-nya sudah dikonfirmasi yang muncul di sini.</div>

        {(jamaah || []).length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">
            Belum ada jamaah DP-confirmed untuk program ini.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">JK</th>
                  <th className="px-3 py-2">Pemesan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {jamaah.map(j => {
                  const key = `${j.booking_id}:${j.idx}`;
                  const idx = URUTAN_STATUS.indexOf(j.status);
                  const next = URUTAN_STATUS[idx + 1];
                  return (
                    <tr key={key} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-semibold text-[#0E2F6E]">{j.nama}</td>
                      <td className="px-3 py-2 text-gray-500">{jkSingkat(j.jk)}</td>
                      <td className="px-3 py-2 text-gray-500">{j.pemesan_nama}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_WARNA[j.status]}`}>
                          {STATUS_LABEL[j.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {next && (
                          <button onClick={() => majukanStatus(j)} disabled={updating === key}
                            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-50 whitespace-nowrap">
                            {updating === key ? '...' : `→ ${STATUS_LABEL[next]}`}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
