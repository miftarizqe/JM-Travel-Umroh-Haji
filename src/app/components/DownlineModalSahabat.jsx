'use client';
import { useEffect, useState } from 'react';

const FUNNEL_LABEL = {
  pending: 'Verifikasi TF', menunggu_bsi: 'Menunggu BSI', menunggu_sk_cif: 'Menunggu SK-CIF',
  active: 'Aktif', ditolak: 'Ditolak',
};

// Modal drill-down jaringan sahabat (siapa merekrut siapa), berjenjang
// tanpa batas — pola breadcrumb sama persis DownlineModal.jsx punya
// perwakilan, TAPI TANPA section closing/komisi (sahabat gak punya itu).
export default function DownlineModalSahabat({ targetId: targetIdAwal, onClose }) {
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [targetId, setTargetId] = useState(targetIdAwal);
  const [result, setResult] = useState({ forId: null, data: null, error: null });

  useEffect(() => {
    let ignore = false;
    fetch(`/api/sahabat/downline/${targetId}`)
      .then(r => r.json())
      .then(d => {
        if (ignore) return;
        setResult(d.error ? { forId: targetId, data: null, error: d.error } : { forId: targetId, data: d, error: null });
      })
      .catch(() => { if (!ignore) setResult({ forId: targetId, data: null, error: 'Terjadi kesalahan' }); });
    return () => { ignore = true; };
  }, [targetId]);

  const loading = result.forId !== targetId;
  const { data, error } = result;

  function bukaRekrutan(r) {
    setBreadcrumb(prev => [...prev, { id: targetId, name: data?.target?.name }]);
    setTargetId(r.id);
  }

  function kembali() {
    const jejak = [...breadcrumb];
    const balik = jejak.pop();
    setBreadcrumb(jejak);
    setTargetId(balik.id);
  }

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
                  <span className="font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{data.target.role}</span>
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
          <div>
            <div className="font-bold text-[#0E2F6E] text-sm mb-2">👥 Rekrutan {data.target.name}</div>
            {data.rekrutan.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center text-xs text-gray-400">Belum ada rekrutan.</div>
            ) : (
              <div className="space-y-2">
                {data.rekrutan.map(r => (
                  <div key={r.id} onClick={() => bukaRekrutan(r)}
                    className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm cursor-pointer">
                    <div>
                      <div className="font-semibold text-[#0E2F6E]">{r.name}</div>
                      <div className="text-[10px] text-gray-400">{r.kode_unik}</div>
                    </div>
                    <span className="text-[10px] font-bold text-[#1A4FA0] bg-[#E8F0FB] px-2.5 py-1 rounded-full">
                      {r.funnel_status ? (FUNNEL_LABEL[r.funnel_status] || r.funnel_status) : (r.status === 'active' ? 'Aktif' : 'Menunggu')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
