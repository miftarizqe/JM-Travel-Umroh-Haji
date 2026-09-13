'use client';
import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { renderPasalMarkup } from '@/lib/pasalMarkup';

export default function PKSPage() {
  return (
    <Suspense fallback={<Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <PKSPageInner />
    </Suspense>
  );
}

function PKSPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jenis = searchParams.get('jenis') || 'jamaah';
  const bookingId = searchParams.get('booking_id');

  const [sudahBaca, setSudahBaca] = useState(false);
  const [setuju, setSetuju] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDigital, setLoadingDigital] = useState(false);
  const [pksUser, setPksUser] = useState(null); // data sendiri (bank/rekening) buat isi pasal komisi
  const [pasal, setPasal] = useState(null);
  const [userId, setUserId] = useState(null); // dipakai jadi ref_id buat dokumen ber-ref-user (sahabat/SPK-AK)
  const scrollRef = useRef(null);

  useUnsavedGuard(setuju);

  // Perwakilan & sahabat baca isi PASAL LENGKAP (sama persis kayak dokumen
  // final yang dicetak admin) — perwakilan butuh data bank/rekening sendiri
  // buat pasal komisi, sahabat (SPK-AK) gak butuh merge field apa pun.
  // Jamaah tetap pakai ringkasan singkat (bukan bagian dari perjanjian resmi
  // bertanda tangan). Isi pasal dokumen legal ada di /admin/pasal.
  const dokumenKey = jenis === 'perwakilan' ? 'spka_ins' : jenis === 'sahabat_baitullah' ? 'spk_ak' : 'jamaah';

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    try { setUserId(JSON.parse(u)?.id || null); } catch { /* abaikan */ }
    if (jenis === 'perwakilan' || jenis === 'sahabat_baitullah') {
      fetch('/api/pks/data').then(r => r.json()).then(d => setPksUser(d.user || null)).catch(() => {});
    }
    fetch(`/api/pasal?dokumen=${dokumenKey}`).then(r => r.json()).then(d => setPasal(d.pasal || [])).catch(() => setPasal([]));
  }, []);

  // Wajib scroll sampai bawah sebelum bisa centang
  function cekScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setSudahBaca(true);
  }

  async function simpan() {
    if (!setuju) { alert('Centang persetujuan terlebih dahulu!'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/pks', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ jenis, booking_id: bookingId })
      });
      const d = await res.json();
      if (res.ok) {
        alert('Persetujuan tercatat!');
        if (jenis === 'perwakilan') router.push('/daftar-perwakilan/metode');
        else if (jenis === 'sahabat_baitullah') router.push('/status-pendaftaran-sahabat');
        else router.push('/dashboard/jamaah');
      } else alert(d.error);
    } catch { alert('Terjadi kesalahan'); }
    setLoading(false);
  }

  // Khusus jamaah & sahabat: selain "setuju" (checkbox, tetap jadi gerbang
  // lanjut seperti sebelumnya — TIDAK diubah), ada opsi lanjut TTD digital
  // sungguhan (bikin PDF + sesi tanda tangan) alih-alih cuma checkbox.
  // ref_id beda per jenis: jamaah -> booking, sahabat -> akun user sendiri.
  async function simpanLaluTtdDigital() {
    if (!setuju) { alert('Centang persetujuan terlebih dahulu!'); return; }
    const refId = jenis === 'sahabat_baitullah' ? userId : bookingId;
    if (!refId) { alert('Data belum siap, coba lagi.'); return; }
    setLoadingDigital(true);
    try {
      const resPks = await fetch('/api/pks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis, booking_id: bookingId }),
      });
      const dPks = await resPks.json();
      if (!resPks.ok) { alert(dPks.error); setLoadingDigital(false); return; }

      const resSig = await fetch('/api/admin/dokumen-signature', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen: dokumenKey, ref_id: refId, metode: 'digital' }),
      });
      const dSig = await resSig.json();
      if (!resSig.ok) { alert(dSig.error || 'Gagal memulai TTD digital'); setLoadingDigital(false); return; }
      router.push(`/tanda-tangan/${dSig.id}`);
    } catch { alert('Terjadi kesalahan'); }
    setLoadingDigital(false);
  }

  const pakaiPasalLengkap = jenis === 'perwakilan' || jenis === 'sahabat_baitullah';
  const judulLengkap = 'Surat Perjanjian Kerja Sama Perwakilan (SPK-PWK)';
  const judulSahabat = 'Surat Perjanjian Jamaah Umroh — Program Sahabat Baitullah';
  const judulRingkas = 'Surat Perjanjian Jamaah Umroh';
  const judul = jenis === 'perwakilan' ? judulLengkap : jenis === 'sahabat_baitullah' ? judulSahabat : judulRingkas;
  const mergeData = pksUser ? {
    bank_agen: pksUser.bank, rekening_agen: pksUser.no_rekening, nama_rekening_agen: pksUser.nama_pemilik_rekening,
    target_minat: pksUser.target_minat || '(belum ditentukan)',
    target_estimasi_harga: pksUser.target_estimasi_harga ? Number(pksUser.target_estimasi_harga).toLocaleString('id-ID') : '________',
  } : null;
  const menungguDataAwal = (jenis === 'perwakilan' || jenis === 'sahabat_baitullah') && !pksUser;

  return (
    <Layout title="📜 Perjanjian Kerjasama" showBack confirmLeave={setuju}
      confirmMessage="Yakin ingin keluar? Persetujuan yang sudah dicentang belum disimpan.">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#E8F0FB] rounded-xl p-3 mb-4 text-xs text-[#1A4FA0]">
          Baca sampai selesai, lalu centang persetujuan di bawah. Isi perjanjian ini persis sama dengan dokumen final yang akan Anda tanda tangani.
        </div>

        <div className="bg-white rounded-xl border border-[#e0e8f0] overflow-hidden mb-4">
          <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] text-white p-4 text-center">
            <div className="text-lg font-bold">JM TRAVEL</div>
            <div className="text-xs opacity-85">PT. Alkhalid Jaya Megah Tours & Travel</div>
            <div className="text-sm font-bold mt-2">{judul}</div>
          </div>

          <div ref={scrollRef} onScroll={cekScroll}
            className="p-5 max-h-[400px] overflow-y-auto text-sm text-gray-600 space-y-4">
            {!pasal || menungguDataAwal ? (
              <div className="text-center text-gray-400 py-10">Memuat isi perjanjian...</div>
            ) : (
              pasal.map(p => (
                <div key={p.nomor}>
                  <div className="font-bold text-[#0E2F6E] mb-1">Pasal {p.nomor} — {p.judul}</div>
                  <div className="leading-relaxed">{renderPasalMarkup(p.isi, mergeData)}</div>
                </div>
              ))
            )}
            <div className="pt-4 border-t border-gray-100 text-xs text-gray-400 italic">
              Perjanjian ini mengikat para pihak sejak tanggal persetujuan diberikan secara elektronik.
            </div>
          </div>

          {!sudahBaca && (
            <div className="bg-yellow-50 border-t border-yellow-200 p-2 text-center text-xs text-yellow-700">
              ⬇️ Gulir ke bawah sampai selesai membaca
            </div>
          )}
        </div>

        <label className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${
          sudahBaca ? 'bg-white border-gray-200 cursor-pointer' : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'}`}>
          <input type="checkbox" checked={setuju} disabled={!sudahBaca}
            onChange={e=>setSetuju(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#1A4FA0] flex-shrink-0"/>
          <span className="text-sm text-gray-600 leading-relaxed">
            Saya telah membaca, memahami, dan menyetujui seluruh isi {judul} ini.
          </span>
        </label>

        {(jenis === 'jamaah' && bookingId) || (jenis === 'sahabat_baitullah' && userId) ? (
          <div className="mt-4 space-y-2">
            <button onClick={simpanLaluTtdDigital} disabled={!setuju || loading || loadingDigital}
              className="w-full bg-[#C9952A] hover:bg-yellow-600 text-white font-bold py-3 rounded-full disabled:opacity-40">
              {loadingDigital ? 'Memproses...' : '✍️ Setujui & Tanda Tangan Digital'}
            </button>
            <button onClick={simpan} disabled={!setuju || loading || loadingDigital}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-full disabled:opacity-40 text-sm">
              {loading ? 'Menyimpan...' : '📝 Setujui — TTD Fisik Nanti'}
            </button>
          </div>
        ) : (
          <button onClick={simpan} disabled={!setuju || loading}
            className="w-full mt-4 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full disabled:opacity-40">
            {loading ? 'Menyimpan...' : '✅ Setujui & Lanjutkan'}
          </button>
        )}
      </div>
    </Layout>
  );
}
