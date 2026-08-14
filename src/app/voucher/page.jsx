'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

export default function VoucherPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disalin, setDisalin] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetch('/api/vouchers/saya')
      .then(r => r.json())
      .then(d => setVouchers(d.vouchers || []))
      .finally(() => setLoading(false));
  }, [user]);

  function salinKode(kode) {
    navigator.clipboard?.writeText(kode);
    setDisalin(kode);
    setTimeout(() => setDisalin(null), 1500);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  return (
    <Layout title="🎟️ Voucher Saya" showBack>
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-gray-400 mb-4">
          Voucher aktif yang bisa Anda pakai. Salin kode-nya, lalu masukkan di halaman Ringkasan saat checkout.
        </p>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Memuat...</div>
        ) : vouchers.length === 0 ? (
          <div className="bg-[#E8F0FB] rounded-xl p-6 text-center text-sm text-[#1A4FA0]">
            Belum ada voucher aktif untuk akun Anda saat ini.{' '}
            <span className="font-bold cursor-pointer underline" onClick={() => router.push('/programs')}>
              Lihat program →
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {vouchers.map(v => (
              <div key={v.kode} className="bg-white rounded-xl border-2 border-dashed border-[#C9952A] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-lg text-[#0E2F6E] tracking-wider">{v.kode}</span>
                      {v.akses_role === 'akun' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">Khusus untuk Anda</span>
                      )}
                      {v.akses_role === 'perwakilan' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">Khusus Perwakilan</span>
                      )}
                    </div>
                    <div className="text-sm text-[#C9952A] font-bold mt-0.5">Potongan {rp(v.potongan)} / jamaah</div>
                    {v.catatan && <div className="text-xs text-gray-400 mt-1">{v.catatan}</div>}
                    <div className="text-[10px] text-gray-400 mt-2 space-y-0.5">
                      <div>{v.prog_name ? `Khusus program: ${v.prog_name}` : 'Berlaku untuk semua program'}</div>
                      {v.valid_until && <div>Berlaku sampai {tgl(v.valid_until)}</div>}
                      <div>{v.sisa_kuota != null ? `Sisa kuota: ${v.sisa_kuota} jamaah` : 'Tanpa batas kuota'}</div>
                    </div>
                  </div>
                  <button onClick={() => salinKode(v.kode)}
                    className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-2 rounded-full whitespace-nowrap transition-colors">
                    {disalin === v.kode ? '✅ Disalin' : '📋 Salin'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
