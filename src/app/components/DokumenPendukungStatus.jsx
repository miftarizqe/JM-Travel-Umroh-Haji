'use client';
import { DOC_LIST, statusDokumen, parseJamaahData } from '@/lib/dokumenPendukung';

// Tombol aksi dokumen pendukung di kartu booking (dashboard jamaah). Daftar
// dokumen + statusnya SENGAJA gak ditampilkan di sini lagi (kepanjangan,
// dikonfirmasi user 2026-10-01) — pindah ke "📄 Dokumen Saya"
// (DokumenSayaList, tombol Lihat Dokumen). Di sini cuma:
//  - peringatan kalau ada dokumen yang ditolak admin,
//  - "Lengkapi Dokumen" HANYA kalau masih ada yang belum diunggah,
//  - "Edit Data & Dokumen" (buka form-jamaah dengan data lama terisi).
//
// Booking LUNAS -> data & dokumen dikunci (dikonfirmasi user 2026-10-12),
// tombol diganti keterangan. Gerbang server-nya di PATCH /api/bookings/[id].
// KECUALI ada dokumen yang DITOLAK (dikonfirmasi user 2026-10-15, bug
// sebelumnya: pesan "data terkunci" nongol gitu aja walau ada dokumen
// ditolak yang WAJIB diganti) — arahkan ke "Dokumen Saya" (DokumenSayaList),
// yang punya endpoint sempit /api/bookings/[id]/dokumen-pendukung buat ganti
// SATU dokumen ditolak itu TANPA buka kunci field lain.
export default function DokumenPendukungStatus({ booking, onUnggah, onEdit }) {
  const jamaah = parseJamaahData(booking.jamaah_data);
  const ditolak = jamaah.some(j => DOC_LIST.some(d => statusDokumen(j, d.key)?.status === 'ditolak'));

  if (booking.pelunasan_status === 'paid') {
    if (ditolak) {
      // Amber + nada positif, bukan merah/❌ (dikonfirmasi user 2026-10-15,
      // "jangan merah silang, bikin yang lebih manusiawi") -- jamaah ini
      // udah lunas bayar, bukan lagi kesalahan dia yang perlu ditegur.
      return (
        <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          📋 Ada dokumen pendukung yang perlu diperbaiki — buka &ldquo;Dokumen Saya&rdquo; di bawah buat lihat alasannya & unggah ulang.
        </div>
      );
    }
    return (
      <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        🔒 Booking sudah lunas — data jamaah & dokumen tidak bisa diubah lagi. Hubungi admin JM Travel jika ada yang perlu dikoreksi.
      </div>
    );
  }
  const total = jamaah.length * DOC_LIST.length;
  const terunggah = jamaah.reduce((n, j) => n + DOC_LIST.filter(d => j?.[d.key]).length, 0);
  const belumLengkap = total === 0 || terunggah < total;

  return (
    <div className="mt-2 space-y-2">
      {ditolak && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          📋 Ada dokumen pendukung yang perlu diperbaiki — lihat alasannya di &ldquo;Dokumen Saya&rdquo;, lalu ganti lewat Edit.
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
