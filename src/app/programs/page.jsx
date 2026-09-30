'use client';
import { useEffect, useRef, useState } from 'react';
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
// Eksklusif Sahabat Baitullah PALING ATAS (dikonfirmasi user 2026-09-30) —
// aman buat role lain karena server gak pernah ngirim publish_type ini ke
// selain akun sahabat, jadi section-nya otomatis gak muncul buat mereka.
const SECTION_URUTAN = [
  { key: 'sahabat_baitullah', judul: '🤝 Program Eksklusif Sahabat Baitullah', deskripsi: 'Khusus anggota Program Sahabat Baitullah.' },
  { key: 'public', judul: '🕌 Program Reguler', deskripsi: 'Program umroh & haji terbuka untuk umum.' },
  { key: 'private', judul: '🎯 Program Khusus untuk Anda', deskripsi: 'Ditujukan admin khusus untuk akun Anda.' },
  { key: 'perwakilan', judul: '🏢 Program Khusus Perwakilan', deskripsi: 'Ditujukan admin khusus untuk wilayah/perwakilan Anda.' },
];

function BadgeTarget({ isTarget, isPendingNewChoice, targetSuspended }) {
  if (isPendingNewChoice) return <div className="inline-block bg-[#C9952A] text-[#0E2F6E] text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">⏳ Pilihan Paket Baru Anda</div>;
  if (isTarget && targetSuspended) return <div className="inline-block bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">⏸️ Nonaktif Sementara</div>;
  if (isTarget) return <div className="inline-block bg-[#C9952A] text-[#0E2F6E] text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">🎯 Target Impian Anda</div>;
  return null;
}

// Program eksklusif Sahabat Baitullah yang BUKAN target impian mereka saat
// ini — cuma boleh "Lihat Detail" (itinerary/harga), gak bisa langsung
// checkout (dikonfirmasi user 2026-09-29). Mau ikut program ini harus lewat
// alur baca S&K + konfirmasi di halaman detail program itu sendiri
// (dikonfirmasi user 2026-09-30 — sengaja gak dibikin gampang), wajib ACC
// admin dulu. Target LAMA yang lagi nonaktif sementara (ada pengajuan pindah
// yang menunggu ACC) JUGA cuma "Lihat Detail", gak bisa checkout sampai
// pengajuannya diproses.
function TombolAksi({ p, user, router, isPendingNewChoice, targetSuspended, eksklusifBukanTarget }) {
  if (isPendingNewChoice) {
    return (
      <button onClick={() => router.push(`/program/${p.id}`)}
        className="w-full bg-white border-2 border-[#C9952A] text-[#C9952A] font-bold py-2.5 rounded-full transition-colors">
        ⏳ Pilihan Paket Baru Anda
      </button>
    );
  }
  if (eksklusifBukanTarget || targetSuspended) {
    return (
      <button onClick={() => router.push(`/program/${p.id}`)}
        className="w-full bg-white border-2 border-[#1A4FA0] group-hover:border-[#C9952A] text-[#1A4FA0] group-hover:text-[#C9952A] font-bold py-2.5 rounded-full transition-colors">
        Lihat Detail →
      </button>
    );
  }
  return (
    <button
      onClick={() => user ? router.push(`/checkout?prog_id=${p.id}`) : router.push('/login')}
      className="w-full bg-[#1A4FA0] group-hover:bg-[#C9952A] text-white font-bold py-2.5 rounded-full transition-colors">
      {user ? 'Daftar Sekarang →' : 'Masuk untuk Daftar →'}
    </button>
  );
}

