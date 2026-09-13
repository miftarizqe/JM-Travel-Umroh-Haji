'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

function fmtTanggalJam(iso) {
  const d = new Date(iso);
  const tanggal = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tanggal}, ${jam}`;
}

function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const KATEGORI_LABEL = {
  komisi_sahabat: { label: 'Ujroh Rekrutan', warna: 'bg-purple-50 text-purple-700' },
  closing_langsung_sahabat: { label: 'Closing Jamaah', warna: 'bg-blue-50 text-blue-700' },
  tabungan_awal_sahabat: { label: 'Saldo Awal Pendaftaran', warna: 'bg-teal-50 text-teal-700' },
  head_of_program_registrasi: { label: 'Komisi Head of Program', warna: 'bg-amber-50 text-amber-700' },
  pemakaian_saldo_sahabat: { label: 'Pemakaian Saldo', warna: 'bg-red-50 text-red-700' },
  setoran_mandiri_sahabat: { label: 'Setoran Mandiri', warna: 'bg-emerald-50 text-emerald-700' },
  referral_closing_reguler_sahabat: { label: 'Referral Closing Reguler', warna: 'bg-indigo-50 text-indigo-700' },
};

// Halaman "Riwayat Tabungan Umroh" bergaya rekening koran — dituju dari klik
// "Saldo Tabungan Umroh" di /dashboard/sahabat. Beda dari halaman Team:
// di sini urusannya duit masuk, bukan jaringan rekrutan.
export default function RiwayatSaldoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>}>
      <RiwayatSaldoContent />
    </Suspense>
  );
}

function RiwayatSaldoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetInfo, setTargetInfo] = useState(null);
  const [tab, setTab] = useState('riwayat'); // 'riwayat' | 'payslip'
  const [payslip, setPayslip] = useState(null);
  const [expandPeriode, setExpandPeriode] = useState(null);

  // Admin/super_admin boleh buka riwayat siapa pun lewat ?sahabat_id=,
  // pola sama persis /dashboard/sahabat/team.
  const paramId = searchParams.get('sahabat_id');
  const isAdmin = user && ['admin', 'super_admin'].includes(user.role);
  const targetId = (paramId && isAdmin) ? paramId : user?.id;
  const lihatOrangLain = isAdmin && paramId && paramId !== user?.id;

  useEffect(() => {
    if (!user) return;
    if (!['sahabat_baitullah', 'admin', 'super_admin'].includes(user.role)) { router.push('/dashboard/jamaah'); return; }
    if (!targetId) return;
    fetch(`/api/sahabat/riwayat-saldo?sahabat_id=${targetId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch(`/api/sahabat/payslip?sahabat_id=${targetId}`)
      .then(r => r.json())
      .then(d => setPayslip(d.periode || []))
      .catch(() => {});
    if (lihatOrangLain) {
      fetch(`/api/sahabat/downline/${targetId}`)
        .then(r => r.json())
        .then(d => setTargetInfo(d.target || null))
        .catch(() => {});
    } else {
      setTargetInfo(null);
    }
  }, [user, targetId]);

  if (!user || loading || !data) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="📜 Riwayat Tabungan Umroh" showBack>
      {lihatOrangLain && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800">
          👁️ Mode admin — lagi lihat riwayat milik <b>{targetInfo?.name || '...'}</b> {targetInfo?.kode_unik ? `(${targetInfo.kode_unik})` : ''}, bukan riwayat Anda sendiri.
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('riwayat')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'riwayat' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          📜 Riwayat
        </button>
        <button onClick={() => setTab('payslip')}
          className={`text-xs font-bold px-4 py-2 rounded-full ${tab === 'payslip' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          🧾 Payslip per Periode
        </button>
      </div>

      {tab === 'riwayat' && (<>
      <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] rounded-xl p-4 text-white flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] opacity-70">Saldo Awal</div>
          <div className="text-lg font-bold">{fmtRp(data.saldo_awal)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] opacity-70">Saldo Akhir</div>
          <div className="text-lg font-bold">{fmtRp(data.saldo_akhir)}</div>
        </div>
      </div>

      {data.riwayat.length === 0 ? (
        <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
          Belum ada transaksi tercatat.
        </div>
      ) : (
        <div className="space-y-2">
          {data.riwayat.map(r => {
            const kat = KATEGORI_LABEL[r.jenis] || { label: r.jenis, warna: 'bg-gray-100 text-gray-600' };
            return (
              <div key={r.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kat.warna}`}>{kat.label}</span>
                    <div className="text-sm text-gray-700 mt-1">{r.keterangan}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmtTanggalJam(r.created_at)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold ${r.nominal < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {r.nominal < 0 ? '-' : '+'}{fmtRp(Math.abs(r.nominal))}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.dikonfirmasi_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {r.dikonfirmasi_at ? (r.nominal < 0 ? 'Terpakai' : 'Sudah Masuk') : 'Menunggu'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 text-xs">
                  <div className="text-gray-400">
                    Saldo setelah: <span className="text-gray-600 font-semibold">{r.saldo_setelah !== null ? fmtRp(r.saldo_setelah) : '—'}</span>
                  </div>
                  {r.bukti_tf_admin_path ? (
                    <a href={r.bukti_tf_admin_path} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] font-bold">
                      📎 Lihat Bukti TF
                    </a>
                  ) : (
                    <span className="text-gray-300">Belum ada lampiran</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>)}

      {tab === 'payslip' && (
        payslip === null ? (
          <div className="text-center text-gray-400 py-10">Memuat...</div>
        ) : payslip.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
            Belum ada payslip — muncul begitu ujroh Anda dikonfirmasi lewat pengajuan mingguan.
          </div>
        ) : (
          <div className="space-y-2">
            {payslip.map(p => {
              const isOpen = expandPeriode === p.pengajuan_id;
              return (
                <div key={p.pengajuan_id} className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden">
                  <button onClick={() => setExpandPeriode(isOpen ? null : p.pengajuan_id)}
                    className="w-full flex items-center justify-between p-3 text-left">
                    <div>
                      <div className="text-sm font-bold text-[#0E2F6E]">{fmtTanggal(p.periode_mulai)} – {fmtTanggal(p.periode_selesai)}</div>
                      <div className="text-[10px] text-gray-400">Pengajuan #{p.pengajuan_id} · {p.items.length} item</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">{fmtRp(p.total)}</div>
                      <div className="text-[10px] text-gray-300">{isOpen ? '▲' : '▼'}</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-50 p-3 space-y-1.5">
                      {p.items.map(it => (
                        <div key={it.id} className="flex justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                          <div>
                            <span className="text-[10px] font-bold text-[#1A4FA0]">{it.kategori_label}</span>
                            <div className="text-gray-600">{it.keterangan}</div>
                          </div>
                          <div className="font-bold text-[#0E2F6E] shrink-0">{fmtRp(it.nominal)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </Layout>
  );
}
