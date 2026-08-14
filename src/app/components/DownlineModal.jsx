'use client';
import { useEffect, useState } from 'react';
import { CollapsibleSection } from '@/app/components/Collapsible';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const JENIS_LABEL = {
  closing_pribadi: 'Pribadi', closing_bsi: 'BSI', reseller_perwakilan: 'Margin Reseller',
};

// Modal untuk perwakilan menelusuri asal-usul komisi: klik downline →
// lihat closing booking-nya (ringkasan saja, TANPA data pribadi jamaah) +
// berapa komisi yang saya dapat dari tiap booking itu — lalu bisa drill-down
// lagi ke downline-nya downline itu (berjenjang), dipakai dashboard perwakilan.
export default function DownlineModal({ userId, targetId: targetIdAwal, onClose }) {
  const [breadcrumb, setBreadcrumb] = useState([]); // [{id,name}, ...] jejak sebelum yang sekarang
  const [targetId, setTargetId] = useState(targetIdAwal);
  // Loading/error diturunkan dari perbandingan forId vs targetId (bukan
  // di-reset imperatif di awal efek) — satu-satunya setState di efek ini
  // ada di dalam callback .then/.catch, yang aman dari flag
  // react-hooks/set-state-in-effect (React Compiler).
  const [result, setResult] = useState({ forId: null, data: null, error: null });

  useEffect(() => {
    let ignore = false;
    fetch(`/api/downline/closings?user_id=${userId}&target_id=${targetId}`)
      .then(r => r.json())
      .then(d => {
        if (ignore) return;
        setResult(d.error
          ? { forId: targetId, data: null, error: d.error }
          : { forId: targetId, data: d, error: null });
      })
      .catch(() => {
        if (!ignore) setResult({ forId: targetId, data: null, error: 'Terjadi kesalahan' });
      });
    return () => { ignore = true; };
  }, [userId, targetId]);

  const loading = result.forId !== targetId;
  const { data, error } = result;

  function bukaDownline(d) {
    setBreadcrumb(prev => [...prev, { id: targetId, name: data?.target?.name }]);
    setTargetId(d.id);
  }

  function kembali() {
    const jejak = [...breadcrumb];
    const balik = jejak.pop();
    setBreadcrumb(jejak);
    setTargetId(balik.id);
  }

  const totalKomisiSaya = (data?.closings || []).reduce((s, c) => s + c.total_komisi_saya, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            {breadcrumb.length > 0 && (
              <button onClick={kembali} className="text-xs text-gray-400 hover:text-[#1A4FA0] mb-1">
                ← Kembali ke {breadcrumb[breadcrumb.length - 1].name}
              </button>
            )}
            {data?.target && (
              <div>
                <div className="font-bold text-lg text-[#0E2F6E]">{data.target.name}</div>
                <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                  <span className="font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                    {data.target.role}
                  </span>
                  <span>{data.target.kode_unik}</span>
                </div>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Memuat...</div>
        ) : error ? (
          <div className="text-center text-red-500 py-10">{error}</div>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#E8F0FB] rounded-xl p-4">
              <div className="text-xs text-[#1A4FA0]">Total komisi yang Anda dapat dari {data.target.name}</div>
              <div className="text-xl font-black text-[#C9952A]">{rp(totalKomisiSaya)}</div>
            </div>

            <CollapsibleSection
              title={<div className="font-bold text-[#0E2F6E] text-sm">📦 Closing {data.target.name}</div>}
              badge={data.closings.length}
            >
              {data.closings.length === 0 ? (
                <div className="bg-gray-50 rounded-xl p-4 text-center text-xs text-gray-400">Belum ada closing.</div>
              ) : (
                <div className="space-y-2">
                  {data.closings.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-[#e0e8f0] p-3 text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-bold text-[#0E2F6E]">{c.prog_name}</div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          c.status === 'selesai' ? 'bg-green-100 text-green-700' :
                          c.dp_status === 'confirmed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {c.status === 'selesai' ? '✅ Selesai' : c.dp_status === 'confirmed' ? 'DP OK' : 'DP Pending'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 capitalize">{c.paket} · {c.kamar} · {c.jumlah_jamaah} jamaah · {tgl(c.created_at)}</div>
                      {c.komisi_saya.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.komisi_saya.map((k, i) => (
                            <span key={i} className="text-[10px] font-bold bg-[#FEF3DC] text-[#8a6516] px-2 py-1 rounded-full">
                              {JENIS_LABEL[k.jenis] || k.jenis}: {rp(k.nominal)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-[10px] text-gray-300">Belum ada komisi cair dari booking ini.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title={<div className="font-bold text-[#0E2F6E] text-sm">🌳 Downline dari {data.target.name}</div>}
              badge={data.downline_target.length}
            >
              {data.downline_target.length === 0 ? (
                <div className="bg-gray-50 rounded-xl p-4 text-center text-xs text-gray-400">Belum ada downline.</div>
              ) : (
                <div className="space-y-1.5">
                  {data.downline_target.map(d => (
                    <div key={d.id} onClick={() => bukaDownline(d)}
                      className="flex justify-between items-center bg-white hover:bg-blue-50 border border-[#e0e8f0] rounded-lg px-3 py-2 text-sm cursor-pointer">
                      <div>
                        <span className="font-semibold text-[#0E2F6E]">{d.name}</span>
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700">
                          {d.role}
                        </span>
                      </div>
                      <span className="text-[#1A4FA0]">→</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}
