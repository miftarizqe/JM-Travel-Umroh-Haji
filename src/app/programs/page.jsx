'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { hargaTermurahPaket, hargaTermurahProgram } from '@/lib/harga';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { tangkapRefPerwakilan } from '@/lib/referralCapture';

// Section per publish_type (dikonfirmasi user 2026-09-27) — API
// (/api/programs) udah nyaring per role di server (sahabat gak pernah
// dikirimin 'perwakilan', perwakilan gak pernah dikirimin 'sahabat_baitullah',
// dst), jadi di sini cukup dikelompokkan aja: section yang gak ada isinya
// otomatis gak muncul, gak perlu logic sembunyi-sembunyi tambahan per role.
const SECTION_URUTAN = [
  { key: 'public', judul: '🕌 Program Reguler', deskripsi: 'Program umroh & haji terbuka untuk umum.' },
  { key: 'sahabat_baitullah', judul: '🤝 Program Eksklusif Sahabat Baitullah', deskripsi: 'Khusus anggota Program Sahabat Baitullah.' },
  { key: 'private', judul: '🎯 Program Khusus untuk Anda', deskripsi: 'Ditujukan admin khusus untuk akun Anda.' },
  { key: 'perwakilan', judul: '🏢 Program Khusus Perwakilan', deskripsi: 'Ditujukan admin khusus untuk wilayah/perwakilan Anda.' },
];

