'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const STATUS_WARNA = {
  draft: 'bg-gray-100 text-gray-500', diajukan: 'bg-yellow-100 text-yellow-700',
  disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-600',
};

// Kalkulator Perwakilan — eksplorasi harga sendiri (rute/hotel/malam/
// mutawwif/kamar, mesin sama persis Kalkulator Estimasi Publik) tapi HPP
// diperlihatkan (bukan disembunyikan kayak publik) dan margin/ujroh diisi
// sendiri. Bisa disimpan (draft, buat ditawarkan ke jamaah) dan diajukan ke
// admin buat dipertimbangkan jadi program resmi.
export default function KalkulatorPerwakilanPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [tab, setTab] = useState('template'); // 'template' | 'quote'
  const [template, setTemplate] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'perwakilan') { router.replace('/login'); return; }
    Promise.all([
      fetch('/api/kalkulator-publik/template').then(r => r.json()),
      fetch('/api/perwakilan/kalkulator').then(r => r.json()),
    ]).then(([t, q]) => {
      setTemplate(t.template || []); setBaseline(t.baseline || []); setQuotes(q.leads || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, router]);

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const semuaTemplate = [...template, ...baseline];

  return (
    <Layout title="🧮 Kalkulator Perwakilan" showBack>
      <p className="text-xs text-gray-400 mb-4">
        Eksplorasi harga sendiri (rute/hotel/malam/mutawwif/kamar) — beda dari kalkulator publik, di sini Anda lihat HPP asli & isi margin/ujroh sendiri.
        Hasilnya bisa disimpan buat ditawarkan ke jamaah, dan bisa diajukan ke admin kalau mau dipertimbangkan jadi program resmi.
      </p>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('template')}
          className={`text-sm font-bold px-4 py-2 rounded-full ${tab==='template' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          🧮 Pilih Template
        </button>
        <button onClick={() => setTab('quote')}
          className={`text-sm font-bold px-4 py-2 rounded-full ${tab==='quote' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>
          📋 Quote Saya {quotes.length > 0 && `(${quotes.length})`}
        </button>
      </div>

      {tab === 'template' && (
        semuaTemplate.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada template kalkulator tersedia.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {semuaTemplate.map(t => (
              <button key={t.id} onClick={() => router.push(`/perwakilan/kalkulator/${t.id}`)}
                className="text-left bg-white rounded-2xl border border-[#e0e8f0] overflow-hidden hover:shadow-lg transition-all">
                {t.gambar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.gambar} alt={t.nama} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] flex items-center justify-center text-white text-3xl">🕋</div>
                )}
                <div className="p-4">
                  <div className="font-bold text-[#0E2F6E]">{t.nama}</div>
                  {t.deskripsi && <div className="text-xs text-gray-400 mt-1 line-clamp-2">{t.deskripsi}</div>}
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'quote' && (
        quotes.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">Belum ada quote tersimpan.</div>
        ) : (
          <div className="space-y-2">
            {quotes.map(q => (
              <div key={q.id} onClick={() => router.push(`/perwakilan/kalkulator/${q.template_id}?quote_id=${q.id}`)}
                className="bg-white rounded-xl border border-[#e0e8f0] p-4 cursor-pointer hover:shadow-md hover:border-[#1A4FA0] transition-all">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <div className="font-bold text-[#0E2F6E]">{q.nama_quote || q.template_nama}</div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_WARNA[q.status]}`}>{STATUS_LABEL[q.status]}</span>
                </div>
                <div className="text-sm text-gray-600">{q.template_nama} — {q.paket}/{q.kamar} · <span className="font-bold text-[#1A4FA0]">{rp(q.harga_jual_perwakilan)}</span></div>
                <div className="text-[10px] text-gray-400 mt-1">Dibuat {tgl(q.created_at)}{q.diajukan_at && <> · Diajukan {tgl(q.diajukan_at)}</>}</div>
                {q.catatan_admin && <div className="text-xs text-gray-500 mt-1 italic">Catatan admin: {q.catatan_admin}</div>}
              </div>
            ))}
          </div>
        )
      )}
    </Layout>
  );
}
