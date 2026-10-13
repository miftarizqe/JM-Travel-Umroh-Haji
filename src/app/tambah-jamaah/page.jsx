'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import UploadBukti from '@/app/components/UploadBukti';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useMetodePembayaran } from '@/lib/useMetodePembayaran';
import { resolveJamaahHarga } from '@/lib/jamaahHarga';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };

export default function TambahJamaahPage() {
  return (
    <Suspense fallback={<Layout title="➕ Tambah Jamaah"><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <TambahJamaahInner />
    </Suspense>
  );
}

function kosongJamaah(paket = '', kamar = '') {
  return { nama: '', jk: '', alamat_kirim: '', wa: '', paket, kamar };
}

function TambahJamaahInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  const [user] = useCurrentUser();
  const [metodePembayaran] = useMetodePembayaran();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [opsiKombo, setOpsiKombo] = useState(null); // null = belum dimuat
  const [list, setList] = useState([kosongJamaah()]);
  const [buktiPath, setBuktiPath] = useState(null);
  const [buktiNama, setBuktiNama] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isDirty = list.some(j => j.nama || j.jk || j.alamat_kirim || j.wa) || !!buktiPath;
  useUnsavedGuard(isDirty);

  useEffect(() => {
    if (!user || !bookingId) return;
    fetch(`/api/bookings/${bookingId}`)
      .then(r => r.json())
      .then(d => { setBooking(d.booking || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, bookingId]);

  // Kombo paket/kamar BEBAS dipilih PER ORANG (dikonfirmasi user 2026-10-13
  // — awalnya 1 kombo dipaksa buat semua jamaah baru, lalu direvisi lagi
  // supaya tiap orang bisa beda, persis granularitas booking dari awal).
  // Default jamaah baru pertama diarahkan ke kombo yang sama kayak jamaah
  // lain di booking ini, biar yang gak peduli tinggal lanjut.
  useEffect(() => {
    if (!booking) return;
    fetch(`/api/bookings/${bookingId}/kombo-tersedia`)
      .then(r => r.json())
      .then(d => {
        const opsi = d.kombo || [];
        setOpsiKombo(opsi);
        let jd = booking.jamaah_data;
        if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = null; } }
        const aktifPertama = (Array.isArray(jd) ? jd : []).find(j => j?.status_jamaah !== 'dibatalkan');
        const komboSaatIni = resolveJamaahHarga(booking, aktifPertama);
        const match = opsi.find(o => o.paket === komboSaatIni.paket && o.kamarKey === komboSaatIni.kamarKey);
        const dipilih = match || opsi[0] || null;
        if (dipilih) {
          setList(prev => prev.map(j => (!j.paket && !j.kamar) ? { ...j, paket: dipilih.paket, kamar: dipilih.kamar } : j));
        }
      })
      .catch(() => setOpsiKombo([]));
  }, [booking, bookingId]);

  function ubah(idx, field, value) {
    setList(prev => prev.map((j, i) => i === idx ? { ...j, [field]: value } : j));
  }
  function ubahKombo(idx, value) {
    const [pk, km] = value.split('|');
    setList(prev => prev.map((j, i) => i === idx ? { ...j, paket: pk, kamar: km } : j));
  }
  function tambahBaris() {
    const dipilih = (opsiKombo || [])[0];
    setList(prev => [...prev, kosongJamaah(prev[0]?.paket || dipilih?.paket || '', prev[0]?.kamar || dipilih?.kamar || '')]);
  }
  function hapusBaris(idx) { setList(prev => prev.filter((_, i) => i !== idx)); }

  function hargaBaris(j) {
    return (opsiKombo || []).find(o => o.paket === j.paket && o.kamar === j.kamar)?.harga || 0;
  }

  async function submit() {
    if (list.some(j => !j.paket || !j.kamar)) { alert('Pilih paket & kamar untuk semua jamaah!'); return; }
    if (list.some(j => !j.nama.trim())) { alert('Nama semua jamaah wajib diisi!'); return; }
    if (list.some(j => j.jk !== 'Laki-Laki' && j.jk !== 'Perempuan')) { alert('Jenis kelamin semua jamaah wajib diisi!'); return; }
    if (list.some(j => !j.alamat_kirim.trim())) { alert('Alamat kirim perlengkapan semua jamaah wajib diisi!'); return; }
    if (!buktiPath) { alert('Bukti transfer DP wajib diunggah!'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/tambah-jamaah`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namas: list.map(j => j.nama), jks: list.map(j => j.jk),
          alamats: list.map(j => j.alamat_kirim), was: list.map(j => j.wa),
          pakets: list.map(j => j.paket), kamars: list.map(j => j.kamar),
          bukti_path: buktiPath, bukti_nama: buktiNama,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menambah jamaah'); setSubmitting(false); return; }
      alert(d.message || 'Jamaah berhasil ditambahkan! Bukti DP menunggu konfirmasi admin.');
      router.push('/dashboard/jamaah');
    } catch {
      alert('Terjadi kesalahan');
    }
    setSubmitting(false);
  }

  if (!user || loading) return (
    <Layout title="➕ Tambah Jamaah" showBack><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>
  );
  if (!booking) return (
    <Layout title="➕ Tambah Jamaah" showBack><div className="text-center py-20 text-gray-400">Booking tidak ditemukan.</div></Layout>
  );
  if (booking.dp_status !== 'confirmed') {
    return (
      <Layout title="➕ Tambah Jamaah" showBack>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="text-5xl mb-3">⏳</div>
          <div className="font-bold text-[#0E2F6E] mb-1">DP booking ini belum dikonfirmasi</div>
          <div className="text-sm text-gray-400">Tunggu admin konfirmasi DP booking {booking.id} dulu sebelum bisa menambah jamaah.</div>
        </div>
      </Layout>
    );
  }
  if (booking.pelunasan_status === 'paid') {
    return (
      <Layout title="➕ Tambah Jamaah" showBack>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="text-5xl mb-3">✅</div>
          <div className="font-bold text-[#0E2F6E] mb-1">Booking ini sudah lunas</div>
          <div className="text-sm text-gray-400 mb-4">Untuk mendaftarkan jamaah lain, gunakan tombol &quot;+ Daftarkan jamaah lain&quot; di halaman program.</div>
          <button onClick={() => router.push(`/program/${booking.prog_id}`)}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold px-5 py-2.5 rounded-full">
            Lihat Program →
          </button>
        </div>
      </Layout>
    );
  }

  const dpPerOrang = booking.jumlah_jamaah > 0 ? Math.round((booking.dp_amount || 0) / booking.jumlah_jamaah) : 0;
  const n = list.length;
  const totalHargaTambahan = list.reduce((s, j) => s + hargaBaris(j), 0);
  const dpTambahan = dpPerOrang * n;

  return (
    <Layout title="➕ Tambah Jamaah" showBack confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Data yang sudah diisi akan hilang.">
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="bg-[#E8F0FB] rounded-xl p-4">
          <div className="text-xs text-gray-400">Menambah jamaah ke booking</div>
          <div className="font-bold text-[#0E2F6E]">{booking.prog_name} — {booking.id}</div>
          <div className="text-xs text-gray-500 mt-1">Tiap jamaah baru bebas pilih paket & kamar sendiri-sendiri.</div>
        </div>

        {opsiKombo !== null && opsiKombo.length === 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 text-center">
            Belum ada kombo paket/kamar tersedia untuk program ini. Hubungi admin.
          </div>
        )}

        <div className="space-y-3">
          {list.map((j, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-[#e0e8f0] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-[#0E2F6E] text-sm">Jamaah Baru {idx + 1}</div>
                {list.length > 1 && (
                  <button onClick={() => hapusBaris(idx)} className="text-xs text-red-500 font-bold">✕ Hapus</button>
                )}
              </div>
              <select value={`${j.paket}|${j.kamar}`} onChange={e => ubahKombo(idx, e.target.value)} required
                disabled={opsiKombo === null}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm font-semibold text-[#0E2F6E]">
                <option value="|">Pilih paket & kamar...</option>
                {(opsiKombo || []).map(o => (
                  <option key={`${o.paket}|${o.kamar}`} value={`${o.paket}|${o.kamar}`}>
                    {PAKET_LABEL[o.paket] || o.paket} · {o.kamar} — {rp(o.harga)}
                  </option>
                ))}
              </select>
              <input value={j.nama} onChange={e => ubah(idx, 'nama', e.target.value)}
                placeholder="Nama lengkap sesuai paspor/KTP" required
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
              <select value={j.jk} onChange={e => ubah(idx, 'jk', e.target.value)} required
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm">
                <option value="">Pilih jenis kelamin...</option>
                <option value="Laki-Laki">Laki-Laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
              <input value={j.wa} onChange={e => ubah(idx, 'wa', e.target.value)}
                placeholder="No. Whatsapp (opsional)"
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
              <input value={j.alamat_kirim} onChange={e => ubah(idx, 'alamat_kirim', e.target.value)}
                placeholder="Alamat kirim perlengkapan" required
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm" />
            </div>
          ))}
        </div>

        <button onClick={tambahBaris}
          className="w-full border-2 border-dashed border-[#1A4FA0] text-[#1A4FA0] text-sm font-bold py-2.5 rounded-xl hover:bg-[#E8F0FB]">
          + Tambah Jamaah Lain Lagi
        </button>

        {/* Invoice DP tambahan */}
        <div className="bg-[#E8F0FB] rounded-xl p-5 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0] mb-2">💰 DP Jamaah Tambahan</div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Total harga tambahan ({n} orang)</span>
            <span className="font-semibold text-[#0E2F6E]">{rp(totalHargaTambahan)}</span>
          </div>
          <div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-base">
            <span className="text-sm">DP yang harus dibayar sekarang</span>
            <span className="text-red-600">{rp(dpTambahan)}</span>
          </div>
          <div className="text-[11px] text-gray-400 pt-1">Sisa pelunasan jamaah tambahan ini mengikuti jadwal pelunasan booking {booking.id}.</div>
        </div>

        <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1A4FA0]">🏦 Rekening Tujuan</div>
          {metodePembayaran.map(m => (
            <div key={m.id} className="text-sm text-gray-500 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
              <div className="font-bold text-[#0E2F6E]">{m.nama}</div>
              {m.nomor && <div className="flex justify-between"><span>No. Rekening</span><span className="font-bold text-[#0E2F6E]">{m.nomor}</span></div>}
              {m.atas_nama && <div className="flex justify-between"><span>Atas Nama</span><span className="font-bold text-[#0E2F6E]">{m.atas_nama}</span></div>}
              {m.catatan && <div className="text-xs text-gray-400 mt-0.5">{m.catatan}</div>}
            </div>
          ))}
        </div>

        <UploadBukti
          onUploaded={(path, nama) => { setBuktiPath(path); setBuktiNama(nama); }}
          label="Klik untuk upload bukti transfer DP"
        />

        <button onClick={submit} disabled={!buktiPath || submitting || opsiKombo === null}
          className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? 'Memproses...' : 'Kirim & Tambah Jamaah →'}
        </button>
      </div>
    </Layout>
  );
}