function KartuProgram({ p, user, router, isTarget, isPendingNewChoice, targetSuspended, eksklusifBukanTarget }) {
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden hover:shadow-xl transition-all group ${(isTarget || isPendingNewChoice) ? 'border-[#C9952A] ring-2 ring-[#C9952A]/30' : 'border-[#e0e8f0]'}`}>
      <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] p-5 text-white">
        {isPendingNewChoice ? (
          <div className="inline-block bg-[#C9952A] text-[#0E2F6E] text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">⏳ Pilihan Paket Baru Anda</div>
        ) : isTarget && targetSuspended ? (
          <div className="inline-block bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">⏸️ Nonaktif Sementara</div>
        ) : isTarget && (
          <div className="inline-block bg-[#C9952A] text-[#0E2F6E] text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">🎯 Target Impian Anda</div>
        )}
        <div className="text-xs opacity-75 mb-1">{p.type} · {p.durasi} Hari</div>
        <div className="text-lg font-bold mb-1">{p.name}</div>
        <div className="text-xs opacity-85">{p.highlight}</div>
      </div>
      <div className="p-5">
        {/* Akomodasi — harga termurah per paket (dari 3 kombinasi kamar) */}
        <div className="flex gap-2 mb-4">
          {[
            {label:'Deluxe', paket:'deluxe'},
            {label:'Eksekutif', paket:'eksekutif'},
            {label:'Signature', paket:'signature'}
          ].map(ak => (
            <div key={ak.label} className="flex-1 bg-[#E8F0FB] rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-400">{ak.label}</div>
              <div className="text-xs font-bold text-[#0E2F6E]">Rp {(hargaTermurahPaket(p, ak.paket)/1000000).toFixed(0)}jt</div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
          <span>📅 {p.tanggal}</span>
          <span>🪑 {p.total_seat - p.used_seat} seat tersisa</span>
        </div>

        <div className="h-1.5 bg-[#e0e8f0] rounded-full overflow-hidden mb-4">
          <div className="h-full bg-[#1A4FA0] rounded-full transition-all"
            style={{width:`${Math.round(p.used_seat/p.total_seat*100)}%`}}></div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-gray-400">Mulai dari</div>
            <div className="text-xl font-black text-[#0E2F6E]">Rp {(hargaTermurahProgram(p)/1000000).toFixed(0)} jt</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">DP</div>
            <div className="text-sm font-bold text-[#C9952A]">Rp {(p.dp/1000000).toFixed(0)} jt</div>
          </div>
        </div>

        {/* Program eksklusif Sahabat Baitullah yang BUKAN target impian
            mereka saat ini — cuma boleh "Lihat Detail" (itinerary/harga),
            gak bisa langsung checkout (dikonfirmasi user 2026-09-29). Mau
            ikut program ini harus lewat alur baca S&K + konfirmasi di
            halaman detail program itu sendiri (dikonfirmasi user
            2026-09-30 — sengaja gak dibikin gampang), wajib ACC admin
            dulu. Target LAMA yang lagi nonaktif sementara (ada pengajuan
            pindah yang menunggu ACC) JUGA cuma "Lihat Detail", gak bisa
            checkout sampai pengajuannya diproses. */}
        {isPendingNewChoice ? (
          <button onClick={() => router.push(`/program/${p.id}`)}
            className="w-full bg-white border-2 border-[#C9952A] text-[#C9952A] font-bold py-2.5 rounded-full transition-colors">
            ⏳ Pilihan Paket Baru Anda
          </button>
        ) : (eksklusifBukanTarget || targetSuspended) ? (
          <button onClick={() => router.push(`/program/${p.id}`)}
            className="w-full bg-white border-2 border-[#1A4FA0] group-hover:border-[#C9952A] text-[#1A4FA0] group-hover:text-[#C9952A] font-bold py-2.5 rounded-full transition-colors">
            Lihat Detail →
          </button>
        ) : (
          <button
            onClick={() => user ? router.push(`/checkout?prog_id=${p.id}`) : router.push('/login')}
            className="w-full bg-[#1A4FA0] group-hover:bg-[#C9952A] text-white font-bold py-2.5 rounded-full transition-colors">
            {user ? 'Daftar Sekarang →' : 'Masuk untuk Daftar →'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState([]);
  const [targetProgramId, setTargetProgramId] = useState(null);
  const [targetGantiProgramId, setTargetGantiProgramId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user] = useCurrentUser();

  useEffect(() => { tangkapRefPerwakilan(); }, []);

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => {
        setPrograms(d.programs || []);
        setTargetProgramId(d.target_program_id || null);
        setTargetGantiProgramId(d.target_ganti_program_id || null);
        setLoading(false);
      });
  }, []);

  return (
    <Layout title="🕌 Program Umroh" backHref={!user ? '/' : undefined}>
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-400 text-sm">Memuat program...</div>
        </div>
      )}

      <div className="space-y-10">
        {SECTION_URUTAN.map(s => {
          let isi = programs.filter(p => (p.publish_type || 'public') === s.key);
          if (isi.length === 0) return null;
          // Program target Sahabat Baitullah SELALU disematkan paling
          // depan section ini (dikonfirmasi user 2026-09-29) — bukan urut
          // created_at biasa kayak section lain, biar jamaah langsung
          // lihat progress ke target sebelum ngelirik paket lain.
          if (s.key === 'sahabat_baitullah' && targetProgramId) {
            isi = [...isi].sort((a, b) => (a.id === targetProgramId ? -1 : b.id === targetProgramId ? 1 : 0));
          }
          return (
            <div key={s.key}>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-[#0E2F6E]">{s.judul}</h2>
                <p className="text-xs text-gray-400">{s.deskripsi}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isi.map(p => (
                  <KartuProgram key={p.id} p={p} user={user} router={router}
                    isTarget={s.key === 'sahabat_baitullah' && p.id === targetProgramId}
                    isPendingNewChoice={s.key === 'sahabat_baitullah' && !!targetGantiProgramId && p.id === targetGantiProgramId}
                    targetSuspended={s.key === 'sahabat_baitullah' && p.id === targetProgramId && !!targetGantiProgramId}
                    eksklusifBukanTarget={s.key === 'sahabat_baitullah' && !!targetProgramId && p.id !== targetProgramId} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && programs.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">🕌</div>
          <div>Belum ada program tersedia.</div>
        </div>
      )}
    </Layout>
  );
}