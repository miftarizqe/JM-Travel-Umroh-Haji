'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const JENIS_LABEL = { invoice: 'Invoice', kwitansi: 'Kwitansi', tanda_terima: 'Tanda Terima Uang' };
const LABEL_TIPE_PEMBAYARAN = { dp: 'DP', lunas: 'Pelunasan' };

// Invoice (1 jenis generik, judul bebas) vs Kwitansi (final, lunas total) —
// 2 TAB, konsisten sama pemisahan nomor urut di backend. Tanda Terima Uang
// SENGAJA gak punya tab sendiri — aksesnya nempel di tombol Cetak baris
// Invoice booking yang sama (lihat cariTandaTerimaBooking), krn Invoice
// sekarang fleksibel (bisa cicilan berapa kali) jadi gak ada lagi pemetaan
// 1:1 yang pasti ke 1 payment — makanya ditampilin per booking, bukan per
// invoice spesifik.
const TAB_JENIS = {
  invoice: ['invoice'],
  kwitansi: ['kwitansi'],
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
  const [tab, setTab] = useState('invoice');
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
      .then(d => { setDokumen(d.dokumen || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) muat();
  }, [user]);

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

  // Saran Judul+Nominal invoice berikutnya buat booking ini — belum pernah
  // di-invoice sama sekali -> saranin DP (nominal = dp_amount target booking);
  // udah pernah -> saranin Pelunasan (nominal = sisa total_harga - yang udah
  // di-invoice). Cuma SARAN awal, admin tetap bebas ubah nominal/judulnya.
  function saranInvoice(b) {
    const totalInvoicedSoFar = dokumen
      .filter(d => d.jenis === 'invoice' && d.booking_id === b.id)
      .reduce((s, d) => s + Number(d.nominal), 0);
    if (totalInvoicedSoFar === 0) {
      return { nominal: String(Number(b.dp_amount || 0)), judul: 'Uang Muka (DP)' };
    }
    const sisa = Math.max(Number(b.total_harga || 0) - totalInvoicedSoFar, 0);
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

  const dokumenTab = dokumen.filter(d => TAB_JENIS[tab].includes(d.jenis));

  // Sisa live di form manual: total_harga booking dikurangi SEMUA Invoice
  // yang pernah dibuat buat booking ini (termasuk yang lagi diketik sekarang)
  // — "sisa tagihan", bukan "sisa yang beneran belum dibayar" (soal duit
  // yang beneran diterima ada di Kwitansi/Tanda Terima, narik dari payments).
  const bidForm = form.booking_id.trim();
  const totalInvoicedLain = bidForm
    ? dokumen.filter(d => d.jenis === 'invoice' && d.booking_id === bidForm).reduce((s, d) => s + Number(d.nominal), 0)
    : 0;
  const sisaSetelahIni = totalHargaForm != null ? totalHargaForm - totalInvoicedLain - Number(form.nominal || 0) : null;

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

      {/* Tab Invoice vs Kwitansi — konsisten sama pemisahan nomor urut di
          backend (Invoice DP & Pelunasan 1 seri, Kwitansi seri sendiri). */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('invoice')}
          className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === 'invoice' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-600'}`}>
          📄 Invoice
        </button>
        <button onClick={() => setTab('kwitansi')}
          className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === 'kwitansi' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-600'}`}>
          🧾 Kwitansi
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && muat(q)}
          placeholder="Cari nama / booking ID / nomor..."
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-64" />
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
              {dokumenTab.length === 0 ? (
                <tr><td colSpan={tab === 'invoice' ? 9 : 8} className="text-center text-gray-400 py-8">Belum ada dokumen.</td></tr>
              ) : dokumenTab.map(d => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{d.nomor}</td>
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
                      <button onClick={() => window.open(`/admin/cetak-invoice/${d.id}`, '_blank')}
                        className="text-[#1A4FA0] font-bold hover:underline text-xs">🖨️ Cetak</button>
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
                <input type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))}
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
