'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { hargaTermurahPaket, hargaTermurahProgram } from '@/lib/harga';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function ProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user] = useCurrentUser();

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => { setPrograms(d.programs || []); setLoading(false); });
  }, []);

  return (
    <Layout title="🕌 Program Umroh">
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-400 text-sm">Memuat program...</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {programs.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-[#e0e8f0] overflow-hidden hover:shadow-xl transition-all group">
            <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] p-5 text-white">
              <div className="text-xs opacity-75 mb-1">{p.type} · {p.durasi} Hari</div>
              <div className="text-lg font-bold mb-1">{p.name}</div>
              <div className="text-xs opacity-85">{p.highlight}</div>
            </div>
            <div className="p-5">
              {/* Akomodasi — harga termurah per paket (dari 3 kombinasi kamar) */}
              <div className="flex gap-2 mb-4">
                {[
                  {label:'Deluxe', paket:'deluxe'},
                  {label:'Eksekutif', paket:'eksekutif'},
                  {label:'Signature', paket:'signature'}
                ].map(ak => (
                  <div key={ak.label} className="flex-1 bg-[#E8F0FB] rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-400">{ak.label}</div>
                    <div className="text-xs font-bold text-[#0E2F6E]">Rp {(hargaTermurahPaket(p, ak.paket)/1000000).toFixed(0)}jt</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                <span>📅 {p.tanggal}</span>
                <span>🪑 {p.total_seat - p.used_seat} seat tersisa</span>
              </div>

              <div className="h-1.5 bg-[#e0e8f0] rounded-full overflow-hidden mb-4">
                <div className="h-full bg-[#1A4FA0] rounded-full transition-all"
                  style={{width:`${Math.round(p.used_seat/p.total_seat*100)}%`}}></div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs text-gray-400">Mulai dari</div>
                  <div className="text-xl font-black text-[#0E2F6E]">Rp {(hargaTermurahProgram(p)/1000000).toFixed(0)} jt</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">DP</div>
                  <div className="text-sm font-bold text-[#C9952A]">Rp {(p.dp/1000000).toFixed(0)} jt</div>
                </div>
              </div>

              <button
                onClick={() => user ? router.push(`/checkout?prog_id=${p.id}`) : router.push('/login')}
                className="w-full bg-[#1A4FA0] group-hover:bg-[#C9952A] text-white font-bold py-2.5 rounded-full transition-colors">
                {user ? 'Daftar Sekarang →' : 'Masuk untuk Daftar →'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && programs.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">🕌</div>
          <div>Belum ada program tersedia.</div>
        </div>
      )}
    </Layout>
  );
}