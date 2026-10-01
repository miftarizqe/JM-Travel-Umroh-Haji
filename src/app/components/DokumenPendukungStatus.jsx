'use client';
import { DOC_LIST, statusDokumen, parseJamaahData } from '@/lib/dokumenPendukung';

// Tombol aksi dokumen pendukung di kartu booking (dashboard jamaah). Daftar
// dokumen + statusnya SENGAJA gak ditampilkan di sini lagi (kepanjangan,
// dikonfirmasi user 2026-10-01) — pindah ke "📄 Dokumen Saya"
// (DokumenSayaList, tombol Lihat Dokumen). Di sini cuma:
//  - peringatan kalau ada dokumen yang ditolak admin,
//  - "Lengkapi Dokumen" HANYA kalau masih ada yang belum diunggah,
//  - "Edit Data & Dokumen" (buka form-jamaah dengan data lama terisi).
export default function DokumenPendukungStatus({ booking, onUnggah, onEdit }) {
  const jamaah = parseJamaahData(booking.jamaah_data);
  const total = jamaah.length * DOC_LIST.length;
  const terunggah = jamaah.reduce((n, j) => n + DOC_LIST.filter(d => j?.[d.key]).length, 0);
  const belumLengkap = total === 0 || terunggah < total;
  const ditolak = jamaah.some(j => DOC_LIST.some(d => statusDokumen(j, d.key)?.status === 'ditolak'));

  return (
    <div className="mt-2 space-y-2">
      {ditolak && (
        <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          ❌ Ada dokumen pendukung yang ditolak admin — lihat alasannya di "Dokumen Saya", lalu ganti lewat Edit.
        </div>
      )}
      <div className={`grid gap-2 ${belumLengkap ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {belumLengkap && (
          <button onClick={onUnggah} className="text-xs font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] py-2 rounded-full">
            📤 Lengkapi Dokumen{total > 0 ? ` (${terunggah}/${total})` : ''}
          </button>
        )}
        <button onClick={onEdit} className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] py-2 rounded-full">
          ✏️ Edit Data & Dokumen
        </button>
      </div>
    </div>
  );
}
