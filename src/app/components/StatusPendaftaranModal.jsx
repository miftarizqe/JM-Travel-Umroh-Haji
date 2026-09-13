'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function tgl(t) {
  if (!t) return '';
  return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Label singkat, salinan dari STEP_PENDAFTARAN (src/app/api/status-pendaftaran/route.js)
// & STEP_PENDAFTARAN_SAHABAT (src/app/api/status-pendaftaran-sahabat/route.js) —
// sengaja duplikat kecil ini, bukan import lintas route.js.
const LABEL = {
  perwakilan: {
    pending: 'Verifikasi Data oleh Admin', docs_sent: 'Perjanjian Dikirim ke Alamat Anda',
    waiting_docs_return: 'Menunggu Rangkapan Dikirim Kembali', waiting_visit: 'Menunggu Kunjungan Kantor',
    active: 'Perwakilan Aktif', ditolak: 'Pendaftaran Ditolak',
  },
  sahabat: {
    pending: 'Upload Bukti Transfer', menunggu_bsi: 'Menunggu Akun BSI & Tabungan Haji',
    menunggu_sk_cif: 'Menunggu SK-CIF', active: 'Jamaah Sahabat Baitullah Aktif', ditolak: 'Pendaftaran Ditolak',
  },
};
const ENDPOINT = { perwakilan: '/api/status-pendaftaran', sahabat: '/api/status-pendaftaran-sahabat' };
const HALAMAN_LANJUT = { perwakilan: '/status-pendaftaran', sahabat: '/status-pendaftaran-sahabat' };

// Popup riwayat status pendaftaran — dibuka dari baris "Status Pendaftaran"
// di /profil (untuk KEDUA role: perwakilan & sahabat, dibedakan lewat prop
// `tipe`). Shell di-model dari DownlineModal.jsx.
export default function StatusPendaftaranModal({ tipe, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(ENDPOINT[tipe]).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [tipe]);

  const statusSekarang = data?.pendaftaran?.status || null;
  const labelSekarang = statusSekarang ? (LABEL[tipe][statusSekarang] || statusSekarang) : null;
  const sudahSelesai = statusSekarang === 'active' || statusSekarang === 'ditolak';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div className="font-bold text-lg text-[#0E2F6E]">📝 Status Pendaftaran {tipe === 'sahabat_baitullah' ? 'Sahabat Baitullah' : 'Perwakilan'}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Memuat...</div>
        ) : !data?.pendaftaran ? (
          <div className="text-center text-gray-400 py-10">Belum ada pendaftaran.</div>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#E8F0FB] rounded-xl p-4 text-center">
              <div className="text-xs text-[#1A4FA0] mb-1">Status Saat Ini</div>
              <div className="font-bold text-[#0E2F6E]">{labelSekarang}</div>
            </div>

            <div>
              <div className="font-bold text-[#0E2F6E] text-sm mb-2">Riwayat</div>
              {(data.history || []).length === 0 ? (
                <div className="text-center text-xs text-gray-400 py-4">Belum ada riwayat tercatat.</div>
              ) : (
                <div className="space-y-2">
                  {data.history.map((h, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-[#1A4FA0] mt-1.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-semibold text-[#0E2F6E]">{LABEL[tipe][h.status_baru] || h.status_baru}</div>
                        <div className="text-[10px] text-gray-400">{tgl(h.created_at)}</div>
                        {h.catatan && <div className="text-xs text-gray-500 mt-0.5">{h.catatan}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!sudahSelesai && (
              <button onClick={() => router.push(HALAMAN_LANJUT[tipe])}
                className="w-full bg-[#C9952A] hover:bg-yellow-600 text-white font-bold py-2.5 rounded-full text-sm">
                Lanjutkan Pendaftaran →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
