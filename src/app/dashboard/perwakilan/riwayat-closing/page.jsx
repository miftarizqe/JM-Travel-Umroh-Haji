'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import DownlineModal from '@/app/components/DownlineModal';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { pembayaranSudahDiAcc } from '@/lib/bookingStage';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

// Riwayat Closing — halaman tersendiri (dikonfirmasi user 2026-10-18, mirror
// Sahabat Baitullah yang detail booking/margin-nya gak numpuk di Beranda).
// Isinya tabel "Program Aktif" + "History Program" (dulu inline di
// dashboard/perwakilan) jadi 1 tab "Closing Sendiri", plus tab "Margin
// Downline" dari riwayat_reseller (datanya sama dgn section Margin Reseller
// di Beranda — sengaja tetap ada di dua tempat, ringkasan di Beranda & detail
// lengkap di sini, pola yang sama kayak Sahabat).
export default function RiwayatClosingPerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('sendiri');
  const [openDownlineId, setOpenDownlineId] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'perwakilan') { router.push('/dashboard/jamaah'); return; }
    fetch(`/api/perwakilan/dashboard?perw_id=${user.id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || loading || !data) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const closings = [...(data.closings || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const riwayatReseller = data.riwayat_reseller || [];

  function BookingRow(b) {
    return (
      <tr key={b.id} className="odd:bg-white even:bg-gray-50">
        <td className="px-4 py-3">
          <div className="font-semibold text-[#0E2F6E]">{b.prog_name}</div>
          {b.jamaah?.[0]?.nama && (
            <div className="text-xs font-semibold text-[#C9952A] mt-0.5">
              📛 {b.jamaah[0].nama}{b.jamaah.length > 1 ? ` & ${b.jamaah.length - 1} lainnya` : ''}
            </div>
          )}
          <div className="text-[10px] text-gray-400 font-mono">{b.id}</div>
        </td>
        <td className="px-4 py-3 text-gray-500 capitalize">{b.paket}</td>
        <td className="px-4 py-3 text-gray-500">{b.jumlah_jamaah} org</td>
        <td className="px-4 py-3 text-gray-500">{rp(b.hpp_per_jamaah)}</td>
        <td className="px-4 py-3 text-gray-500">{rp(b.harga_jual_per_jamaah)}</td>
        <td className="px-4 py-3 font-bold text-green-600">
          {b.dp_status==='confirmed' ? rp(b.ujroh) : <span className="text-gray-300">{rp(b.ujroh)}</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            b.status==='selesai' ? 'bg-green-100 text-green-700' :
            b.status==='dibatalkan' ? 'bg-gray-200 text-gray-600' :
            b.status==='menunggu_batal' ? 'bg-yellow-100 text-yellow-700' :
            b.dp_status==='confirmed' ? 'bg-green-100 text-green-700' :
            b.dp_status==='rejected' ? 'bg-red-100 text-red-600' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {b.status==='selesai' ? '✅ Selesai' :
             b.status==='dibatalkan' ? '❌ Dibatalkan' :
             b.status==='menunggu_batal' ? '⏳ Proses Batal' :
             b.dp_status==='confirmed'?'✅ Confirmed':b.dp_status==='rejected'?'❌ Rejected':'⏳ Pending'}
          </span>
        </td>
        <td className="px-4 py-3">
          {b.status !== 'active' ? (
            <span className="text-xs text-gray-300">-</span>
          ) : b.form_lengkap ? (
            <span className="text-xs font-bold text-green-600">✅ Lengkap</span>
          ) : (
            <button
              onClick={() => router.push(`/form-jamaah?booking_id=${b.id}`)}
              className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
            >
              📋 Lengkapi ({b.form_filled}/{b.form_total})
            </button>
          )}
        </td>
        <td className="px-4 py-3">
          {b.status === 'active' && b.ordered_by === user.id && !pembayaranSudahDiAcc(b) && (
            <button
              onClick={() => router.push(`/batalkan-program?booking_id=${b.id}`)}
              className="border border-red-300 text-red-500 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors whitespace-nowrap"
            >
              ❌ Batalkan
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <Layout title="📜 Riwayat Closing" showBack>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('sendiri')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === 'sendiri' ? 'bg-white text-[#0E2F6E] shadow-sm' : 'text-gray-500'}`}>
          📦 Closing Sendiri
        </button>
        <button onClick={() => setTab('downline')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === 'downline' ? 'bg-white text-[#0E2F6E] shadow-sm' : 'text-gray-500'}`}>
          💼 Margin Downline
        </button>
      </div>

      {tab === 'sendiri' && (
        closings.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
            Belum ada order.{' '}
            <span className="font-bold cursor-pointer underline" onClick={() => router.push('/programs')}>
              Order jamaah →
            </span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0E2F6E] text-white text-xs">
                    <th className="px-4 py-3 text-left">Program</th>
                    <th className="px-4 py-3 text-left">Paket</th>
                    <th className="px-4 py-3 text-left">Jamaah</th>
                    <th className="px-4 py-3 text-left">HPP/org</th>
                    <th className="px-4 py-3 text-left">Jual/org</th>
                    <th className="px-4 py-3 text-left">Ujroh</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Formulir</th>
                    <th className="px-4 py-3 text-left">Aksi</th>
                  </tr>
                </thead>
                <tbody>{closings.map(BookingRow)}</tbody>
              </table>
            </div>
          </div>
        )
      )}

      {tab === 'downline' && (
        riwayatReseller.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
            Belum ada margin dari closing downline.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0E2F6E] text-white text-xs">
                    <th className="px-4 py-3 text-left">Dari</th>
                    <th className="px-4 py-3 text-left">Booking</th>
                    <th className="px-4 py-3 text-left">Paket</th>
                    <th className="px-4 py-3 text-left">Keterangan</th>
                    <th className="px-4 py-3 text-left">Nominal</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {riwayatReseller.map((r2, i) => (
                    <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                      <td className="px-4 py-3">
                        {r2.sumber_id ? (
                          <span onClick={() => setOpenDownlineId(r2.sumber_id)} className="font-semibold text-[#1A4FA0] hover:underline cursor-pointer">{r2.sumber_nama || '-'}</span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r2.booking_id}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{r2.paket}</td>
                      <td className="px-4 py-3 text-gray-500">{r2.keterangan}</td>
                      <td className="px-4 py-3 font-bold text-green-600">{rp(r2.nominal)}</td>
                      <td className="px-4 py-3 text-xs">
                        {r2.dikonfirmasi_at ? (
                          <span className="text-green-600 font-bold">✅ Ditransfer</span>
                        ) : (
                          <span className="text-gray-400">⏳ Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {openDownlineId && (
        <DownlineModal userId={user.id} targetId={openDownlineId} onClose={() => setOpenDownlineId(null)} />
      )}
    </Layout>
  );
}
