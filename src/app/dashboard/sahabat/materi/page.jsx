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
    if (user.status !== 'active') { router.push('/status-pendaftaran-sahabat'); return; }
    fetch('/api/sahabat/materi').then(r => r.json())
      .then(d => { setMateri(d.materi || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user || loading) return <Layout title="🎞️ Materi Presentasi" showBack><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

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
