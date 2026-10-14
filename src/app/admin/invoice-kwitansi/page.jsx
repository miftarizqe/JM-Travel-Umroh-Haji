'use client';
import { Suspense, useEffect, useState } from 'react';
import InputTanggal from '@/app/components/InputTanggal';
import { useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const JENIS_LABEL = { invoice: 'Invoice', kwitansi: 'Kwitansi', tanda_terima: 'Tanda Terima Uang' };
const LABEL_TIPE_PEMBAYARAN = { dp: 'DP', lunas: 'Pelunasan' };

// Invoice (1 jenis generik, judul bebas) vs Kwitansi (final, lunas total) vs
// Tanda Terima Uang (per payment confirmed) — 3 TAB, konsisten sama
// pemisahan nomor urut di backend. TTU dulu gak punya tab sendiri (cuma
// nempel di tombol "TT DP/Pelunasan" di baris Invoice yang paid), sekarang
// dikasih tab sendiri (dikonfirmasi user 2026-10-13) biar bisa dibrowse
// langsung & biar rekomendasi "perlu dibuatkan" (lihat rekomKwitansi/
// rekomTandaTerima) ada tempat relevan buat nampilin baris abu-abunya.
const TAB_JENIS = {
  invoice: ['invoice'],
  kwitansi: ['kwitansi'],
  tanda_terima: ['tanda_terima'],
};

// Semua dokumen Tanda Terima buat 1 booking (biasanya maks 2: DP & lunas,
// krn payments.type cuma dp/lunas) — ditampilin sbg link "Cetak Tanda
// Terima" di baris Invoice booking itu begitu ada Invoice yang Paid.
function cariTandaTerimaBooking(semuaDokumen, bookingId) {
  if (!bookingId) return [];
  return semuaDokumen.filter(x => x.jenis === 'tanda_terima' && x.booking_id === bookingId);
}

const formKosong = (jenisDefault) => ({ jenis: jenisDefault, booking_id: '', nama: '', nominal: '', judul: '', keterangan: '', tanggal: new Date().toISOString().slice(0, 10) });

export default function InvoiceKwitansiPage() {
  return (
    <Suspense fallback={<Layout><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>}>
      <InvoiceKwitansiPageInner />
    </Suspense>
  );
}

function InvoiceKwitansiPageInner() {
  const [user] = useCurrentUser();
  const searchParams = useSearchParams();
  const [dokumen, setDokumen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rekomKwitansi, setRekomKwitansi] = useState([]);
  const [rekomTandaTerima, setRekomTandaTerima] = useState([]);
  const [rekomBusyId, setRekomBusyId] = useState(null);
  const [tab, setTab] = useState('invoice');
  // Deep-link dari cluster "Tindak Lanjut" dashboard admin (dikonfirmasi user
  // 2026-10-14) — ?tab=tanda_terima&belum_dikirim=1 buka tab yang bener +
  // filter cuma yang belum dikirim, BUKAN langsung lompat ke 1 dokumen
  // spesifik kayak sebelumnya (admin gak liat dokumen lain yang sama2 perlu
  // ditindaklanjuti).
  const [filterBelumDikirim, setFilterBelumDikirim] = useState(false);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(formKosong('invoice'));
  const [saving, setSaving] = useState(false);
  const [mencariBookingForm, setMencariBookingForm] = useState(false);
  // total_harga booking yang lagi dipilih di form — dasar hitung "Sisa" live
  // (total_harga - semua Invoice booking ini - nominal yang lagi diketik).
  const [totalHargaForm, setTotalHargaForm] = useState(null);
  // Detail booking (program, tanggal berangkat, nama jamaah, referral) buat
  // ditampilin di form — biar admin bisa MAKE SURE ini booking yang bener
  // sebelum generate, bukan cuma nebak dari Booking ID/nama pemesan doang.
  const [detailBookingForm, setDetailBookingForm] = useState(null);

  const [cariBookingQ, setCariBookingQ] = useState('');
  const [hasilCariBooking, setHasilCariBooking] = useState(null);
  const [cariBookingError, setCariBookingError] = useState(null);
  const [mencariBooking, setMencariBooking] = useState(false);
  // Booking yang lagi diklik di hasil pencarian — hasil pencarian default
  // cuma nampilin nama+booking ID, klik buka POPUP kecil (detail + tombol
  // aksi Buat Invoice/Kwitansi), bukan expand inline di list.
  const [bookingDipilih, setBookingDipilih] = useState(null);

  function muat(query = '') {
    setLoading(true);
    fetch(`/api/admin/invoice-kwitansi${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(r => r.json())
      .then(d => {
        setDokumen(d.dokumen || []);
        // Rekomendasi cuma dikirim server pas load awal (query kosong) —
        // jangan ditimpa kosong pas lagi search (lihat komentar di GET route).
        if (!query) { setRekomKwitansi(d.rekomendasi_kwitansi || []); setRekomTandaTerima(d.rekomendasi_tanda_terima || []); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  // Tombol "Buat Sekarang" di rekomendasi — generate dokumen yang kelewat
  // (dikonfirmasi user 2026-10-13), lalu buka halaman cetaknya & refresh
  // list biar rekomendasinya ikut ilang.
  async function buatDariRekomendasi(jenis, idKey, id) {
    setRekomBusyId(id);
    try {
      const res = await fetch('/api/admin/invoice-kwitansi/auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [idKey]: id, jenis }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat dokumen'); return; }
      window.open(`/admin/cetak-invoice/${d.id}`, '_blank');
      muat();
    } catch { alert('Terjadi kesalahan'); }
    finally { setRekomBusyId(null); }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) muat();
  }, [user]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tabParam && TAB_JENIS[tabParam]) setTab(tabParam);
    if (searchParams.get('belum_dikirim') === '1') setFilterBelumDikirim(true);
  }, [searchParams]);

  // Cari 1 booking persis by ID lewat endpoint /cari-booking (yang udah
  // ikut sertakan jamaah_nama, tanggal_berangkat, referral_nama) — dipakai
  // bersama oleh isiOtomatisDariBooking (Booking ID diketik manual) & deep
  // link ?booking_id=, biar dua-duanya dapet detail yang sama lengkapnya.
  async function fetchBookingRingkas(bid) {
    const res = await fetch(`/api/admin/invoice-kwitansi/cari-booking?q=${encodeURIComponent(bid)}`);
    const d = await res.json();
    if (!res.ok) return null;
    return (d.bookings || []).find(b => b.id === bid) || null;
  }

  // Deep-link dari tombol "Cetak Invoice" di halaman lain (mis. tab Payments/
  // Program di /admin) — dulu langsung auto-generate, sekarang Invoice selalu
  // manual (judul+nominal admin), jadi tombol itu cuma nge-link ke sini
  // dengan ?booking_id=... dan halaman ini yang buka form-nya pre-filled.
  useEffect(() => {
    const bid = searchParams.get('booking_id');
    if (!bid || !user) return;
    fetchBookingRingkas(bid).then(b => { if (b) bukaFormInvoice(b); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Saran Judul+Nominal invoice berikutnya buat booking ini — berdasarkan
  // STATUS PEMBAYARAN BENERAN (dp_status/pelunasan_status + daftar
  // `pembayaran` confirmed dari cari-booking), BUKAN dari histori Invoice
  // yang pernah dibuat (bug ditemukan user 2026-10-14: "orang udah bayar DP
  // tapi invoice-nya malah invoice DP" — Invoice itu opsional/manual, jadi
  // booking yang DP-nya UDAH LUNAS lewat alur normal tapi belum pernah
  // di-invoice sama sekali bakal keliatan "totalInvoicedSoFar === 0" dan
  // disaranin DP lagi, padahal DP-nya udah beres). DP belum confirmed ->
  // saranin DP (nominal = dp_amount). DP udah confirmed -> saranin
  // Pelunasan, nominalnya SISA BENERAN (total_harga - dp_amount - SEMUA
  // cicilan lunas yang udah confirmed — sama formula hitungSisaBayar di
  // src/lib/pelunasan.js, dihitung ulang dari `pembayaran` yang udah
  // dibawa cari-booking biar gak perlu fetch lagi). Cuma SARAN awal, admin
  // tetap bebas ubah nominal/judulnya.
  function saranInvoice(b) {
    if (b.dp_status !== 'confirmed') {
      return { nominal: String(Number(b.dp_amount || 0)), judul: 'Uang Muka (DP)' };
    }
    const lunasConfirmed = (b.pembayaran || [])
      .filter(p => p.type === 'lunas')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const sisa = Math.max(0, Number(b.total_harga || 0) - Number(b.dp_amount || 0) - lunasConfirmed);
    return { nominal: String(sisa), judul: 'Pelunasan' };
  }

  // Begitu Booking ID di form manual diisi (blur), tarik data booking-nya
  // dan auto-isi Nama + Nominal + Judul (saran DP/Pelunasan, lihat
  // saranInvoice) + total_harga (buat basis hitung Sisa) + detail
  // (jamaah/tanggal berangkat/referral, buat verifikasi) — cuma isi field
  // yang MASIH KOSONG, biar gak nimpa yang udah diketik manual.
  async function isiOtomatisDariBooking() {
    const bid = form.booking_id.trim();
    if (!bid) { setTotalHargaForm(null); setDetailBookingForm(null); return; }
    setMencariBookingForm(true);
    try {
      const b = await fetchBookingRingkas(bid);
      if (!b) { setTotalHargaForm(null); setDetailBookingForm(null); return; }
      setTotalHargaForm(Number(b.total_harga || 0));
      setDetailBookingForm(b);
      const saran = saranInvoice(b);
      setForm(f => ({
        ...f,
        nama: f.nama.trim() ? f.nama : (b.pemesan_nama || f.nama),
        nominal: f.nominal ? f.nominal : saran.nominal,
        judul: f.judul.trim() ? f.judul : saran.judul,
      }));
    } catch {
      // diam aja — ini cuma bantuan isi otomatis, bukan validasi wajib
    } finally {
      setMencariBookingForm(false);
    }
  }

  // Buka form Buat Invoice, pre-filled dari hasil pencarian booking (udah
  // ada total_harga & detailnya dari /cari-booking, gak perlu fetch ulang) —
  // termasuk saran Nominal+Judul (DP/Pelunasan), tetap bisa diedit admin.
  function bukaFormInvoice(b) {
    const saran = saranInvoice(b);
    setForm({ ...formKosong('invoice'), booking_id: b.id, nama: b.pemesan_nama || '', nominal: saran.nominal, judul: saran.judul });
    setTotalHargaForm(Number(b.total_harga || 0));
    setDetailBookingForm(b);
    setTab('invoice');
    setBookingDipilih(null);
    setShowForm(true);
  }

  // Buka form Buat Kwitansi — treatment SAMA kyk Buat Invoice (pop-up
  // pre-filled), bukan auto-generate langsung. Nominal SENGAJA gak disaranin
  // (Kwitansi dokumen final, adminlah yang tau persis berapa yang beneran
  // diterima) — admin isi manual.
  function bukaFormKwitansi(b) {
    setForm({ ...formKosong('kwitansi'), booking_id: b.id, nama: b.pemesan_nama || '' });
    setTotalHargaForm(Number(b.total_harga || 0));
    setDetailBookingForm(b);
    setTab('kwitansi');
    setBookingDipilih(null);
    setShowForm(true);
  }

  async function simpanManual() {
    if (!form.nama.trim() || !form.nominal || Number(form.nominal) <= 0 || !form.tanggal) {
      alert('Nama, nominal, dan tanggal wajib diisi'); return;
    }
    if (form.jenis === 'invoice' && !form.judul.trim()) {
      alert('Judul/Keterangan invoice wajib diisi'); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/invoice-kwitansi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, booking_id: form.booking_id.trim() || null, nominal: Number(form.nominal) }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat dokumen'); return; }
      setShowForm(false);
      muat(q);
      window.open(`/admin/cetak-invoice/${d.id}`, '_blank');
    } finally {
      setSaving(false);
    }
  }

  // Cari booking by Booking ID, nama pemesan, ATAU nama jamaah (endpoint
  // /cari-booking) — bisa dapet beberapa hasil, tinggal pilih yang mana
  // buat digenerate.
  async function cariBooking() {
    const query = cariBookingQ.trim();
    if (!query) return;
    setMencariBooking(true);
    setHasilCariBooking(null);
    setCariBookingError(null);
    try {
      const res = await fetch(`/api/admin/invoice-kwitansi/cari-booking?q=${encodeURIComponent(query)}`);
      const d = await res.json();
      if (!res.ok) { setCariBookingError(d.error || 'Gagal mencari booking'); return; }
      if ((d.bookings || []).length === 0) setCariBookingError('Booking tidak ditemukan');
      setHasilCariBooking(d.bookings || []);
    } catch {
      setCariBookingError('Terjadi kesalahan saat mencari booking');
    } finally {
      setMencariBooking(false);
    }
  }

  async function toggleStatus(d) {
    const statusBaru = d.status === 'paid' ? 'unpaid' : 'paid';
    if (!confirm(`Tandai ${d.nomor} sebagai "${statusBaru === 'paid' ? 'Paid' : 'Unpaid'}"?`)) return;
    const res = await fetch('/api/admin/invoice-kwitansi', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, status: statusBaru }),
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error || 'Gagal mengubah status'); return; }
    muat(q);
  }

  if (!user) return null;

  const dokumenTab = dokumen
    .filter(d => TAB_JENIS[tab].includes(d.jenis))
    .filter(d => !filterBelumDikirim || !d.terkirim);

  // Sisa live di form manual: total_harga booking dikurangi yang BENERAN
  // udah dibayar (dp_status confirmed + semua cicilan lunas confirmed,
  // sama formula saranInvoice) dikurangi nominal yang lagi diketik sekarang
  // — SAMA SUMBER kebenaran sama saranInvoice (dibenerin bareng 2026-10-14,
  // sebelumnya dihitung dari histori Invoice yang pernah dibuat, bukan dari
  // pembayaran beneran, bug yang sama persis "invoice DP lagi padahal udah
  // lunas DP").
  const dpConfirmedForm = detailBookingForm?.dp_status === 'confirmed';
  const lunasConfirmedForm = (detailBookingForm?.pembayaran || [])
    .filter(p => p.type === 'lunas')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const sudahDibayarForm = (dpConfirmedForm ? Number(detailBookingForm?.dp_amount || 0) : 0) + lunasConfirmedForm;
  const sisaSetelahIni = totalHargaForm != null ? totalHargaForm - sudahDibayarForm - Number(form.nominal || 0) : null;

  return (
    <Layout title="🧾 Invoice & Kwitansi" backHref="/admin">
      {/* Generate dari booking yang sudah ada — cari by ID/nama, lalu tombol
          yang muncul ngikut status DP/pelunasan booking itu (server tetap
          validasi ulang syaratnya di endpoint /auto). */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="text-xs font-bold text-gray-400 mb-2">Generate dari Booking</div>
        <div className="flex gap-2 mb-2">
          <input value={cariBookingQ} onChange={e => setCariBookingQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && cariBooking()}
            placeholder="Booking ID, nama pemesan, atau nama jamaah..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={cariBooking} disabled={mencariBooking}
            className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-bold px-4 py-2 rounded-lg whitespace-nowrap">
            {mencariBooking ? 'Mencari...' : '🔍 Cari'}
          </button>
        </div>
        {cariBookingError && <div className="text-xs text-red-500">{cariBookingError}</div>}
        {hasilCariBooking && hasilCariBooking.length > 0 && (
          <div className="space-y-2">
            {hasilCariBooking.map(b => (
              <button key={b.id} onClick={() => setBookingDipilih(b)}
                className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-3 font-bold text-[#0E2F6E] text-sm">
                {b.pemesan_nama || '-'} — {b.id}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Popup detail + pilih aksi (Buat Invoice / Buat Kwitansi) — muncul
          begitu 1 hasil pencarian diklik, biar list-nya sendiri tetep ringkas
          (cuma nama+booking ID). */}
      {bookingDipilih && (() => {
        const b = bookingDipilih;
        const kwitansiAda = dokumen.some(d => d.jenis === 'kwitansi' && d.booking_id === b.id);
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setBookingDipilih(null)}>
            <div className="bg-white rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-[#0E2F6E] mb-1">{b.pemesan_nama || '-'} — {b.id}</h3>
              <div className="text-xs text-gray-400 mb-4">
                {b.prog_name} · DP: {b.dp_status === 'confirmed' ? '✅' : '-'} · Pelunasan: {b.pelunasan_status === 'paid' ? '✅' : '-'} · Kwitansi: {kwitansiAda ? '✅' : '-'}
              </div>
              <div className="flex gap-2 flex-wrap">
                {/* Belum lunas total -> masih bisa nagih/nambah Invoice
                    (DP/cicilan/pelunasan, bebas). Begitu udah lunas total,
                    tombol Buat Invoice ilang — gak ada lagi yang perlu
                    ditagih. */}
                {b.pelunasan_status !== 'paid' && (
                  <button onClick={() => bukaFormInvoice(b)}
                    className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-2 rounded-full">📄 Buat Invoice</button>
                )}
                {/* Kwitansi cuma keluar begitu LUNAS TOTAL, dan cuma
                    ditawarin kalau belum pernah dibuat (1 booking = 1
                    Kwitansi). Begitu lunas total DAN Kwitansi udah ada,
                    dua-duanya ilang. */}
                {b.pelunasan_status === 'paid' && !kwitansiAda && (
                  <button onClick={() => bukaFormKwitansi(b)}
                    className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-2 rounded-full">🧾 Buat Kwitansi</button>
                )}
                {b.pelunasan_status === 'paid' && kwitansiAda && (
                  <div className="text-xs text-gray-400 py-2">✅ Invoice & Kwitansi booking ini sudah lengkap.</div>
                )}
              </div>
              <button onClick={() => setBookingDipilih(null)}
                className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold py-2 rounded-xl">Tutup</button>
            </div>
          </div>
        );
      })()}

      {/* Tab Invoice vs Kwitansi vs Tanda Terima Uang — 3 jenis dokumen asli
          (TTU sebelumnya gak punya tab sendiri, cuma nempel di tombol "TT
          DP/Pelunasan" di baris Invoice — sekarang bisa dibrowse langsung).
          Rekomendasi "perlu dibuatkan" (booking lunas tanpa Kwitansi, payment
          confirmed tanpa Tanda Terima) ditaruh INLINE sebagai baris abu-abu
          di tab yang relevan (Kwitansi/Tanda Terima Uang) — bukan tab/halaman
          terpisah lagi (dikonfirmasi user 2026-10-13). */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('invoice')}
          className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === 'invoice' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-600'}`}>
          📄 Invoice
        </button>
        <button onClick={() => setTab('kwitansi')}
          className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === 'kwitansi' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-600'}`}>
          🧾 Kwitansi{rekomKwitansi.length > 0 ? ` (${rekomKwitansi.length} rekomendasi)` : ''}
        </button>
        <button onClick={() => setTab('tanda_terima')}
          className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === 'tanda_terima' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-600'}`}>
          🧾 Tanda Terima Uang{rekomTandaTerima.length > 0 ? ` (${rekomTandaTerima.length} rekomendasi)` : ''}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && muat(q)}
            placeholder="Cari nama / booking ID / nomor..."
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-64" />
          {(tab === 'tanda_terima' || tab === 'kwitansi') && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={filterBelumDikirim} onChange={e => setFilterBelumDikirim(e.target.checked)} />
              Cuma yang belum dikirim
            </label>
          )}
        </div>
        <button onClick={() => { setForm(formKosong(tab)); setTotalHargaForm(null); setDetailBookingForm(null); setShowForm(true); }}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-4 py-2 rounded-xl">
          + Buat Manual
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-[#0E2F6E] text-white text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Nomor</th>
                {tab === 'invoice' && <th className="px-3 py-2 text-left">Keterangan</th>}
                <th className="px-3 py-2 text-left">Nama</th>
                <th className="px-3 py-2 text-left">Booking</th>
                <th className="px-3 py-2 text-right">Nominal</th>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Sumber</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {/* Baris rekomendasi (abu-abu, belum ada dokumennya) — SELALU
                  di atas, biar yang perlu ditindaklanjuti kelihatan duluan. */}
              {tab === 'kwitansi' && rekomKwitansi.map(b => (
                <tr key={`rekom-kwt-${b.booking_id}`} className="border-t border-gray-100 bg-gray-50 text-gray-400">
                  <td className="px-3 py-2 whitespace-nowrap italic">belum dibuat</td>
                  <td className="px-3 py-2">{b.nama || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{b.booking_id}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rp(b.total_harga)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">-</td>
                  <td className="px-3 py-2 whitespace-nowrap">{b.prog_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap italic">lunas, rekomendasi dibuat</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => buatDariRekomendasi('kwitansi', 'booking_id', b.booking_id)} disabled={rekomBusyId === b.booking_id}
                      className="text-[10px] font-bold text-white bg-[#0E2F6E] hover:bg-[#1A4FA0] px-3 py-1.5 rounded-full disabled:opacity-50 whitespace-nowrap">
                      {rekomBusyId === b.booking_id ? '...' : '🧾 Buat Kwitansi'}
                    </button>
                  </td>
                </tr>
              ))}
              {tab === 'tanda_terima' && rekomTandaTerima.map(p => (
                <tr key={`rekom-ttu-${p.payment_id}`} className="border-t border-gray-100 bg-gray-50 text-gray-400">
                  <td className="px-3 py-2 whitespace-nowrap italic">belum dibuat</td>
                  <td className="px-3 py-2">{p.nama || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.booking_id || '-'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rp(p.amount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{tgl(p.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.prog_name || '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap italic">{LABEL_TIPE_PEMBAYARAN[p.type] || p.type} confirmed, rekomendasi dibuat</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => buatDariRekomendasi('tanda_terima', 'payment_id', p.payment_id)} disabled={rekomBusyId === p.payment_id}
                      className="text-[10px] font-bold text-white bg-[#0E2F6E] hover:bg-[#1A4FA0] px-3 py-1.5 rounded-full disabled:opacity-50 whitespace-nowrap">
                      {rekomBusyId === p.payment_id ? '...' : '🧾 Buat Tanda Terima'}
                    </button>
                  </td>
                </tr>
              ))}
              {dokumenTab.length === 0 && !(tab === 'kwitansi' && rekomKwitansi.length > 0) && !(tab === 'tanda_terima' && rekomTandaTerima.length > 0) ? (
                <tr><td colSpan={tab === 'invoice' ? 9 : 8} className="text-center text-gray-400 py-8">Belum ada dokumen.</td></tr>
              ) : dokumenTab.map(d => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{d.nomor || <span className="text-gray-400 italic">belum dikirim</span>}</td>
                  {tab === 'invoice' && <td className="px-3 py-2 whitespace-nowrap">{d.judul || '-'}</td>}
                  <td className="px-3 py-2">{d.nama}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.booking_id || '-'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rp(d.nominal)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{tgl(d.tanggal)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.is_manual ? 'Manual' : 'Otomatis'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {/* Tanda Terima cuma dibuat begitu uangnya beneran udah
                        diterima — statusnya selalu Paid, gak perlu toggle. */}
                    {d.jenis === 'tanda_terima' ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">✅ Paid</span>
                    ) : (
                      <button onClick={() => toggleStatus(d)}
                        className={`text-xs font-bold px-2 py-1 rounded-full ${d.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {d.status === 'paid' ? '✅ Paid' : '⏳ Unpaid'}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {/* Unpaid = cuma bisa cetak Invoice (tagihan). Paid = ada
                        2 opsi: Invoice (udah lunas, jadi tanda terima juga)
                        ATAU Tanda Terima Uang punya invoice ini kalau ada
                        (dokumen bukti terima yang auto-generate pas payment
                        confirmed). */}
                    {tab === 'invoice' && d.status === 'paid' ? (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => window.open(`/admin/cetak-invoice/${d.id}`, '_blank')}
                          className="text-[#1A4FA0] font-bold hover:underline text-xs">🖨️ Invoice</button>
                        {cariTandaTerimaBooking(dokumen, d.booking_id).map(tt => (
                          <button key={tt.id} onClick={() => window.open(`/admin/cetak-invoice/${tt.id}`, '_blank')}
                            className="text-[#1A4FA0] font-bold hover:underline text-xs">
                            🧾 TT {LABEL_TIPE_PEMBAYARAN[tt.payment_type] || ''}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => window.open(`/admin/cetak-invoice/${d.id}`, '_blank')}
                          className="text-[#1A4FA0] font-bold hover:underline text-xs">🖨️ Cetak</button>
                        {/* Link langsung ke scan materai+TTD -- SEBELUMNYA list ini
                            sama sekali gak nunjukin ada scan apa enggak, admin harus
                            buka halaman detail dulu (ditemukan via pertanyaan user
                            2026-10-14). */}
                        {d.scan_fisik_path && (
                          <a href={d.scan_fisik_path} target="_blank" rel="noopener noreferrer"
                            className="text-[#1A4FA0] font-bold hover:underline text-xs">👁️ Scan</a>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#0E2F6E] mb-4">
              Buat {tab === 'invoice' ? 'Invoice' : JENIS_LABEL[tab]} Manual
            </h3>
            <div className="space-y-3">
              {form.jenis === 'invoice' && (
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Judul/Keterangan Invoice</label>
                  <input value={form.judul} onChange={e => setForm(f => ({ ...f, judul: e.target.value }))}
                    placeholder='mis. "DP", "Pelunasan", "Cicilan ke-2"'
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Booking ID (opsional)</label>
                <input value={form.booking_id} onChange={e => setForm(f => ({ ...f, booking_id: e.target.value }))}
                  onBlur={isiOtomatisDariBooking}
                  placeholder="JMT-XXXXXX (kosongkan kalau gak nempel ke booking)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                {mencariBookingForm && <div className="text-[11px] text-gray-400 mt-1">Mencari data booking...</div>}
                {/* Detail booking — biar admin bisa MAKE SURE ini booking yang
                    bener sebelum generate, bukan cuma nebak dari ID/nama. */}
                {detailBookingForm && (
                  <div className="mt-2 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-0.5">
                    {detailBookingForm.prog_name && <div><b>Program:</b> {detailBookingForm.prog_name}</div>}
                    {detailBookingForm.tanggal_berangkat && <div><b>Tgl Keberangkatan:</b> {tgl(detailBookingForm.tanggal_berangkat)}</div>}
                    {detailBookingForm.jamaah_nama?.length > 0 && (
                      <div><b>Jamaah:</b> {detailBookingForm.jamaah_nama.join(', ')}</div>
                    )}
                    <div><b>Referral/Perwakilan:</b> {detailBookingForm.referral_nama || '-'}</div>
                    {/* Info harga — biar admin gak nebak2 mau isi nominal
                        berapa: harga per-pax, total, DP yang BENERAN udah
                        dibayar (kalau belum ada, baris ini gak ditampilin
                        sama sekali — bukan target/patokan, cuma fakta). */}
                    <div className="pt-1 mt-1 border-t border-gray-200">
                      <b>Harga per Pax:</b> {rp(Math.round(Number(detailBookingForm.total_harga || 0) / Number(detailBookingForm.jumlah_jamaah || 1)))} × {detailBookingForm.jumlah_jamaah || 1} pax
                    </div>
                    <div><b>Total Harga:</b> {rp(detailBookingForm.total_harga)}</div>
                    {/* Histori SEMUA pembayaran yang beneran confirmed (DP,
                        cicilan, pelunasan) — bukan cuma DP doang, biar
                        keliatan pembayaran ke berapa aja yang udah masuk. */}
                    {detailBookingForm.pembayaran?.map((p, i) => (
                      <div key={i}>
                        <b>Pembayaran ke-{i + 1} ({LABEL_TIPE_PEMBAYARAN[p.type] || p.type}):</b> {rp(p.amount)} ({tgl(p.tanggal)})
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Nama</label>
                <input value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Nominal</label>
                <input type="number" value={form.nominal} onChange={e => setForm(f => ({ ...f, nominal: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                {form.jenis === 'invoice' && sisaSetelahIni != null && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    Sisa setelah ini: <b className={sisaSetelahIni < 0 ? 'text-red-500' : ''}>{rp(sisaSetelahIni)}</b>
                  </div>
                )}
                {/* Nominal yang diketik OTOMATIS dibagi jumlah pax pas dicetak
                    (kolom Satuan di tabel invoice) — preview-nya di sini biar
                    keliatan dari form, gak perlu buka hasil cetak dulu. */}
                {form.jenis === 'invoice' && detailBookingForm?.jumlah_jamaah > 0 && Number(form.nominal) > 0 && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    ≈ {rp(Math.round(Number(form.nominal) / detailBookingForm.jumlah_jamaah))} / pax ({detailBookingForm.jumlah_jamaah} pax)
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Tanggal</label>
                <InputTanggal value={form.tanggal} onChange={e => { if (e.target.value) setForm(f => ({ ...f, tanggal: e.target.value })); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Keterangan (opsional)</label>
                <textarea value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={simpanManual} disabled={saving}
                className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
                {saving ? 'Menyimpan...' : '✅ Buat & Cetak'}
              </button>
              <button onClick={() => setShowForm(false)} disabled={saving}
                className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-bold py-2.5 rounded-xl">Batal</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