function KartuProgram({ p, user, router, isTarget, isPendingNewChoice, targetSuspended, eksklusifBukanTarget }) {
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden hover:shadow-xl transition-all group ${(isTarget || isPendingNewChoice) ? 'border-[#C9952A] ring-2 ring-[#C9952A]/30' : 'border-[#e0e8f0]'}`}>
      <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] p-5 text-white">
        <BadgeTarget isTarget={isTarget} isPendingNewChoice={isPendingNewChoice} targetSuspended={targetSuspended} />
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

        <TombolAksi p={p} user={user} router={router} isPendingNewChoice={isPendingNewChoice}
          targetSuspended={targetSuspended} eksklusifBukanTarget={eksklusifBukanTarget} />
      </div>
    </div>
  );
}

// Kartu Program Eksklusif Sahabat Baitullah — sengaja BEDA dari kartu
// reguler (dikonfirmasi user 2026-09-30): banner lebar penuh, aksen emas,
// info disusun horizontal di layar lebar. Aturan badge/tombol sama persis
// (BadgeTarget/TombolAksi di atas).
function KartuEksklusif({ p, user, router, isTarget, isPendingNewChoice, targetSuspended, eksklusifBukanTarget }) {
  const sisaSeat = p.total_seat - p.used_seat;
  return (
    <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E2F6E] via-[#16408F] to-[#0E2F6E] text-white border-2 border-[#C9952A] shadow-xl">
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-[#C9952A]/20" aria-hidden="true" />
      <div className="absolute -left-10 -bottom-20 w-48 h-48 rounded-full bg-white/5" aria-hidden="true" />
      <div className="relative grid md:grid-cols-5 gap-5 p-6 md:p-8">
        <div className="md:col-span-3">
          <div className="inline-block bg-[#C9952A] text-[#0E2F6E] text-[10px] font-black tracking-wide px-2.5 py-1 rounded-full mb-2 mr-2">⭐ EKSKLUSIF SAHABAT BAITULLAH</div>
          <BadgeTarget isTarget={isTarget} isPendingNewChoice={isPendingNewChoice} targetSuspended={targetSuspended} />
          <div className="text-xs opacity-75 mb-1">{p.type} · {p.durasi} Hari · 📅 {p.tanggal}</div>
          <div className="text-2xl md:text-3xl font-black leading-tight mb-2">{p.name}</div>
          <div className="text-sm opacity-85 mb-4">{p.highlight}</div>
          <div className="flex gap-2">
            {[
              {label:'Deluxe', paket:'deluxe'},
              {label:'Eksekutif', paket:'eksekutif'},
              {label:'Signature', paket:'signature'}
            ].map(ak => (
              <div key={ak.label} className="flex-1 bg-white/10 border border-white/15 rounded-xl p-2 text-center">
                <div className="text-[10px] opacity-70">{ak.label}</div>
                <div className="text-sm font-bold text-[#F3D58A]">Rp {(hargaTermurahPaket(p, ak.paket)/1000000).toFixed(0)}jt</div>
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 bg-white rounded-2xl p-5 text-[#0E2F6E] flex flex-col justify-between">
          <div>
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-xs text-gray-400">Mulai dari</div>
                <div className="text-2xl font-black">Rp {(hargaTermurahProgram(p)/1000000).toFixed(0)} jt</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">DP</div>
                <div className="text-sm font-bold text-[#C9952A]">Rp {(p.dp/1000000).toFixed(0)} jt</div>
              </div>
            </div>
            <div className="text-xs text-gray-500 mb-1.5">🪑 {sisaSeat} seat tersisa</div>
            <div className="h-1.5 bg-[#e0e8f0] rounded-full overflow-hidden mb-4">
              <div className="h-full bg-[#C9952A] rounded-full" style={{width:`${Math.round(p.used_seat/p.total_seat*100)}%`}}></div>
            </div>
          </div>
          <TombolAksi p={p} user={user} router={router} isPendingNewChoice={isPendingNewChoice}
            targetSuspended={targetSuspended} eksklusifBukanTarget={eksklusifBukanTarget} />
        </div>
      </div>
    </div>
  );
}

// Carousel full-width buat program eksklusif (ala carousel Bootstrap,
// dikonfirmasi user 2026-09-30) — tanpa library: scroll-snap native jadi
// bisa digeser jari di HP, plus tombol ‹ › & titik indikator. Kontrol cuma
// muncul kalau slide-nya lebih dari satu.
function CarouselEksklusif({ children }) {
  const trackRef = useRef(null);
  const [aktif, setAktif] = useState(0);
  const jumlah = children.length;

  function geserKe(i) {
    const el = trackRef.current;
    if (!el) return;
    const tujuan = (i + jumlah) % jumlah;
    el.scrollTo({ left: tujuan * el.clientWidth, behavior: 'smooth' });
  }

  function onScroll() {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    setAktif(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="relative">
      <div ref={trackRef} onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children.map((c, i) => (
          <div key={i} className="w-full shrink-0 snap-center px-0.5 py-1">{c}</div>
        ))}
      </div>
      {jumlah > 1 && (
        <>
          <button onClick={() => geserKe(aktif - 1)} aria-label="Program sebelumnya"
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/90 text-[#0E2F6E] text-2xl font-bold shadow-lg hover:bg-white">‹</button>
          <button onClick={() => geserKe(aktif + 1)} aria-label="Program berikutnya"
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/90 text-[#0E2F6E] text-2xl font-bold shadow-lg hover:bg-white">›</button>
          <div className="flex justify-center gap-2 mt-3">
            {children.map((_, i) => (
              <button key={i} onClick={() => geserKe(i)} aria-label={`Ke program ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === aktif ? 'w-6 bg-[#C9952A]' : 'w-2 bg-gray-300'}`} />
            ))}
          </div>
        </>
      )}
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
              {s.key === 'sahabat_baitullah' ? (
                <CarouselEksklusif>
                  {isi.map(p => (
                    <KartuEksklusif key={p.id} p={p} user={user} router={router}
                      isTarget={p.id === targetProgramId}
                      isPendingNewChoice={!!targetGantiProgramId && p.id === targetGantiProgramId}
                      targetSuspended={p.id === targetProgramId && !!targetGantiProgramId}
                      eksklusifBukanTarget={!!targetProgramId && p.id !== targetProgramId} />
                  ))}
                </CarouselEksklusif>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {isi.map(p => (
                    <KartuProgram key={p.id} p={p} user={user} router={router} />
                  ))}
                </div>
              )}
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