'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hargaTermurahProgram } from '@/lib/harga';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink, waDisplay } from '@/lib/usePengaturan';
import { useMetodePembayaran } from '@/lib/useMetodePembayaran';
import { useLandingTeks } from '@/lib/useLandingTeks';
import Slideshow from '@/app/components/Slideshow';

interface Program {
  id: string;
  type: string;
  durasi: number;
  name: string;
  highlight?: string;
  tanggal?: string;
  total_seat: number;
  used_seat: number;
  dp: number;
}

interface GaleriBatch {
  judul: string;
  tanggal: string | null;
  foto: string[];
}

interface Promo {
  id: number;
  judul: string;
  deskripsi: string | null;
  flyer_path: string | null;
  kode_voucher: string | null;
  link: string | null;
  link_label: string | null;
}

interface MetodePembayaran {
  id: number;
  nama: string;
  nomor: string | null;
  atas_nama: string | null;
  catatan: string | null;
  gambar_qr: string | null;
}

interface AlurLangkah {
  id: number;
  judul: string;
  deskripsi: string;
  icon: string | null;
}

interface SkemaPembayaran {
  id: number;
  judul: string;
  deskripsi: string;
  pesan_wa: string | null;
}

interface KenapaCard {
  id: number;
  judul: string;
  icon: string | null;
  deskripsi: string | null;
  gambar: string | null;
}

interface FasilitasItem {
  id: number;
  teks: string;
  icon: string | null;
}

interface PerlengkapanJamaah {
  id: number;
  nama: string;
  deskripsi: string | null;
  gambar: string | null;
}

interface KalkulatorTemplateCard {
  id: string;
  nama: string;
  deskripsi?: string | null;
  gambar?: string | null;
  gambar_posisi_y?: number;
}

interface KalkulatorBaselineCard {
  id: string;
  jenis_program: string;
  label: string;
}

interface BeritaPost {
  id: number;
  judul: string;
  deskripsi: string | null;
  tanggal: string | null;
  status: 'akan_datang' | 'sudah_berlangsung';
  foto: string[];
}

