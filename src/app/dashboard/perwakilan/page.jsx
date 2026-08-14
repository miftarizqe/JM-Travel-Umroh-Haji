'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { CollapsibleSection } from '@/app/components/Collapsible';
import DownlineModal from '@/app/components/DownlineModal';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export default function DashboardPerwakilan() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openDownlineId, setOpenDownlineId] = useState(null);
  const [expandForecast, setExpandForecast] = useState(null); // null | 'pribadi' | 'downline'
  const [statusDaftar, setStatusDaftar] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'perwakilan') { router.push('/dashboard/jamaah'); return; }
    Promise.all([
      fetch(`/api/perwakilan/dashboard?perw_id=${user.id}`).then(r => r.json()),
      fetch('/api/status-pendaftaran').then(r => r.json()).catch(() => null),
    ]).then(([d, s]) => { setData(d); setStatusDaftar(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const isPending = user.status === 'pending' || data?.perwakilan?.status === 'pending';
  const wilayah = data?.perwakilan?.wilayah || user.wilayah || '-';
  const r = data?.ringkasan || {};
  const closings = data?.closings || [];
  const riwayatReseller = data?.riwayat_reseller || [];

  // Program Aktif = booking masih berjalan (termasuk lagi proses pengajuan
  // batal — belum final, jadi belum dipindah ke riwayat apa pun).
  // History Program = SUDAH final — selesai berjalan ATAU pembatalannya
  // sudah di-ACC admin.
  // Forecast (kartu angka, BUKAN daftar booking) = data?.forecast dari API.
  const programAktif = closings.filter(b => b.status === 'active' || b.status === 'menunggu_batal');
  const riwayatClosing = closings.filter(b => b.status === 'selesai');
  const riwayatBatal = closings.filter(b => b.status === 'dibatalkan');
  const historyProgram = [...riwayatClosing, ...riwayatBatal]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const forecastDownline = data?.forecast?.downline_bookings || [];

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
          {b.status === 'active' && b.ordered_by === user.id && (
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
    <Layout>
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Dashboard Perwakilan 🏢</h2>
            <p className="text-sm opacity-85 mt-1">Selamat datang, {user.name.split(' ')[0]}!</p>
            {wilayah !== '-' && <p className="text-xs opacity-75 mt-0.5">📍 {wilayah}</p>}
          </div>
          {user.kode_unik && (
            <span className="bg-white/15 border border-white/30 rounded-full px-3 py-1 text-xs font-bold">
              🔑 {user.kode_unik}
            </span>
          )}
        </div>
      </div>

      {/* Status — bedain "belum kirim formulir sama sekali" vs "udah kirim,
          tinggal nunggu admin". */}
      {isPending ? (
        !statusDaftar?.prasyarat?.formulir_terkirim ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <h4 className="font-bold text-yellow-800 mb-1">📝 Formulir Perwakilan Belum Dikirim</h4>
            <p className="text-sm text-yellow-600 mb-3">Lengkapi dulu data KTP & rekening supaya bisa diverifikasi admin.</p>
            <button onClick={() => router.push('/daftar-perwakilan')}
              className="bg-[#C9952A] text-white text-sm font-bold px-5 py-2 rounded-full">Lengkapi Formulir →</button>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <h4 className="font-bold text-yellow-800 mb-1">⏳ Pendaftaran Sedang Diproses</h4>
            <p className="text-sm text-yellow-600">Tim admin akan verifikasi & konfirmasi akun perwakilan Anda.</p>
          </div>
        )
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <h4 className="font-bold text-green-800">✅ Akun Perwakilan Aktif</h4>
          <p className="text-sm text-green-600">Anda bisa melakukan order program untuk jamaah di wilayah Anda.</p>
        </div>
      )}

      {/* Ujroh Card */}
      <div className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-2xl p-6 mb-6">
        <div className="text-xs opacity-75 uppercase tracking-wider mb-1">Total Ujroh Terkonfirmasi</div>
        <div className="text-3xl font-black text-[#C9952A] mb-2">{rp(r.total_ujroh)}</div>
        <div className="text-xs opacity-75">Dari {r.closing_confirmed||0} closing terkonfirmasi · {wilayah}</div>
        <div className="bg-white/10 rounded-xl p-4 mt-4 text-sm space-y-1">
          <div className="font-bold mb-2">💡 Skema Ujroh Perwakilan</div>
          <div className="opacity-85">HPP ditetapkan manajemen. Anda bebas tentukan harga jual.</div>
          <div className="opacity-85">Ujroh = (Harga Jual − HPP) × jumlah jamaah</div>
          <div className="mt-2 text-yellow-300 font-bold">Perwakilan tidak memiliki tabungan BSI</div>
        </div>
      </div>

      {/* Forecast — proyeksi ujroh/margin yang BELUM cair, dipecah per sumber.
          Diklik untuk lihat rincian sumbernya (booking mana saja yang
          nyumbang ke angka itu). */}
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div onClick={() => setExpandForecast(expandForecast==='pribadi'?null:'pribadi')}
          className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all ${expandForecast==='pribadi'?'border-[#1A4FA0]':'border-[#e0e8f0] hover:border-[#1A4FA0]'}`}>
          <div className="text-xs text-gray-400 mb-1">📊 Forecast — Closing Sendiri</div>
          <div className="font-black text-[#1A4FA0] text-lg">{rp(data?.forecast?.potensi_pribadi || 0)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Menunggu program yang dibooking selesai · {expandForecast==='pribadi'?'Tutup ▲':'Lihat rincian ▼'}</div>
        </div>
        <div onClick={() => setExpandForecast(expandForecast==='downline'?null:'downline')}
          className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all ${expandForecast==='downline'?'border-[#C9952A]':'border-[#e0e8f0] hover:border-[#C9952A]'}`}>
          <div className="text-xs text-gray-400 mb-1">📊 Forecast — Margin Downline</div>
          <div className="font-black text-[#C9952A] text-lg">{rp(data?.forecast?.potensi_override || 0)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Menunggu closing downline selesai · {expandForecast==='downline'?'Tutup ▲':'Lihat rincian ▼'}</div>
        </div>
      </div>

      {expandForecast && (
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-4 mb-6 space-y-2">
          <div className="font-bold text-[#0E2F6E] text-sm mb-1">
            📋 Riwayat Komisi/Ujroh Berjalan — {expandForecast==='pribadi'?'Closing Sendiri':'Margin Downline'}
          </div>
          {expandForecast==='pribadi' && (
            programAktif.length === 0 ? (
              <div className="text-xs text-gray-400">Belum ada booking berjalan.</div>
            ) : programAktif.map(b => (
              <div key={b.id} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-gray-600">{b.prog_name} · {b.paket} · {b.id}</span>
                <span className="font-bold text-[#1A4FA0]">{rp(b.ujroh)}</span>
              </div>
            ))
          )}
          {expandForecast==='downline' && (
            forecastDownline.length === 0 ? (
              <div className="text-xs text-gray-400">Belum ada closing downline yang berjalan.</div>
            ) : forecastDownline.map(b => (
              <div key={b.id} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-gray-600">{b.prog_name} · {b.id} · dari {b.closer_nama || '-'}</span>
                <span className="font-bold text-[#C9952A]">{rp(b.potensi_nominal)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Perlu Perhatian — versi perwakilan */}
      {(() => {
        const pp = data?.perlu_perhatian || {};
        const clusters = [
          {key:'form', label:'Formulir Jamaah Belum Lengkap', icon:'📋', items: pp.form_belum_lengkap||[], warna:'border-blue-200 bg-blue-50'},
          {key:'dp', label:'DP Belum Dikonfirmasi Admin', icon:'💳', items: pp.dp_pending||[], warna:'border-yellow-200 bg-yellow-50'},
          {key:'lunas', label:'Jamaah Belum Pelunasan', icon:'💰', items: pp.belum_lunas||[], warna:'border-red-200 bg-red-50'},
          {key:'downline', label:'Downline Menunggu ACC Admin', icon:'🌳', items: pp.downline_pending||[], warna:'border-purple-200 bg-purple-50'},
        ];
        const adaYangPerlu = clusters.some(c => c.items.length > 0);
        return (
          <CollapsibleSection
            title={<h3 className={`font-bold ${adaYangPerlu ? 'text-red-600' : 'text-green-600'}`}>{adaYangPerlu ? '🔴' : '✅'} Perlu Perhatian</h3>}
            className="mb-6"
          >
            {!adaYangPerlu ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 text-center">
                ✅ Semua beres, tidak ada yang perlu perhatian saat ini.
              </div>
            ) : (
            <div className="space-y-3">
              {clusters.filter(c => c.items.length > 0).map(c => (
                <div key={c.key} className={`border ${c.warna} rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-gray-700 text-sm">{c.icon} {c.label}</div>
                    <span className="text-xs font-black px-2 py-1 rounded-full bg-red-500 text-white">{c.items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {c.items.slice(0,5).map((it,i) => (
                      <div key={i} className="text-xs text-gray-600 bg-white/60 rounded px-2 py-1">
                        {c.key==='downline'
                          ? `${it.name} — ${it.email||it.wa||''}`
                          : `${it.pemesan_nama||'Jamaah'} — ${it.prog_name} ${c.key==='form'?`(${it.form_filled}/${it.form_total} form)`:''}`}
                      </div>
                    ))}
                    {c.items.length>5 && <div className="text-[10px] text-gray-400 pl-2">+{c.items.length-5} lainnya...</div>}
                  </div>
                </div>
              ))}
            </div>
            )}
          </CollapsibleSection>
        );
      })()}

      {/* Program Aktif — booking masih berjalan, termasuk lagi proses
          pengajuan batal (belum ada keputusan final admin) */}
      <div id="program-aktif-section">
      <CollapsibleSection title={<h3 className="font-bold text-[#0E2F6E]">📦 Program Aktif</h3>} badge={programAktif.length + forecastDownline.length} className="mb-6">
      {programAktif.length === 0 && forecastDownline.length === 0 ? (
        <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
          Belum ada order berjalan.{' '}
          <span className="font-bold cursor-pointer underline" onClick={() => router.push('/order-jamaah')}>
            Order jamaah →
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {programAktif.length > 0 && (
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
                  <tbody>{programAktif.map(BookingRow)}</tbody>
                </table>
              </div>
            </div>
          )}
          {forecastDownline.map(b => (
            <div key={`ov-${b.id}`} className="bg-white rounded-xl border border-dashed border-[#C9952A] p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-[#0E2F6E] text-sm">{b.prog_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 capitalize">
                    {b.id} · {b.paket} · {b.jumlah_jamaah} jamaah
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    🔗 Dari downline: {b.closer_nama || '-'} (margin reseller)
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                    {b.status === 'menunggu_batal' ? '⏳ Proses Batal' : '⏳ Berjalan'}
                  </span>
                  <div className="text-[10px] text-[#C9952A] font-bold mt-1">{rp(b.potensi_nominal)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </CollapsibleSection>
      </div>

      {/* History Program — SUDAH final: selesai berjalan ATAU pembatalannya
          sudah di-ACC admin (bukan lagi "menunggu_batal", itu di Program Aktif) */}
      <div id="history-section">
      <CollapsibleSection title={<h3 className="font-bold text-[#0E2F6E]">📜 History Program</h3>} badge={historyProgram.length} className="mb-6">
      {historyProgram.length === 0 ? (
        <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
          Belum ada program yang selesai atau dibatalkan.
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
              <tbody>{historyProgram.map(BookingRow)}</tbody>
            </table>
          </div>
        </div>
      )}
      </CollapsibleSection>
      </div>

      {/* Margin Reseller — dari closing perwakilan yang direkrut akun ini */}
      {riwayatReseller.length > 0 && (
        <CollapsibleSection
          title={<h3 className="font-bold text-[#0E2F6E]">💼 Margin Reseller</h3>}
          badge={rp(r.total_margin_reseller)}
          className="mt-6"
        >
          <div className="text-xs text-gray-400 mb-3">
            Margin dari harga reseller yang Anda pasang untuk downline yang Anda rekrut — terpisah dari ujroh closing Anda sendiri di atas.
          </div>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {openDownlineId && (
        <DownlineModal userId={user.id} targetId={openDownlineId} onClose={() => setOpenDownlineId(null)} />
      )}
    </Layout>
  );
}
