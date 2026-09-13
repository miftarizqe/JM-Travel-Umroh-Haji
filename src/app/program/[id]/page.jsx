'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import WaitlistCTA from '@/app/components/WaitlistCTA';
import { tangkapRefPerwakilan } from '@/lib/referralCapture';

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

  const [prog, setProg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  function handleBooking() {
    // Wajib login dulu. Kalau belum login -> ke login, lalu balik ke checkout program ini.
    let user = null;
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { user = null; }
    const tujuan = `/checkout?prog_id=${id}`;
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(tujuan)}`);
    } else {
      router.push(tujuan);
    }
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

        {/* CTA BOOKING */}
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
      </div>
    </Layout>
  );
}
