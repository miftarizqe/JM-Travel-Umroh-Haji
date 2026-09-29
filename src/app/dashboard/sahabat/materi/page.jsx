'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import MateriSahabatViewer from '@/app/components/MateriSahabatViewer';

export default function MateriSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [materi, setMateri] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dibuka, setDibuka] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'sahabat_baitullah') { router.push('/dashboard/jamaah'); return; }
    if (user.status !== 'active') return; // belum aktif — gak perlu fetch materi, lihat cabang render di bawah
    fetch('/api/sahabat/materi').then(r => r.json())
      .then(d => { setMateri(d.materi || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user) return <Layout title="🎞️ Materi Presentasi" showBack><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  // Menu tetap tampil di sidebar buat semua akun sahabat_baitullah
  // (dikonfirmasi user 2026-09-29 — sebelumnya disembunyikan pas belum
  // aktif, ternyata user lebih suka menunya tetap ada tapi kasih tau
  // alasannya di sini, bukan langsung dilempar ke halaman lain).
  if (user.status !== 'active') {
    return (
      <Layout title="🎞️ Materi Presentasi" showBack>
        <div className="max-w-2xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
            <div className="text-3xl mb-2">🔒</div>
            <h4 className="font-bold text-yellow-800 mb-1">Belum Bisa Diakses</h4>
            <p className="text-sm text-yellow-700 mt-1">
              Materi Presentasi cuma bisa dilihat setelah akun Sahabat Baitullah Anda aktif.
              Selesaikan dulu pendaftarannya, ya.
            </p>
            <button onClick={() => router.push('/status-pendaftaran-sahabat')}
              className="mt-3 bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full">
              Lihat Status Pendaftaran →
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) return <Layout title="🎞️ Materi Presentasi" showBack><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  return (
    <Layout title="🎞️ Materi Presentasi" showBack>
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="bg-[#E8F0FB] text-[#0E2F6E] text-xs rounded-xl p-3">
          Bahan presentasi resmi Sahabat Baitullah dari JM Travel — bisa dilihat langsung di sini, tapi <b>tidak bisa diunduh</b>. Silakan
          dipakai sebagai bahan menjelaskan program ke calon anggota baru.
        </div>

        {materi.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">
            Belum ada materi yang diunggah admin.
          </div>
        ) : materi.map(m => (
          <div key={m.id} onClick={() => setDibuka(m)}
            className="bg-white rounded-xl border border-[#e0e8f0] p-4 flex items-center justify-between cursor-pointer hover:border-[#1A4FA0] hover:shadow-md transition-all">
            <div>
              <div className="font-bold text-[#0E2F6E]">🎞️ {m.judul}</div>
              {m.deskripsi && <div className="text-xs text-gray-500 mt-0.5">{m.deskripsi}</div>}
              <div className="text-[10px] text-gray-400 mt-1">{m.slides.length} slide</div>
            </div>
            <div className="text-[#1A4FA0] font-bold text-sm shrink-0">Lihat →</div>
          </div>
        ))}
      </div>

      {dibuka && <MateriSahabatViewer materi={dibuka} user={user} onClose={() => setDibuka(null)} />}
    </Layout>
  );
}
