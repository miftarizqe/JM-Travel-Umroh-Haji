'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import WaitlistCTA from '@/app/components/WaitlistCTA';
import { tangkapRefPerwakilan } from '@/lib/referralCapture';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { renderPasalBlock } from '@/lib/pasalMarkup';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad', triple: 'Triple', double: 'Double' };
const PAKET_DESC = {
  deluxe: 'Hotel Bintang 3',
  eksekutif: 'Hotel Bintang 4',
  signature: 'Hotel Bintang 5',
};

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function labelHari(tglBerangkat, idx) {
  if (!tglBerangkat) return '';
  const base = new Date(String(tglBerangkat).slice(0, 10) + 'T00:00:00');
  if (isNaN(base.getTime())) return '';
  const d = new Date(base);
  d.setDate(d.getDate() + idx);
  return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// Pecah teks "1 baris = 1 item" jadi array, buang baris kosong
function toList(text) {
  if (!text) return [];
  return String(text).split('\n').map(s => s.trim()).filter(Boolean);
}

// Normalisasi itinerary dari DB (bisa string JSON / array / null)
function parseItinerary(it) {
  if (!it) return [];
  if (typeof it === 'string') { try { it = JSON.parse(it); } catch { return []; } }
  return Array.isArray(it) ? it : [];
}

export default function ProgramDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [user] = useCurrentUser();
  const [prog, setProg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Target Impian Sahabat Baitullah (dikonfirmasi user 2026-09-29/30) —
  // dipakai buat nentuin CTA di bawah: program target -> booking langsung,
  // program eksklusif LAIN -> ganti jadi "Ingin ikut program eksklusif
  // ini?" (ajukan ganti target, wajib ACC admin, bukan checkout langsung).
  // Alurnya SENGAJA dibikin gak gampang (dikonfirmasi user 2026-09-30,
  // "jgn dibuat semudah itu") — wajib baca S&K (scroll-gate, sama pola
  // /pks) dulu, baru konfirmasi eksplisit, baru kekirim.
  const [targetProgramId, setTargetProgramId] = useState(null);
  const [targetGantiProgramId, setTargetGantiProgramId] = useState(null); // null = gak ada pengajuan aktif
  const [targetGantiStatus, setTargetGantiStatus] = useState(null); // 'diajukan' | 'pembatalan_diajukan' | null
  const [submittingGanti, setSubmittingGanti] = useState(false);
  const [modalStep, setModalStep] = useState(null); // null | 'tnc' | 'konfirmasi'
  const [pasalTnc, setPasalTnc] = useState(null);
  const [sudahBacaTnc, setSudahBacaTnc] = useState(false);
  const [setujuTnc, setSetujuTnc] = useState(false);
  const scrollTncRef = useRef(null);

  // Tangkap ?ref=<kode_unik_perwakilan> kalau ada — link program sering jadi
  // titik masuk pertama yang dibagikan perwakilan (dikonfirmasi user
  // 2026-09-02), disimpan buat auto-fill "Sumber Informasi" di /checkout.
  useEffect(() => { tangkapRefPerwakilan(); }, []);

  useEffect(() => {
    if (!id) return;
    fetch('/api/programs')
      .then(r => r.json())
      .then(d => {
        const found = (d.programs || []).find(p => p.id === id);
        if (found) setProg(found);
        else setNotFound(true);
        setTargetProgramId(d.target_program_id || null);
        setTargetGantiProgramId(d.target_ganti_program_id || null);
        setTargetGantiStatus(d.target_ganti_status || null);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  function bukaModalGanti() {
    setModalStep('tnc');
    setSudahBacaTnc(false);
    setSetujuTnc(false);
    if (!pasalTnc) {
      fetch('/api/pasal?dokumen=ganti_target_sahabat').then(r => r.json())
        .then(d => setPasalTnc(d.pasal || []))
        .catch(() => setPasalTnc([]));
    }
  }

  function cekScrollTnc() {
    const el = scrollTncRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setSudahBacaTnc(true);
  }

  async function ajukanGantiTarget() {
    setSubmittingGanti(true);
    try {
      const res = await fetch('/api/sahabat/ganti-target', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program_id: id }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSubmittingGanti(false); return; }
      alert(d.message);
      setTargetGantiProgramId(id);
      setModalStep(null);
    } catch { alert('Terjadi kesalahan'); }
    setSubmittingGanti(false);
  }

  function handleBooking() {
    // Wajib login dulu. Kalau belum login -> ke login, lalu balik ke checkout program ini.
    let user = null;
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
    const tujuan = `/checkout?prog_id=${id}`;
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(tujuan)}`);
      return;
    }
    // Akun belum aktif (verifikasi admin / ACC perwakilan-sahabat) TETAP
    // boleh browsing & lihat detail program bebas (dikonfirmasi user
    // 2026-10-08) — gerbangnya baru ditutup PERSIS di titik klik tombol ini,
    // sebelum checkout dimulai, bukan lebih awal (nge-block browsing) atau
    // lebih telat (biarin isi form dulu baru gagal pas submit akhir —
    // server di cekPemesanBolehOrder nolak hal sama, ini cuma UX lebih awal).
    if (!user.terverifikasi) {
      alert('Akun Anda masih menunggu verifikasi admin. Anda belum bisa melakukan pendaftaran program.');
      return;
    }
    if (['perwakilan', 'sahabat_baitullah'].includes(user.role) && user.status !== 'active') {
      alert(`Akun ${user.role} Anda masih menunggu ACC admin. Anda belum bisa checkout sampai akun ini aktif.`);
      return;
    }
    router.push(tujuan);
  }

  if (loading) {
    return <Layout showBack><div className="flex items-center justify-center py-20 text-gray-400">Memuat program...</div></Layout>;
  }
  if (notFound || !prog) {
    return (
      <Layout showBack>
        <div className="max-w-lg mx-auto text-center py-20">
          <div className="text-5xl mb-3">🔍</div>
          <div className="font-bold text-[#0E2F6E] mb-1">Program tidak ditemukan</div>
          <div className="text-sm text-gray-400 mb-5">Program mungkin sudah tidak aktif atau tautannya salah.</div>
          <button onClick={() => router.push('/programs')}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-colors">
            Lihat Semua Program
          </button>
        </div>
      </Layout>
    );
  }

  const includeList = toList(prog.include_items);
  const excludeList = toList(prog.exclude_items);
  const itinerary = parseItinerary(prog.itinerary);
  const seatSisa = (prog.total_seat || 0) - (prog.used_seat || 0);

  // Cek apakah ada minimal 1 harga terisi untuk sebuah kombinasi
  const adaHarga = (paket, kamar) => Number(prog[`harga_${paket}_${kamar}`] || 0) > 0;

  // Sebagian program cuma beda harga per tipe kamar, TIDAK beda per level
  // paket (sama persis kayak deteksi "Hotel Mix/custom" di CartPaketKamar.jsx
  // buat checkout) — kalau gitu, 3 blok Deluxe/Eksekutif/Signature yang isinya
  // identik cuma bikin bingung. Tampilkan 1 blok harga per tipe kamar aja.
  const hargaSamaSemuaLevel = KAMAR.every(kamar => {
    const nilai = PAKET.map(paket => Number(prog[`harga_${paket}_${kamar}`] || 0));
    return nilai[0] > 0 && nilai.every(n => n === nilai[0]);
  });

  const isEksklusifSahabat = user?.role === 'sahabat_baitullah' && prog.publish_type === 'sahabat_baitullah';
  const isCurrentTarget = isEksklusifSahabat && prog.id === targetProgramId;
  const isPendingNewChoice = isEksklusifSahabat && !!targetGantiProgramId && prog.id === targetGantiProgramId;
  const hasPendingRequestElsewhere = isEksklusifSahabat && !!targetGantiProgramId && prog.id !== targetGantiProgramId;

  return (
    <Layout title={prog.name} showBack>
      <div className="max-w-3xl mx-auto">

        {/* HERO */}
        <div className="bg-gradient-to-br from-[#0E2F6E] to-[#2060C0] rounded-2xl p-6 text-white mb-4">
          <div className="text-xs opacity-75 mb-1">{prog.type} · {prog.durasi} Hari</div>
          <div className="text-2xl font-bold mb-1">{prog.name}</div>
          {prog.highlight && <div className="text-sm opacity-90 mb-3">{prog.highlight}</div>}
          <div className="flex flex-wrap gap-4 text-sm mt-3 pt-3 border-t border-white/20">
            <div><span className="opacity-70">Keberangkatan: </span><b>{prog.tanggal || '-'}</b></div>
            <div><span className="opacity-70">Seat tersisa: </span><b>{seatSisa} seat</b></div>
            <div><span className="opacity-70">DP: </span><b>{rp(prog.dp)}</b></div>
          </div>
        </div>

        {/* HARGA — 9 kombinasi */}
        <div className="bg-white rounded-2xl border border-[#e0e8f0] p-5 mb-4">
          <div className="font-bold text-[#0E2F6E] mb-3">💰 Pilihan Harga Paket</div>
          {hargaSamaSemuaLevel ? (
            <div className="grid grid-cols-3 gap-2">
              {KAMAR.map(kamar => {
                const harga = Number(prog[`harga_${PAKET[0]}_${kamar}`] || 0);
                return (
                  <div key={kamar} className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-gray-400 mb-1">{KAMAR_LABEL[kamar]}</div>
                    <div className="text-sm font-black text-[#C9952A]">
                      {harga > 0 ? rp(harga) : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="space-y-4">
            {PAKET.map(paket => {
              const adaSalahSatu = KAMAR.some(k => adaHarga(paket, k));
              if (!adaSalahSatu) return null;
              return (
                <div key={paket}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-bold text-[#0E2F6E] text-sm">Paket {PAKET_LABEL[paket]}</span>
                    <span className="text-[11px] text-gray-400">{PAKET_DESC[paket]}</span>
                  </div>
                  {(prog[`hotel_mekkah_${paket}`] || prog[`hotel_madinah_${paket}`]) && (
                    <div className="text-[11px] text-gray-500 mb-2">
                      🏨 {prog[`hotel_mekkah_${paket}`] && <>Mekkah: <b>{prog[`hotel_mekkah_${paket}`]}</b></>}
                      {prog[`hotel_mekkah_${paket}`] && prog[`hotel_madinah_${paket}`] && ' · '}
                      {prog[`hotel_madinah_${paket}`] && <>Madinah: <b>{prog[`hotel_madinah_${paket}`]}</b></>}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {KAMAR.map(kamar => {
                      const harga = Number(prog[`harga_${paket}_${kamar}`] || 0);
                      return (
                        <div key={kamar} className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-[11px] text-gray-400 mb-1">{KAMAR_LABEL[kamar]}</div>
                          <div className="text-sm font-black text-[#C9952A]">
                            {harga > 0 ? rp(harga) : '-'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* INCLUDE / EXCLUDE */}
        {(includeList.length > 0 || excludeList.length > 0) && (
          <div className="bg-white rounded-2xl border border-[#e0e8f0] p-5 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="font-bold text-green-700 text-sm mb-2">✅ Sudah Termasuk</div>
                {includeList.length > 0 ? (
                  <ul className="space-y-1.5">
                    {includeList.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-green-500 mt-0.5">✓</span><span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-xs text-gray-400">-</div>}
              </div>
              <div>
                <div className="font-bold text-red-600 text-sm mb-2">❌ Tidak Termasuk</div>
                {excludeList.length > 0 ? (
                  <ul className="space-y-1.5">
                    {excludeList.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-red-400 mt-0.5">✕</span><span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-xs text-gray-400">-</div>}
              </div>
            </div>
          </div>
        )}

        {/* ITINERARY */}
        {itinerary.some(Boolean) && (
          <div className="bg-white rounded-2xl border border-[#e0e8f0] p-5 mb-4">
            <div className="font-bold text-[#0E2F6E] mb-3">🗺️ Itinerary Perjalanan</div>
            <div className="border-l-2 border-[#1A4FA0] pl-4 space-y-4">
              {itinerary.map((keg, i) => {
                if (!keg) return null;
                const tglLabel = labelHari(prog.tanggal_berangkat, i);
                return (
                  <div key={i} className="relative">
                    <div className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-[#1A4FA0] border-2 border-white"></div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#0E2F6E]">Hari {i + 1}</span>
                      {tglLabel && <span className="text-[11px] text-gray-400">{tglLabel}</span>}
                    </div>
                    <div className="text-sm text-gray-600 whitespace-pre-line mt-0.5">{keg}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA — program eksklusif Sahabat Baitullah yang BUKAN target
            impian mereka gak bisa checkout langsung dari sini (dikonfirmasi
            user 2026-09-29/30). Mau ikut program ini = ajukan ganti target
            (wajib baca S&K + konfirmasi eksplisit dulu, lihat modal di
            bawah), wajib ACC admin — target lama otomatis "nonaktif
            sementara" begitu ada pengajuan aktif (bukan checkout paralel 2
            program eksklusif sekaligus). */}
        {isPendingNewChoice && (
          <div className="bg-white rounded-2xl border-2 border-[#C9952A] p-5 mb-4 text-center">
            <div className="font-bold text-[#0E2F6E] mb-1">🎯 Pilihan Paket Baru Anda</div>
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
              {targetGantiStatus === 'pembatalan_diajukan'
                ? '⏳ Anda sudah mengajukan pembatalan perpindahan ke program ini — mohon menunggu ACC admin.'
                : '⏳ Anda sudah mengajukan perpindahan ke program ini — mohon menunggu ACC admin, atau hubungi admin untuk follow up.'}
            </div>
          </div>
        )}

        {/* Target lama otomatis "nonaktif sementara" selagi ada pengajuan
            perpindahan yang menunggu ACC (dikonfirmasi user 2026-09-30) —
            gak boleh booking dari sini sampai pengajuan diproses. */}
        {isCurrentTarget && hasPendingRequestElsewhere && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center text-xs text-yellow-700 mb-4">
            ⏳ Program ini sedang nonaktif sementara — ada pengajuan perpindahan Target Impian yang menunggu ACC admin.
          </div>
        )}

        {isEksklusifSahabat && !isCurrentTarget && !isPendingNewChoice && (
          <div className="bg-white rounded-2xl border-2 border-[#C9952A] p-5 mb-4 text-center">
            <div className="font-bold text-[#0E2F6E] mb-1">🎯 Ingin Mengikuti Program Eksklusif Ini?</div>
            {hasPendingRequestElsewhere ? (
              <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                ⏳ Anda punya pengajuan ganti target lain yang masih menunggu ACC admin. Selesaikan dulu sebelum mengajukan program ini.
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-3">Mengajukan program ini sebagai Target Impian baru akan menonaktifkan sementara target Anda saat ini, dan wajib disetujui admin terlebih dahulu.</p>
                <button onClick={bukaModalGanti}
                  className="w-full bg-[#C9952A] hover:bg-[#a87c1f] text-white font-bold py-3 rounded-full transition-colors">
                  Ajukan Sebagai Target Baru →
                </button>
              </>
            )}
          </div>
        )}

        {(!isEksklusifSahabat || (isCurrentTarget && !hasPendingRequestElsewhere)) && (
          <div className="sticky bottom-4">
            {seatSisa <= 0 ? (
              <WaitlistCTA progId={prog.id} />
            ) : (
              <button onClick={handleBooking}
                className="w-full bg-[#C9952A] hover:bg-[#a87c1f] text-white font-bold py-4 rounded-full shadow-lg transition-colors">
                🕋 Booking Seat Sekarang Juga!
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal Ganti Target — 2 langkah SENGAJA dipisah (dikonfirmasi user
          2026-09-30, "jgn dibuat semudah itu"): (1) wajib baca S&K sampai
          scroll ke bawah baru centang bisa dipencet (pola sama /pks), (2)
          baru konfirmasi eksplisit sebelum benar-benar kekirim ke server. */}
      {modalStep && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalStep(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            {modalStep === 'tnc' && (
              <>
                <div className="flex justify-between items-start mb-3">
                  <div className="font-bold text-[#0E2F6E] text-lg">📜 Syarat & Ketentuan</div>
                  <button onClick={() => setModalStep(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>
                <div ref={scrollTncRef} onScroll={cekScrollTnc}
                  className="border border-gray-200 rounded-xl p-4 h-64 overflow-y-auto text-sm text-gray-600 mb-3">
                  {pasalTnc === null ? (
                    <div className="text-center text-gray-400 py-10">Memuat...</div>
                  ) : pasalTnc.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">Syarat & ketentuan belum tersedia. Hubungi admin.</div>
                  ) : (
                    pasalTnc.map(p => <div key={p.nomor}>{renderPasalBlock(p)}</div>)
                  )}
                </div>
                {!sudahBacaTnc && (
                  <div className="text-[11px] text-gray-400 mb-2 text-center">Gulir sampai bawah untuk melanjutkan.</div>
                )}
                <label className={`flex items-start gap-2.5 mb-3 ${sudahBacaTnc ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                  <input type="checkbox" checked={setujuTnc} disabled={!sudahBacaTnc}
                    onChange={e => setSetujuTnc(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#1A4FA0]" />
                  <span className="text-xs text-gray-600">Saya sudah membaca dan menyetujui syarat & ketentuan di atas.</span>
                </label>
                <button onClick={() => setModalStep('konfirmasi')} disabled={!setujuTnc}
                  className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full transition-colors">
                  Lanjutkan →
                </button>
              </>
            )}
            {modalStep === 'konfirmasi' && (
              <>
                <div className="text-4xl text-center mb-3">🎯</div>
                <div className="font-bold text-[#0E2F6E] text-center mb-2">Konfirmasi Pengajuan</div>
                <p className="text-sm text-gray-600 text-center mb-4">
                  Apakah Anda yakin ingin mengajukan <b>&quot;{prog.name}&quot;</b> sebagai Target Impian baru?
                  Jika yakin, Target Impian Anda saat ini akan <b>dinonaktifkan sementara</b> menunggu ACC pengajuan perpindahan program baru ini.
                  Apabila disetujui admin, program ini yang akan menjadi Target Impian Anda.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setModalStep('tnc')} disabled={submittingGanti}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-full disabled:opacity-50">
                    ← Kembali
                  </button>
                  <button onClick={ajukanGantiTarget} disabled={submittingGanti}
                    className="flex-2 bg-[#C9952A] hover:bg-[#a87c1f] text-white font-bold py-3 px-6 rounded-full disabled:opacity-50">
                    {submittingGanti ? 'Mengajukan...' : 'Ya, Ajukan'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
