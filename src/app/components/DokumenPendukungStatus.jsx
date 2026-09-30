'use client';
import { DOC_LIST, STATUS_DOKUMEN, statusDokumen } from '@/lib/dokumenPendukung';

// Ringkasan dokumen pendukung per jamaah di kartu booking (dashboard jamaah,
// dikonfirmasi user 2026-10-01): status verifikasi admin tiap dokumen + tombol
// lihat, dan tombol ke form-jamaah buat unggah/ganti/hapus.
export default function DokumenPendukungStatus({ booking, onEdit }) {
  let jd = booking.jamaah_data;
  if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
  const jamaah = Array.isArray(jd) ? jd : [];

  const total = jamaah.length * DOC_LIST.length;
  const terunggah = jamaah.reduce((n, j) => n + DOC_LIST.filter(d => j?.[d.key]).length, 0);
  const ditolak = jamaah.some(j => DOC_LIST.some(d => statusDokumen(j, d.key)?.status === 'ditolak'));

  return (
    <div className="mt-3 bg-gray-50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-[#0E2F6E]">📎 Dokumen Pendukung</div>
        {total > 0 && <div className="text-[10px] text-gray-500">{terunggah}/{total} terunggah</div>}
      </div>
      {ditolak && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 mb-2">
          Ada dokumen yang ditolak admin — silakan ganti lewat tombol Edit di bawah.
        </div>
      )}
      {jamaah.length === 0 ? (
        <div className="text-xs text-gray-400">Formulir jamaah belum diisi.</div>
      ) : (
        <div className="space-y-2">
          {jamaah.map((j, idx) => (
            <div key={idx}>
              {jamaah.length > 1 && <div className="text-[11px] font-semibold text-gray-600 mb-1">{j?.nama || `Jamaah ${idx + 1}`}</div>}
              <div className="space-y-1">
                {DOC_LIST.map(d => {
                  const st = statusDokumen(j, d.key);
                  const info = st && STATUS_DOKUMEN[st.status];
                  return (
                    <div key={d.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-600 truncate">{d.label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {info ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${info.cls}`}
                            title={st.status === 'ditolak' && st.alasan ? `Alasan: ${st.alasan}` : undefined}>
                            {info.ikon} {info.label}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">Belum diunggah</span>
                        )}
                        {j?.[d.key] && (
                          <a href={j[d.key]} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] font-bold text-[#1A4FA0] hover:underline whitespace-nowrap">Lihat</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {DOC_LIST.map(d => {
                const st = statusDokumen(j, d.key);
                return st?.status === 'ditolak' && st.alasan
                  ? <div key={d.key} className="text-[10px] text-red-600 mt-0.5">{d.label} ditolak: {st.alasan}</div>
                  : null;
              })}
            </div>
          ))}
        </div>
      )}
      <button onClick={onEdit} className="w-full mt-2 text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] py-2 rounded-full">
        ✏️ Unggah / Edit Dokumen Pendukung
      </button>
    </div>
  );
}