// Logo asli (bukan emoji) — path SVG standar simple-icons, monokrom putih
// biar konsisten sama tema section Kontak yang gelap.
function IconInstagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793 0 1.44.645 1.44 1.439z" />
    </svg>
  );
}
function IconTikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" />
    </svg>
  );
}
function IconFacebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.239.386-.348.933-.348 1.653v1.396h3.919l-.386 1.798-.287 1.869h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.628-5.373-12-12-12s-12 5.372-12 12c0 5.616 3.874 10.328 9.101 11.647Z" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [modal, setModal] = useState<null | 'perwakilan'>(null);
  const [galeriBatches, setGaleriBatches] = useState<GaleriBatch[]>([]);
  const [beritaPosts, setBeritaPosts] = useState<BeritaPost[]>([]);
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [beritaOpen, setBeritaOpen] = useState<BeritaPost | null>(null);
  const [perlengkapanModalOpen, setPerlengkapanModalOpen] = useState(false);
  const [skemaModalOpen, setSkemaModalOpen] = useState(false);
  const [kenapaCards, setKenapaCards] = useState<KenapaCard[]>([]);
  const [kenapaOpen, setKenapaOpen] = useState<KenapaCard | null>(null);
  const [fasilitasAllIn, setFasilitasAllIn] = useState<FasilitasItem[]>([]);
  const snapwidgetId = process.env.NEXT_PUBLIC_SNAPWIDGET_ID;
  const [pengaturan] = usePengaturan();
  const [metodePembayaran] = useMetodePembayaran() as [MetodePembayaran[], boolean];
  const [alurPendaftaran, setAlurPendaftaran] = useState<AlurLangkah[]>([]);
  const [skemaPembayaran, setSkemaPembayaran] = useState<SkemaPembayaran[]>([]);
  const [perlengkapan, setPerlengkapan] = useState<PerlengkapanJamaah[]>([]);
  const [kalkulatorTemplate, setKalkulatorTemplate] = useState<KalkulatorTemplateCard[]>([]);
  const [kalkulatorBaseline, setKalkulatorBaseline] = useState<KalkulatorBaselineCard[]>([]);
  const [mounted, setMounted] = useState(false);
  const [teks] = useLandingTeks();
  // Field "1 baris = 1 item" (lihat migration-landing-teks.sql) — parse
  // jadi array, buang baris kosong.
  const parseBaris = (s: string | undefined) => (s || '').split('\n').map(x => x.trim()).filter(Boolean);
  // Digabung dari semua batch (bukan per-batch grid lagi) buat 1 slideshow
  // yang geser kanan-kiri, disandingkan sama kolom Instagram.
  const semuaFotoKeberangkatan = galeriBatches.flatMap(b => b.foto);
  // Kelompokkan perlengkapan berdasarkan foto yang sama (mis. koper+tag+ransel
  // 1 foto, slayer+paspor+idcard foto lain) — biar modal-nya nampilin tiap
  // foto sekali aja diikuti daftar item yang ada di foto itu, bukan
  // ngulang-ngulang foto yang sama per item.
  const perlengkapanGroups = perlengkapan.reduce<{ gambar: string | null; items: PerlengkapanJamaah[] }[]>((groups, p) => {
    const existing = groups.find(g => g.gambar === p.gambar);
    if (existing) existing.items.push(p);
    else groups.push({ gambar: p.gambar, items: [p] });
    return groups;
  }, []);

  useEffect(() => {
    setMounted(true);
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => setPrograms(d.programs || []));
    fetch('/api/galeri')
      .then(r => r.json())
      .then(d => setGaleriBatches(d.batches || []));
    fetch('/api/berita')
      .then(r => r.json())
      .then(d => setBeritaPosts(d.rows || []));
    fetch('/api/kenapa-jm-travel')
      .then(r => r.json())
      .then(d => setKenapaCards(d.kenapa || []));
    fetch('/api/fasilitas-all-in')
      .then(r => r.json())
      .then(d => setFasilitasAllIn(d.fasilitas || []));
    fetch('/api/alur-pendaftaran')
      .then(r => r.json())
      .then(d => setAlurPendaftaran(d.alur || []));
    fetch('/api/skema-pembayaran')
      .then(r => r.json())
      .then(d => setSkemaPembayaran(d.skema || []));
    fetch('/api/perlengkapan-jamaah')
      .then(r => r.json())
      .then(d => setPerlengkapan(d.perlengkapan || []));
    fetch('/api/kalkulator-publik/template')
      .then(r => r.json())
      .then(d => { setKalkulatorTemplate(d.template || []); setKalkulatorBaseline(d.baseline || []); });
    fetch('/api/promo')
      .then(r => r.json())
      .then(d => {
        if (!d.promo) return;
        setPromo(d.promo);
        // Dismiss diinget per-ID promo (bukan permanen selamanya) — promo
        // BARU otomatis muncul lagi walau yang lama sempat di-close.
        try {
          const dismissedId = localStorage.getItem('promo_dismissed_id');
          if (dismissedId === String(d.promo.id)) return;
        } catch {}
        // Auto-popup kayak iklan, dikasih jeda dikit biar gak "nge-jump"
        // pas halaman baru aja kebuka.
        setTimeout(() => setPromoModalOpen(true), 1000);
      });
  }, []);

  function dismissPromo() {
    setPromoModalOpen(false);
    try { if (promo) localStorage.setItem('promo_dismissed_id', String(promo.id)); } catch {}
  }

  function copyKodeVoucher() {
    if (!promo?.kode_voucher) return;
    navigator.clipboard.writeText(promo.kode_voucher).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  function getDashPath(role: string) {
    if (role === 'admin' || role === 'super_admin') return '/admin';
    if (role === 'sahabat_baitullah') return '/dashboard/sahabat';
    return `/dashboard/${role}`;
  }

  return (
    <div className="min-h-screen bg-[#eef1f8] font-sans">

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 bg-[#0E2F6E] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/jm-travel-icon.png" alt="JM Travel" className="w-8 h-8 object-contain" />
            <div>
              <div className="font-bold text-sm leading-tight">JM Travel</div>
              <div className="text-[10px] opacity-70">Umroh & Haji</div>
            </div>
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6 text-sm">
            <a href="#fasilitas" className="opacity-80 hover:opacity-100 transition-opacity">Fasilitas</a>
            <a href="#programs" className="opacity-80 hover:opacity-100 transition-opacity">Program</a>
            <a href="#kemitraan" className="opacity-80 hover:opacity-100 transition-opacity">Kemitraan</a>
            <a href="#dokumentasi" className="opacity-80 hover:opacity-100 transition-opacity">Dokumentasi</a>
            <a href="#kontak" className="opacity-80 hover:opacity-100 transition-opacity">Kontak</a>
          </div>

        <div className="flex items-center gap-2 min-h-[32px]">
          {mounted ? (
            user ? (
              <>
                <span className="hidden md:block text-xs opacity-80 bg-white/15 px-3 py-1 rounded-full">
                  👤 {user.name.split(' ')[0]}
                </span>
                <button
                  onClick={() => router.push(getDashPath(user.role))}
                  className="bg-[#C9952A] text-white text-xs font-bold px-4 py-1.5 rounded-full hover:bg-yellow-600 transition-colors">
                  Dashboard →
                </button>
              </>
            ) : (
              <>
                <button onClick={() => router.push('/login')}
                  className="text-white/85 border border-white/30 text-xs font-semibold px-4 py-1.5 rounded-full hover:bg-white/10 transition-colors">
                  Masuk
                </button>
                <button onClick={() => router.push('/register')}
                  className="bg-[#C9952A] text-white text-xs font-bold px-4 py-1.5 rounded-full hover:bg-yellow-600 transition-colors">
                  Daftar
                </button>
              </>
            )
          ) : (
            <div className="w-28 h-7" />
          )}
        </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#0E2F6E] via-[#1A4FA0] to-[#2060C0] text-white py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-block bg-white/15 border border-white/30 rounded-full px-4 py-1 text-xs mb-4">
            {teks.hero_badge || '✨ Perjalanan Ibadah Eksklusif'}
          </div>
          <h1 className="text-3xl md:text-5xl font-black leading-tight mb-4">
            {parseBaris(teks.hero_headline || 'Raih Panggilan Allah\nbersama JM Travel').map((line, i, arr) => (
              <span key={i} className={i === arr.length - 1 ? 'text-[#C9952A]' : ''}>
                {line}{i < arr.length - 1 && <br />}
              </span>
            ))}
          </h1>
          <p className="text-sm md:text-base opacity-85 mb-8 italic">
            &quot;{teks.hero_tagline || 'Melayani dengan Kedekatan, Membimbing dengan Ketulusan.'}&quot;
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => document.getElementById('programs')?.scrollIntoView({behavior:'smooth'})}
              className="bg-[#C9952A] text-white font-bold px-6 py-3 rounded-full hover:bg-yellow-600 transition-colors">
              🕌 Lihat Program Umroh
            </button>
            <button onClick={() => window.open(waLink(pengaturan.wa_kantor, 'Assalamu\'alaikum JM Travel, saya ingin konsultasi program umroh/haji.') || '#', '_blank')}
              className="bg-white/15 border border-white/40 text-white font-semibold px-6 py-3 rounded-full hover:bg-white/25 transition-colors">
              💬 Konsultasi Gratis
            </button>
          </div>
        </div>
      </section>

      {/* KENAPA JM TRAVEL — card bisa diklik, buka modal foto+deskripsi */}
      <section className="bg-[#F8F9FD] py-12 px-4" id="fasilitas">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">{teks.kenapa_eyebrow || 'Kenapa JM Travel?'}</div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E] mb-8">{teks.kenapa_headline || 'Dipercaya untuk Perjalanan Paling Mulia'}</h2>
          {kenapaCards.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {kenapaCards.map(k => (
                <button key={k.id} onClick={() => setKenapaOpen(k)}
                  className="bg-white rounded-xl p-5 border border-[#e0e8f0] hover:shadow-md hover:border-[#1A4FA0] transition-all text-center">
                  <div className="text-3xl mb-2">{k.icon}</div>
                  <div className="text-sm font-bold text-[#0E2F6E]">{k.judul}</div>
                </button>
              ))}
            </div>
          )}

          {fasilitasAllIn.length > 0 && (
            <>
              <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-4">Fasilitas All-In</div>
              <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                {fasilitasAllIn.map(f => (
                  <div key={f.id} className="bg-[#E8F0FB] text-[#0E2F6E] text-sm font-semibold py-2 px-4 rounded-full whitespace-nowrap">{f.icon} {f.teks}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ALUR PENDAFTARAN */}
      {alurPendaftaran.length > 0 && (
        <section className="py-12 px-4" id="alur-pendaftaran">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">{teks.alur_eyebrow || 'Gambaran Prosesnya'}</div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E]">{teks.alur_headline || '🚀 Alur Pendaftaran'}</h2>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-4">
              {alurPendaftaran.map((a, i) => (
                <div key={a.id} className="relative bg-white rounded-2xl p-5 border border-[#e0e8f0] text-center">
                  <div className="w-9 h-9 rounded-full bg-[#0E2F6E] text-white text-xs font-bold flex items-center justify-center mx-auto mb-2">{i + 1}</div>
                  <div className="text-3xl mb-2">{a.icon}</div>
                  <div className="font-bold text-[#0E2F6E] text-sm mb-1">{a.judul}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{a.deskripsi}</div>
                  {i === 1 && skemaPembayaran.length > 0 && (
                    <button onClick={() => setSkemaModalOpen(true)}
                      className="text-[10px] font-bold text-[#1A4FA0] hover:underline mt-2">
                      Lihat opsi pembayaran →
                    </button>
                  )}
                  {i === 2 && perlengkapan.length > 0 && (
                    <button onClick={() => setPerlengkapanModalOpen(true)}
                      className="text-[10px] font-bold text-[#1A4FA0] hover:underline mt-2">
                      Lihat detail perlengkapan →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* PROGRAM */}
      <section className="py-12 px-4" id="programs">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">{teks.program_eyebrow || 'Program Pilihan'}</div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E]">{teks.program_headline || 'Program Umroh JM Travel 🕋'}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programs.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-[#e0e8f0] overflow-hidden hover:shadow-xl transition-all group">
                <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] p-5 text-white">
                  <div className="text-xs opacity-75 mb-1">{p.type} · {p.durasi} Hari</div>
                  <div className="text-lg font-bold mb-1">{p.name}</div>
                  <div className="text-xs opacity-85">{p.highlight}</div>
                </div>
                <div className="p-5">
                  <div className="flex justify-between items-end mb-4">
                    <div className="text-xs text-gray-500 leading-6">
                      📅 {p.tanggal}<br/>
                      🪑 {p.total_seat - p.used_seat} seat tersisa
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400">Mulai dari</div>
                      <div className="text-xl font-black text-[#0E2F6E]">Rp {(hargaTermurahProgram(p)/1000000).toFixed(0)} jt</div>
                      <div className="text-xs text-gray-400">DP Rp {(p.dp/1000000).toFixed(0)} jt</div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-[#e0e8f0] rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-[#1A4FA0] rounded-full" style={{width:`${Math.round(p.used_seat/p.total_seat*100)}%`}}></div>
                  </div>
                  <button
                    onClick={() => router.push(`/program/${p.id}`)}
                    className="w-full bg-[#1A4FA0] text-white font-bold py-2.5 rounded-full hover:bg-[#0E2F6E] transition-colors group-hover:bg-[#C9952A]">
                    Lihat Lebih Detail →
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* UMROH SEMI PRIVATE / PRIVATE / FULL CUSTOMIZED — paket private/custom
          yang bisa dihitung sendiri estimasinya (dulu halaman terpisah
          /kalkulator, dipindah langsung ke landing 2026-08-16 biar nyambung
          sama section Program di atas, gak perlu pindah halaman). Tombol
          "Konsultasi Umroh Private" di section Program di atas nge-push ke
          /kalkulator/custom, sama kayak CTA "Full Customized" di bawah. */}
      <section className="py-12 px-4 bg-[#F8F9FD]" id="umroh-private">
        <div className="max-w-5xl mx-auto">
          {kalkulatorTemplate.length > 0 && (
            <div className="mb-12">
              <div className="text-center mb-8">
                <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">Program Tematik</div>
                <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E]">Umroh Private</h2>
                <p className="text-sm text-gray-500 max-w-xl mx-auto mt-2">Paket bertema buat kelompok kecil — isi tanggal &amp; add-on yang kamu mau, langsung dapat estimasi harganya.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {kalkulatorTemplate.map(t => (
                  <button key={t.id} onClick={() => router.push(`/kalkulator/${t.id}`)}
                    className="text-left bg-white rounded-2xl border border-[#e0e8f0] overflow-hidden hover:shadow-xl transition-all group">
                    {t.gambar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={t.gambar} alt={t.nama} className="w-full h-40 object-cover"
                        style={{ objectPosition: `50% ${t.gambar_posisi_y ?? 50}%` }} />
                    ) : (
                      <div className="w-full h-40 bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] flex items-center justify-center text-white text-4xl">🕋</div>
                    )}
                    <div className="p-5">
                      <div className="text-lg font-bold text-[#0E2F6E] mb-1">{t.nama}</div>
                      {t.deskripsi && <div className="text-xs text-gray-500 mb-3 line-clamp-3">{t.deskripsi}</div>}
                      <div className="text-sm font-bold text-[#1A4FA0] group-hover:underline">Hitung Estimasi →</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Umroh Private baseline (pilih jenis program) + CTA Full
              Customized digabung jadi 1 "unit" — 1 judul buat keduanya,
              alurnya: coba hitung dari jenis program dulu, kalau gak ada
              yang cocok baru ceritain kebutuhan lewat kotak biru di bawah
              (2026-08-16, dikoreksi dari versi sebelumnya yang misah 2 judul). */}
          <div>
            <div className="text-center mb-8">
              <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">Custom</div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E]">Full Customized Umroh Private</h2>
              <p className="text-sm text-gray-500 max-w-xl mx-auto mt-2">Gak nemu paket tematik yang pas di atas? Pilih jenis program-nya dulu buat estimasi cepat, atau langsung ceritain kebutuhanmu kalau maunya beda lagi.</p>
            </div>

            {kalkulatorBaseline.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {kalkulatorBaseline.map(b => (
                  <button key={b.id} onClick={() => router.push(`/kalkulator/${b.id}`)}
                    className="text-left bg-white rounded-xl border border-[#e0e8f0] p-4 hover:border-[#1A4FA0] hover:shadow-md transition-all">
                    <div className="font-bold text-[#0E2F6E] mb-1">{b.label}</div>
                    <div className="text-xs font-bold text-[#1A4FA0]">Hitung Estimasi →</div>
                  </button>
                ))}
              </div>
            )}

            {/* Ajakan Full Customized + info layanan lain — desain dipindah dari
                CTA "Tidak menemukan program..." yang dulu nempel di bawah
                section Program (open trip), sekarang cuma ada di sini biar
                gak dobel (2026-08-16). */}
            <div className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white rounded-2xl p-6 md:p-8">
              <div className="md:flex items-center justify-between gap-6">
                <div className="mb-4 md:mb-0">
                  <h3 className="font-bold text-lg mb-1">Gak ada yang cocok?</h3>
                  <p className="text-sm opacity-85">Ceritain aja maunya gimana — tim kami bantu susunkan itinerary &amp; quote harganya khusus buat kamu.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => router.push('/kalkulator/custom')}
                    className="bg-[#25D366] text-white font-bold px-6 py-3 rounded-full whitespace-nowrap hover:bg-green-600 transition-colors">
                    💬 Ajukan Custom Sendiri
                  </button>
                </div>
              </div>
              <div className="border-t border-white/20 mt-5 pt-5">
                <div className="text-xs opacity-75 mb-2">{teks.program_layanan_lain_label || 'Selain Umroh reguler, kami juga melayani:'}</div>
                <div className="flex flex-wrap gap-2">
                  {parseBaris(teks.program_layanan_lain_tags || '🕋 Haji Khusus\n🌍 Wisata Halal\n✈️ Umroh+ (kombinasi negara lain, tidak cuma UEA)').map(t => (
                    <span key={t} className="bg-white/15 text-xs font-semibold px-3 py-1.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KEMITRAAN */}
      <section className="bg-[#F8F9FD] py-12 px-4" id="kemitraan">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">{teks.kemitraan_eyebrow || 'Program Kemitraan'}</div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E] mb-3">{teks.kemitraan_headline || 'Ubah Niat Baik Jadi Penghasilan Berkah'}</h2>
          <p className="text-sm text-gray-500 max-w-xl mx-auto mb-8">
            {teks.kemitraan_subtext || 'Ajak orang ke Baitullah, dapat ujroh tiap closing, dan tabung untuk umrohmu sendiri. Ratusan perwakilan sudah memulai — sekarang giliranmu.'}
          </p>
          <div className="grid grid-cols-1 gap-6 max-w-sm mx-auto">
            {[
              {key:'perwakilan' as const, icon:'🏢', title: teks.kemitraan_perwakilan_judul || 'Perwakilan Resmi', hook: teks.kemitraan_perwakilan_hook || 'Punya jaringan sendiri? Tentukan harga, ambil selisih, bangun brand-mu.', items: parseBaris(teks.kemitraan_perwakilan_items).length > 0 ? parseBaris(teks.kemitraan_perwakilan_items) : ['Tentukan harga sendiri','Ujroh = selisih HPP','Branding resmi','Dashboard closing','ID Card resmi Perwakilan JM Travel'], color:'bg-[#C9952A]'},
            ].map(k => (
              <div key={k.title} className="bg-white rounded-2xl border border-[#e0e8f0] p-6 hover:shadow-lg transition-all text-left flex flex-col">
                <div className="text-3xl mb-3">{k.icon}</div>
                <h3 className="text-lg font-bold text-[#0E2F6E] mb-2">{k.title}</h3>
                <p className="text-sm text-gray-500 mb-4 italic">&quot;{k.hook}&quot;</p>
                <ul className="text-sm text-gray-500 space-y-1 mb-5">
                  {k.items.map(i => <li key={i}>✔ {i}</li>)}
                </ul>
                <button onClick={() => setModal(k.key)}
                  className={`w-full mt-auto ${k.color} text-white font-bold py-2.5 rounded-full hover:opacity-90 transition-opacity`}>
                  Lihat Lebih Detail →
                </button>
              </div>
            ))}
          </div>

          {/* Berita & Kegiatan — feed kronologis (bukan grid foto polos),
              isinya bisa recap kegiatan LAMA atau pengumuman event AKAN
              DATANG (status dihitung dari tanggal, lihat /api/berita).
              Sumbernya /admin/berita. Sengaja gak ditampilin sama sekali
              kalau kosong (bukan konten wajib kayak Dokumentasi). */}
          {beritaPosts.length > 0 && (
            <div className="mt-14 text-left">
              <h3 className="text-lg font-bold text-[#0E2F6E] mb-1 text-center md:text-left">📰 Berita &amp; Kegiatan</h3>
              <p className="text-sm text-gray-500 mb-6 text-center md:text-left">Pelatihan, booth, dan event bareng perwakilan — yang sudah maupun akan datang.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {beritaPosts.map(b => (
                  <button key={b.id} onClick={() => setBeritaOpen(b)}
                    className="text-left bg-white rounded-xl border border-[#e0e8f0] overflow-hidden hover:shadow-lg transition-all group">
                    {b.foto.length > 0 && (
                      <div className="relative aspect-video bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.foto[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        {b.foto.length > 1 && (
                          <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            +{b.foto.length - 1} foto
                          </span>
                        )}
                      </div>
                    )}
                    <div className="p-3.5">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${b.status === 'akan_datang' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {b.status === 'akan_datang' ? '🔜 Akan Datang' : '✅ Sudah Berlangsung'}
                        </span>
                        {b.tanggal && (
                          <span className="text-[10px] text-gray-400">
                            {new Date(b.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-[#0E2F6E] mb-1">{b.judul}</div>
                      {b.deskripsi && <p className="text-xs text-gray-500 line-clamp-2">{b.deskripsi}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* DOKUMENTASI — Instagram (kiri) disandingkan sama slideshow galeri
          keberangkatan (kanan), 2 kolom seimbang biar gak "menclok" sendirian
          di tengah kayak sebelumnya. Sumbernya diurus admin lewat /admin/galeri. */}
      <section className="py-12 px-4" id="dokumentasi">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">{teks.dokumentasi_eyebrow || 'Dokumentasi'}</div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E]">{teks.dokumentasi_headline || 'Momen Keberangkatan & Konten Kami'}</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* KIRI — Instagram: live feed via SnapWidget (murni <iframe>,
                browser isolasi otomatis dari halaman kita), fallback ke
                placeholder kalau ID-nya belum diisi. */}
            <div>
              <h3 className="font-bold text-[#0E2F6E] mb-3 text-center md:text-left">📷 Instagram</h3>
              {snapwidgetId ? (
                <iframe
                  src={`https://snapwidget.com/embed/${snapwidgetId}`}
                  title="Instagram @jm.tourtravel"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  scrolling="no"
                  style={{ border: 'none', overflow: 'hidden', width: '100%', aspectRatio: '1 / 1' }}
                  className="rounded-xl" />
              ) : (
                <div className="bg-[#F8F9FD] rounded-xl aspect-square flex items-center justify-center text-gray-400 text-sm p-6 text-center">
                  📷 Konten Instagram akan segera hadir di sini.
                </div>
              )}
              {pengaturan.ig_url && (
                <a href={pengaturan.ig_url} target="_blank" rel="noopener noreferrer"
                  className="block mt-2 text-sm font-semibold text-[#d62976] hover:underline text-center md:text-left">
                  @jm.tourtravel
                </a>
              )}
            </div>

            {/* KANAN — semua foto keberangkatan digabung jadi 1 slideshow
                (bukan grid per-batch kayak sebelumnya), biar seimbang sama
                kolom kiri & geser kanan-kiri aja sesuai permintaan. */}
            <div>
              <h3 className="font-bold text-[#0E2F6E] mb-3 text-center md:text-left">🕋 Dokumentasi Keberangkatan</h3>
              {semuaFotoKeberangkatan.length > 0 ? (
                <Slideshow images={semuaFotoKeberangkatan} aspect="aspect-square" />
              ) : (
                <div className="bg-[#F8F9FD] rounded-xl aspect-square flex items-center justify-center text-gray-400 text-sm p-6 text-center">
                  🕋 Dokumentasi keberangkatan akan segera hadir di sini.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PROMO — reminder promo yang lagi aktif buat yang udah nutup popup-nya
          (lihat popup auto-open di atas). Sumber datanya sama (satu promo
          aktif terbaru dari /api/promo), bukan daftar/arsip promo. */}
      {promo && (
        <section className="bg-[#FFF8E7] py-12 px-4" id="promo">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <div className="text-xs font-bold tracking-widest text-[#C9952A] uppercase mb-2">Promo</div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#0E2F6E]">Jangan Sampai Kelewatan</h2>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-[#f0e2bd] overflow-hidden md:flex md:items-center">
              {promo.flyer_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={promo.flyer_path} alt={promo.judul} className="w-full md:w-56 md:h-56 object-cover shrink-0" />
              )}
              <div className="p-6 text-center md:text-left">
                <h3 className="text-xl font-bold text-[#0E2F6E] mb-2">📣 {promo.judul}</h3>
                {promo.deskripsi && (
                  <p className="text-sm text-gray-600 whitespace-pre-line mb-4">{promo.deskripsi}</p>
                )}
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  {promo.kode_voucher && (
                    <button onClick={copyKodeVoucher}
                      className="flex items-center gap-2 bg-[#E8F0FB] border-2 border-dashed border-[#1A4FA0] rounded-xl px-4 py-2 hover:bg-[#dbe8f9] transition-colors">
                      <span className="font-black text-[#0E2F6E] tracking-widest">{promo.kode_voucher}</span>
                      <span className="text-xs font-bold text-[#1A4FA0] whitespace-nowrap">{codeCopied ? '✅ Disalin!' : '📋 Copy'}</span>
                    </button>
                  )}
                  {promo.link && (
                    <a href={promo.link} target={promo.link.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                      className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold px-6 py-2 rounded-full transition-colors">
                      {promo.link_label || 'Lihat Selengkapnya'} →
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA + KONTAK */}
      <section className="bg-gradient-to-r from-[#0E2F6E] to-[#1A4FA0] text-white py-14 px-4 text-center" id="kontak">
        <div className="max-w-2xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/jm-travel-icon.png" alt="JM Travel" className="w-14 h-14 object-contain mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold mb-3">{teks.kontak_headline || 'Siap Menjawab Panggilan-Nya?'}</h2>
          <p className="opacity-85 mb-6 text-sm">{teks.kontak_subtext || 'Tim kami siap bantu dari konsultasi program sampai keberangkatan — tanpa basa-basi.'}</p>
          <button onClick={() => window.open(waLink(pengaturan.wa_kantor, 'Assalamu\'alaikum JM Travel, saya ingin bertanya.') || '#', '_blank')}
            className="bg-[#25D366] text-white font-bold px-8 py-3 rounded-full hover:bg-green-600 transition-colors mb-4">
            📲 WhatsApp: {waDisplay(pengaturan.wa_kantor)}
          </button>
          {metodePembayaran.length > 0 && (
            <div className="bg-white/10 border border-white/25 rounded-xl p-4 inline-block text-sm mb-6 text-left">
              <div className="text-center font-bold mb-1">⚠️ Pembayaran hanya via:</div>
              {metodePembayaran.map(m => (
                <div key={m.id} className="mt-1">
                  <strong>{m.nama}{m.nomor ? ` — ${m.nomor}` : ''}</strong>{m.atas_nama ? ` a.n. ${m.atas_nama}` : ''}
                </div>
              ))}
            </div>
          )}
          {skemaPembayaran.length > 0 && (
            <div className="mb-6">
              <div className="text-xs font-bold tracking-widest text-white/60 uppercase mb-3">Partner &amp; Pembiayaan Resmi</div>
              <div className="flex justify-center gap-3 flex-wrap">
                <div className="bg-white/15 rounded-full px-6 py-2.5 font-bold text-white text-sm">BSI</div>
                <div className="bg-white/15 rounded-full px-6 py-2.5 font-bold text-white text-sm">AMITRA Syariah</div>
              </div>
            </div>
          )}
          <div className="flex justify-center gap-3">
            {[
              { label: 'Instagram', Icon: IconInstagram, href: pengaturan.ig_url },
              { label: 'TikTok', Icon: IconTikTok, href: pengaturan.tiktok_url },
              { label: 'Facebook', Icon: IconFacebook, href: pengaturan.fb_url },
            ].filter(s => s.href).map(s => (
              <button key={s.label} onClick={() => window.open(s.href, '_blank')}
                title={s.label}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                <s.Icon className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0E2F6E] text-white/60 text-center py-5 text-xs">
        {teks.footer_copyright || 'JM Travel Umroh & Haji — © 2025 PT. Alkhalid Jaya Megah Tours & Travel'}
      </footer>

      {/* MODAL KEMITRAAN */}
      {modal && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
             onClick={() => setModal(null)}>
          <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            {/* Header modal */}
            <div className="bg-[#C9952A] text-white p-5 rounded-t-2xl sticky top-0">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-3xl mb-1">🏢</div>
                  <h3 className="text-xl font-bold">
                    Perwakilan Resmi
                  </h3>
                </div>
                <button onClick={() => setModal(null)} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
              </div>
            </div>

            {/* Isi modal — placeholder, dirapikan nanti */}
            <div className="p-5 space-y-4">
              <div>
                <div className="font-bold text-[#0E2F6E] mb-1 text-sm">💡 Cara Kerja Perwakilan</div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-line">
                  {teks.kemitraan_modal_perwakilan_carakerja || 'Kamu dapat harga HPP dari JM Travel, lalu menentukan harga jualmu sendiri. Selisihnya (margin) jadi milikmu.'}
                  <div className="text-[11px] text-gray-400 mt-1">*Skema mengikuti perjanjian perwakilan.</div>
                </div>
              </div>
              <div>
                <div className="font-bold text-[#0E2F6E] mb-1 text-sm">🎁 Benefit Jadi Perwakilan</div>
                <ul className="text-sm text-gray-600 space-y-1">
                  {(parseBaris(teks.kemitraan_modal_perwakilan_benefit).length > 0 ? parseBaris(teks.kemitraan_modal_perwakilan_benefit) : ['Tentukan harga jual sendiri','Ujroh = selisih dari HPP','Branding resmi di bawah JM Travel','Dashboard closing & laporan sendiri','Difasilitasi ID Card resmi Perwakilan JM Travel']).map(item => (
                    <li key={item}>✔ {item}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-[#FFF8E8] border border-[#E9CC8A] rounded-lg p-3">
                <div className="font-bold text-[#8a6300] mb-1 text-sm">📋 Syarat Menjadi Perwakilan</div>
                <ul className="text-sm text-[#6b4f10] space-y-1">
                  <li>✔ Sudah pernah umroh bersama JM Travel, <i>atau</i></li>
                  <li>✔ Punya kode referral dari Perwakilan JM Travel yang sudah aktif, <i>atau</i></li>
                  <li>✔ Didaftarkan langsung oleh manajemen JM Travel</li>
                </ul>
                <div className="text-[11px] text-[#8a6300]/80 mt-1.5">Belum memenuhi salah satu di atas? Hubungi kami langsung untuk info lebih lanjut.</div>
              </div>
              <div className="text-xs text-gray-400">Detail lengkap & ketentuan akan dijelaskan saat pendaftaran.</div>
            </div>

            {/* CTA modal */}
            <div className="p-5 pt-0 sticky bottom-0 bg-white">
              {/* Belum login -> /register (bikin akun baru, role dikirim
                  lewat query biar gak disuruh milih ulang, lihat
                  register/page.jsx). Udah login sbg jamaah -> /upgrade-perwakilan
                  (upgrade akun yang sama, BUKAN bikin akun baru — NIK/email/WA
                  udah kepakai, /register bakal selalu gagal buat user yang
                  udah login). Udah jadi perwakilan/admin -> kasih tau, gak
                  usah daftar lagi. */}
              <button onClick={() => {
                  if (!user) { router.push(`/register?role=${modal}`); return; }
                  if (user.role === 'jamaah') { router.push('/upgrade-perwakilan'); return; }
                  alert(`Akun Anda sudah terdaftar sebagai ${user.role}. Tidak perlu daftar lagi.`);
                }}
                className="w-full bg-[#C9952A] text-white font-bold py-3 rounded-full hover:opacity-90 transition-opacity">
                Daftar Menjadi Perwakilan Sekarang Juga!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL BERITA & KEGIATAN — deskripsi lengkap + slideshow foto (kalau ada) */}
      {beritaOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setBeritaOpen(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${beritaOpen.status === 'akan_datang' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                  {beritaOpen.status === 'akan_datang' ? '🔜 Akan Datang' : '✅ Sudah Berlangsung'}
                </span>
                <h3 className="font-bold text-[#0E2F6E] mt-1.5">{beritaOpen.judul}</h3>
                {beritaOpen.tanggal && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(beritaOpen.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                )}
              </div>
              <button onClick={() => setBeritaOpen(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
            </div>
            {beritaOpen.foto.length > 0 && <Slideshow images={beritaOpen.foto} aspect="aspect-video" />}
            {beritaOpen.deskripsi && (
              <p className="text-sm text-gray-600 whitespace-pre-line mt-3">{beritaOpen.deskripsi}</p>
            )}
          </div>
        </div>
      )}

      {/* DETAIL KENAPA JM TRAVEL */}
      {kenapaOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setKenapaOpen(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {kenapaOpen.gambar && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={kenapaOpen.gambar} alt={kenapaOpen.judul} className="w-full rounded-t-2xl" />
            )}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-bold text-[#0E2F6E]">{kenapaOpen.icon} {kenapaOpen.judul}</h3>
                <button onClick={() => setKenapaOpen(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
              </div>
              {kenapaOpen.deskripsi && (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{kenapaOpen.deskripsi}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DETAIL SKEMA PEMBAYARAN */}
      {skemaModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setSkemaModalOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 pb-3">
              <div>
                <h3 className="font-bold text-[#0E2F6E]">💰 Skema Pembayaran</h3>
                <p className="text-xs text-gray-400 mt-0.5">Pilih cara yang paling sesuai buat Anda</p>
              </div>
              <button onClick={() => setSkemaModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
            </div>
            <div className="px-5 pb-5 space-y-3">
              {skemaPembayaran.map(s => (
                <div key={s.id} className="bg-[#F8F9FD] rounded-2xl p-4">
                  <h4 className="font-bold text-[#0E2F6E] text-sm mb-1.5">{s.judul}</h4>
                  <p className="text-xs text-gray-600 leading-relaxed mb-2 whitespace-pre-line">{s.deskripsi}</p>
                  <button onClick={() => window.open(waLink(pengaturan.wa_kantor, s.pesan_wa || `Assalamu'alaikum JM Travel, saya ingin tanya soal ${s.judul}.`) || '#', '_blank')}
                    className="text-xs font-bold text-[#1A4FA0] hover:underline">
                    💬 Tanya via WhatsApp →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DETAIL PERLENGKAPAN JAMAAH — dikelompokkan per foto */}
      {perlengkapanModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setPerlengkapanModalOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 pb-0">
              <div>
                <h3 className="font-bold text-[#0E2F6E]">🎒 Perlengkapan Jamaah</h3>
                <p className="text-xs text-gray-400 mt-0.5">Dikirimkan setelah DP dikonfirmasi</p>
              </div>
              <button onClick={() => setPerlengkapanModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
            </div>

            {perlengkapan.length === 0 ? (
              <div className="text-center text-gray-400 py-6 text-sm">Belum ada daftar perlengkapan.</div>
            ) : (
              <div className="p-5 pt-3 space-y-4">
                {perlengkapanGroups.map((g, i) => (
                  <div key={i}>
                    {g.gambar && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={g.gambar} alt="" className="w-full rounded-xl mb-2" />
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map(p => (
                        <span key={p.id} title={p.deskripsi || ''} className="bg-[#E8F0FB] text-[#1A4FA0] text-xs font-semibold px-3 py-1.5 rounded-full">
                          ✅ {p.nama}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-5 pt-0">
              <button onClick={() => window.open(waLink(pengaturan.wa_kantor, 'Assalamu\'alaikum JM Travel, saya ingin tanya soal perlengkapan jamaah.') || '#', '_blank')}
                className="w-full bg-[#25D366] text-white font-bold py-2.5 rounded-full text-sm hover:bg-green-600 transition-colors">
                💬 Tanya via WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP PROMO — auto-muncul sendiri pas halaman load (ada jeda dikit,
          lihat useEffect di atas), kayak iklan. Dismiss diinget per-ID promo
          di localStorage (bukan permanen), jadi promo BARU tetap auto-popup
          lagi walau yang lama sempat di-close. */}
      {promoModalOpen && promo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={dismissPromo}>
          <div className="relative bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={dismissPromo} aria-label="Tutup"
              className="absolute -top-3 -right-3 z-10 w-8 h-8 flex items-center justify-center bg-white text-gray-600 hover:text-gray-900 rounded-full shadow-lg text-lg leading-none">
              ×
            </button>
            {promo.flyer_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={promo.flyer_path} alt={promo.judul} className="w-full rounded-t-2xl" />
            )}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-bold text-[#0E2F6E] text-lg">📣 {promo.judul}</h3>
              </div>
              {promo.deskripsi && (
                <p className="text-sm text-gray-600 whitespace-pre-line mb-4">{promo.deskripsi}</p>
              )}
              {promo.kode_voucher && (
                <button onClick={copyKodeVoucher}
                  className="w-full flex items-center justify-between gap-3 bg-[#E8F0FB] border-2 border-dashed border-[#1A4FA0] rounded-xl px-4 py-3 mb-4 hover:bg-[#dbe8f9] transition-colors">
                  <span className="font-black text-[#0E2F6E] tracking-widest text-lg">{promo.kode_voucher}</span>
                  <span className="text-xs font-bold text-[#1A4FA0] whitespace-nowrap">{codeCopied ? '✅ Disalin!' : '📋 Copy Kode'}</span>
                </button>
              )}
              {promo.link && (
                <a href={promo.link} target={promo.link.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                  className="block w-full text-center bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full transition-colors">
                  {promo.link_label || 'Lihat Selengkapnya'} →
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
