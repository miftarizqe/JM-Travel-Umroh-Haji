'use client';
import { useState } from 'react';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';

function fmtTgl(t) {
  if (!t) return null;
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function pesanWa({ catatan, tanggal, jumlahPax }) {
  let pesan = `Assalamu'alaikum JM Travel, saya mau ajukan permintaan custom Umroh Private:\n\n${catatan}`;
  if (tanggal) pesan += `\n\nTanggal keberangkatan: ${fmtTgl(tanggal)}`;
  if (jumlahPax) pesan += `\nJumlah pax: ${jumlahPax}`;
  return pesan;
}

// Fallback buat pengunjung yang gak nemu template yang cocok di /kalkulator —
// deskripsi bebas apa yang mereka mau, TANPA perlu pilih paket/kamar/hotel
// dari katalog. Beda dari kalkulator template/baseline (yang beneran
// ngitung harga) — di sini gak ada harga otomatis, cuma nyambungin
// langsung ke WhatsApp JM Travel (sama pola kayak tombol "💬 Konsultasi
// Umroh Private" di beranda, gak perlu login). Kalau pengunjung KEBETULAN
// lagi login, permintaannya JUGA disimpan ke kalkulator_lead (best-effort,
// diam-diam) biar tetap kecatat di riwayat admin — tapi ini bukan syarat,
// WA-nya tetap jalan meski gak login/gagal kesimpen.
export default function KalkulatorCustomPage() {
  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();

  const [catatan, setCatatan] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [jumlahPax, setJumlahPax] = useState('');
  const [terkirim, setTerkirim] = useState(false);
  const [error, setError] = useState('');

  function kirim() {
    setError('');
    if (!catatan.trim()) { setError('Ceritain dulu paket seperti apa yang kamu mau.'); return; }

    const link = waLink(pengaturan.wa_kantor, pesanWa({ catatan: catatan.trim(), tanggal, jumlahPax }));
    if (!link) { setError('Nomor WhatsApp JM Travel belum diatur, coba lagi nanti.'); return; }
    window.open(link, '_blank');
    setTerkirim(true);

    // Best-effort — kalau kebetulan lagi login, ikut kecatat ke riwayat
    // admin. Gak nunggu/nge-block UI buat ini, dan gagal (mis. belum
    // login) dibiarkan diam-diam — WA di atas udah jadi aksi utamanya.
    if (user) {
      fetch('/api/kalkulator-publik/ajukan-custom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan: catatan.trim(), tanggal_berangkat: tanggal || null, jumlah_pax: jumlahPax || null }),
      }).catch(() => {});
    }
  }

  const inp = "w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <Layout title="🎨 Ajukan Custom Sendiri" backHref="/#umroh-private">
      <div className="text-sm text-gray-600 mb-6">
        Gak nemu paket yang pas dari daftar kami? Ceritain aja maunya gimana — langsung terhubung ke WhatsApp JM Travel, tim kami bantu susunkan itinerary & quote harganya buat kamu.
      </div>

      <div className="bg-white rounded-2xl border border-[#e0e8f0] p-5 space-y-4">
        {terkirim ? (
          <div className="text-sm text-green-700 font-semibold bg-green-50 rounded-lg px-3 py-2.5 text-center">
            ✓ Permintaan terbuka di WhatsApp — tinggal kirim pesannya ya! Tim kami akan segera membalas.
          </div>
        ) : (
          <>
            <div>
              <label className={lbl}>Ceritain paket yang kamu mau *</label>
              <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={5} className={inp}
                placeholder="Mis. Umroh buat keluarga 6 orang, mau hotel deket Masjidil Haram, pengen ada city tour Thaif, budget kira-kira segini..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Tanggal Keberangkatan (opsional)</label>
                <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Jumlah Pax (opsional)</label>
                <input type="number" min={1} value={jumlahPax} onChange={e => setJumlahPax(e.target.value)} placeholder="0" className={inp} />
              </div>
            </div>

            {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

            <button onClick={kirim}
              className="w-full bg-[#25D366] hover:bg-green-600 text-white font-bold py-3 rounded-full transition-colors">
              💬 Kirim via WhatsApp
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
