'use client';
import { useEffect, useState } from 'react';
import { DOC_LIST, STATUS_DOKUMEN, statusDokumen, parseJamaahData } from '@/lib/dokumenPendukung';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const JENIS_LABEL = { invoice: 'Invoice', kwitansi: 'Kwitansi Pembayaran', tanda_terima: 'Tanda Terima Uang' };

// Ringkas status beberapa dokumen jadi 1 badge: ditolak > menunggu > terverifikasi.
function statusGabungan(list) {
  if (list.some(s => s.status === 'ditolak')) return 'ditolak';
  if (list.some(s => s.status === 'menunggu')) return 'menunggu';
  return 'diverifikasi';
}

// "📄 Dokumen Saya" di kartu booking dashboard jamaah, untuk booking aktif
// maupun riwayat:
//  - dokumen yang dikirim admin (Invoice/Kwitansi/Tanda Terima Uang), lihat
//    src/app/api/bookings/[id]/dokumen/route.js;
//  - dokumen pendukung yang diunggah jamaah (paspor/KK/KTP/vaksin/foto) —
//    digabung ke sini (dikonfirmasi user 2026-10-01), daftarnya dilipat di
//    balik tombol "Lihat Dokumen" biar kartunya gak kepanjangan.
// `booking` opsional — tanpa itu cuma dokumen admin yang tampil.
export default function DokumenSayaList({ bookingId, booking }) {
  const [dokumen, setDokumen] = useState(null);
  const [bukaPendukung, setBukaPendukung] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    fetch(`/api/bookings/${bookingId}/dokumen`)
      .then(r => r.json())
      .then(d => setDokumen(d.dokumen || []))
      .catch(() => setDokumen([]));
  }, [bookingId]);

  if (dokumen === null) return null;

  const jamaah = booking ? parseJamaahData(booking.jamaah_data) : [];
  const pendukung = jamaah.flatMap((j, idx) => DOC_LIST
    .filter(d => j?.[d.key])
    .map(d => ({ idx, nama: j.nama || `Jamaah ${idx + 1}`, label: d.label, path: j[d.key], st: statusDokumen(j, d.key) })));
  const infoGabungan = pendukung.length > 0 ? STATUS_DOKUMEN[statusGabungan(pendukung.map(p => p.st))] : null;

  // Scan fisik (materai + TTD) Perjanjian Jamaah — 1 PER JAMAAH sejak
  // 2026-10-13 (lihat jamaah_data[i].perjanjian_scan_path, diisi admin dari
  // /admin/cetak-perjanjian). Jamaah berhak liat hasil scan tanda tangan
  // mereka sendiri (dikonfirmasi user 2026-10-13, dokumen bernilai puluhan
  // juta rupiah — bukan cuma soal "udah klik setuju", tapi bukti fisiknya
  // juga). Booking LAMA (sebelum per-jamaah) cuma punya 1 scan gabungan di
  // level booking — ditampilkan sebagai 1 baris "seluruh booking", bukan
  // dipaksa diasosiasikan ke jamaah tertentu yang gak bisa dipastikan.
  const punyaPerJamaah = jamaah.some(j => j.perjanjian_scan_path);
  const perjanjianScan = punyaPerJamaah
    ? jamaah.map((j, idx) => ({ idx, nama: j.nama || `Jamaah ${idx + 1}`, path: j.perjanjian_scan_path }))
      .filter(p => p.path)
    : (booking?.perjanjian_scan_path ? [{ idx: null, nama: null, path: booking.perjanjian_scan_path }] : []);

  return (
    <div className="mt-3 bg-gray-50 rounded-xl p-3">
      <div className="text-xs font-bold text-[#0E2F6E] mb-2">📄 Dokumen Saya</div>
      {dokumen.length === 0 && pendukung.length === 0 && perjanjianScan.length === 0 ? (
        <div className="text-xs text-gray-400">Belum ada dokumen.</div>
      ) : (
        <div className="space-y-1.5">
          {pendukung.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="text-gray-600 flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold">Dokumen Pendukung</span>
                  <span className="text-gray-400">({pendukung.length})</span>
                  {infoGabungan && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${infoGabungan.cls}`}>{infoGabungan.ikon} {infoGabungan.label}</span>}
                </div>
                <button onClick={() => setBukaPendukung(v => !v)}
                  className="text-[10px] font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] px-2 py-0.5 rounded-full whitespace-nowrap">
                  {bukaPendukung ? 'Tutup' : 'Lihat Dokumen'}
                </button>
              </div>
              {bukaPendukung && (
                <div className="mt-1.5 pl-2 border-l-2 border-[#e0e8f0] space-y-1">
                  {pendukung.map(p => {
                    const info = STATUS_DOKUMEN[p.st.status];
                    return (
                      <div key={`${p.idx}-${p.path}`}>
                        <div className="flex items-center justify-between text-[11px] gap-2">
                          <span className="text-gray-600 truncate">{p.label}{jamaah.length > 1 ? ` — ${p.nama}` : ''}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {info && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${info.cls}`}>{info.ikon}</span>}
                            <a href={p.path} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-[#1A4FA0] hover:underline">Lihat</a>
                          </div>
                        </div>
                        {p.st.status === 'ditolak' && p.st.alasan && <div className="text-[10px] text-red-600">Ditolak: {p.st.alasan}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {perjanjianScan.map(p => (
            <div key={`perjanjian-${p.idx ?? 'booking'}`} className="flex items-center justify-between text-xs gap-2">
              <div className="text-gray-600">
                <span className="font-semibold">Perjanjian Jamaah (scan TTD fisik)</span>{p.nama ? ` — ${p.nama}` : ''}
              </div>
              <a href={p.path} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] px-2 py-0.5 rounded-full whitespace-nowrap">
                Lihat/Unduh
              </a>
            </div>
          ))}
          {dokumen.map(d => (
            <div key={d.id} className="flex items-center justify-between text-xs gap-2">
              <div className="text-gray-600">
                <span className="font-semibold">{JENIS_LABEL[d.jenis] || d.jenis}</span> — {tgl(d.tanggal)} · {rp(d.nominal)}
              </div>
              {d.file_url ? (
                <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] px-2 py-0.5 rounded-full whitespace-nowrap">
                  Lihat/Unduh
                </a>
              ) : d.link_ttd ? (
                <a href={d.link_ttd} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-bold text-white bg-[#C9952A] hover:bg-[#b9821a] px-2 py-0.5 rounded-full whitespace-nowrap">
                  ✍️ Tanda Tangani
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
