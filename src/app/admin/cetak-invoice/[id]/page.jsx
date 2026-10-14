'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan } from '@/lib/usePengaturan';
import { terbilang } from '@/lib/terbilang';
import KopSurat from '@/app/components/KopSurat';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';
import TombolWA from '@/app/components/TombolWA';
import { pesanDokumenFisikTerkirim, pesanDokumenDigitalTerkirim } from '@/lib/waTemplates';

const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
// per-unit = total / qty (dibulatkan) — kalau qty gak ada/0, ya satuan = total (qty tersirat 1).
const perUnit = (total, qty) => qty > 0 ? Math.round(Number(total) / qty) : Number(total);

// Judul dokumen sengaja "INVOICE" polos aja (bukan "INVOICE — DP"/
// "INVOICE — PELUNASAN") — Invoice sekarang 1 jenis generik, labelnya ambil
// dari `dokumen.judul` yang diisi bebas oleh admin tiap generate (bisa "DP",
// "Pelunasan", "Cicilan ke-2", dst), bukan lagi hardcode di kode.
const JUDUL = {
  invoice: 'INVOICE',
  kwitansi: 'KWITANSI PEMBAYARAN',
  tanda_terima: 'TANDA TERIMA UANG',
};
// Label pembayaran generik (payments.type) dipakai buat baris Tanda Terima
// Uang, biar keliatan ini bukti terima buat pembayaran YANG MANA (DP/lunas).
const LABEL_TIPE_PEMBAYARAN = { dp: 'Uang Muka (DP)', lunas: 'Pelunasan' };
const LABEL_BARIS = {
  kwitansi: 'Pembayaran Total Paket (Paid)',
  tanda_terima: 'Pembayaran Diterima',
};
const BUTUH_REKENING = ['invoice']; // kwitansi/tanda terima = udah dibayar, gak perlu instruksi transfer
// UU Bea Meterai No. 10/2020 — dokumen yang menyatakan PENERIMAAN uang
// senilai >= Rp5.000.000 wajib materai Rp10.000. Berlaku begitu dokumen ini
// FUNGSINYA jadi tanda terima (Kwitansi selalu, Invoice DP/Pelunasan begitu
// statusnya Paid) — bukan pas masih jadi tagihan yang belum dibayar.
const BATAS_MATERAI = 5_000_000;

const td = { border: '1px solid #000', padding: '6px 8px' };

// Kombo paket+kamar sama persis buat SEMUA entry? Kalau enggak, baris
// "Paket" dipecah per-orang (dikonfirmasi user 2026-10-14) — jangan cuma
// nulis "Campuran" generik kalau datanya emang ada buat dirinci per orang.
function uniformCombo(list) {
  if (!list || list.length === 0) return true;
  const first = list[0];
  return list.every(j => j.paket === first.paket && j.kamar === first.kamar);
}

function BarisPaket({ booking, listOverride }) {
  // listOverride dipakai Kwitansi (dikonfirmasi user 2026-10-14) — begitu
  // udah "Kirim ke Jamaah", daftar jamaah/qty di baris ini WAJIB ikut
  // jamaah_breakdown_pembayaran yang udah dibekukan (lihat komponen
  // pemanggil), bukan booking.jamaah_breakdown yang selalu dihitung LIVE —
  // kalau enggak, baris ini bisa "berubah" walau nominal di bawahnya udah
  // dikunci. Invoice (listOverride gak dikasih) tetap pakai data booking
  // live seperti biasa, belum ikut lock.
  const list = listOverride || booking.jamaah_breakdown || [];
  const namaList = listOverride ? listOverride.map(j => j.nama) : (booking.jamaah_nama || []);
  const qty = list.length || Number(booking.jumlah_jamaah || 1);

  // Mixed combo & ada datanya — 1 baris PER ORANG, qty/satuan/jumlah masing2
  // pakai harga_jual orang itu sendiri (pre-voucher, snapshot katalog —
  // sama konvensi cetak-formulir).
  if (list.length > 0 && !uniformCombo(list)) {
    return list.map((j, i) => (
      <tr key={i}>
        <td style={td}>{j.nama} — {PAKET_LABEL[j.paket] || j.paket}{j.kamar ? ` · ${j.kamar}` : ''}</td>
        <td style={{ ...td, textAlign: 'center' }}>1</td>
        <td style={{ ...td, textAlign: 'right' }}>{rp(j.hargaJual)}</td>
        <td style={{ ...td, textAlign: 'right' }}>{rp(j.hargaJual)}</td>
      </tr>
    ));
  }

  // Seragam (atau breakdown kosong, fallback) — 1 baris gabungan, PERSIS
  // angka yang sama kayak sebelumnya (total_harga booking, bukan jumlah
  // harga_jual per-orang, biar gak geser dari voucher/opsi tambahan).
  return (
    <tr>
      <td style={td}>
        <div><b>Paket:</b> {PAKET_LABEL[booking.paket] || booking.paket}{booking.kamar ? ` · ${booking.kamar}` : ''}</div>
        {namaList.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <b>Atas Nama Jamaah:</b>
            <ol style={{ margin: '4px 0 0 20px', padding: 0 }}>
              {namaList.map((nama, i) => <li key={i}>{nama}</li>)}
            </ol>
          </div>
        )}
      </td>
      <td style={{ ...td, textAlign: 'center' }}>{qty}</td>
      <td style={{ ...td, textAlign: 'right' }}>{rp(perUnit(booking.total_harga, qty))}</td>
      <td style={{ ...td, textAlign: 'right' }}>{rp(booking.total_harga)}</td>
    </tr>
  );
}

// Daftar "Atas Nama Jamaah" buat baris DP/Pelunasan/Tanda Terima — SCOPED ke
// jamaah yang BENERAN ditutup pembayaran itu (bukan seisi booking, lihat
// jamaah_breakdown_pembayaran di API). Beda dari BarisPaket: amount-nya
// SENGAJA gak dipecah per-orang di sini (DP itu flat per kepala, gak
// tergantung paket — mencoba mecah proporsional cuma bikin angka ambigu),
// cuma label namanya yang dikasih keterangan paket kalau emang campuran.
function KeteranganPembayaran({ list }) {
  if (!list || list.length === 0) return null;
  const uniform = uniformCombo(list);
  return (
    <div style={{ marginTop: 4 }}>
      <b>Atas Nama Jamaah:</b>
      <ol style={{ margin: '4px 0 0 20px', padding: 0 }}>
        {list.map((j, i) => (
          <li key={i}>{j.nama}{!uniform ? ` — ${PAKET_LABEL[j.paket] || j.paket}${j.kamar ? ` · ${j.kamar}` : ''}` : ''}</li>
        ))}
      </ol>
    </div>
  );
}

function BarisItem({ label, sub, qty, satuan, jumlah, tebal }) {
  return (
    <tr>
      <td style={{ ...td, fontWeight: tebal ? 700 : 400 }}>
        {label}
        {sub && <div style={{ fontWeight: 400, fontSize: 10, color: '#666', marginTop: 2 }}>{sub}</div>}
      </td>
      <td style={{ ...td, textAlign: 'center', fontWeight: tebal ? 700 : 400 }}>{qty ?? ''}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: tebal ? 700 : 400 }}>{satuan != null ? rp(satuan) : ''}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: tebal ? 700 : 400 }}>{rp(jumlah)}</td>
    </tr>
  );
}

function BarisCatatan({ children }) {
  return (
    <tr>
      <td colSpan={4} style={{ ...td, fontSize: 11 }}>{children}</td>
    </tr>
  );
}

export default function CetakInvoiceKwitansi() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [dokumen, setDokumen] = useState(null);
  const [booking, setBooking] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [menyetujui, setMenyetujui] = useState(false);

  // Admin selalu boleh. Jamaah/pemesan JUGA boleh liat dokumen MILIKNYA
  // sendiri yang udah terkirim (dikonfirmasi user 2026-10-13 -- sebelumnya
  // halaman ini admin-only total, jamaah gak bisa lihat Tanda Terima Uang/
  // Kwitansi/Invoice-nya sendiri meski udah dikirim admin). Server
  // (/api/admin/invoice-kwitansi/[id]) yang nentuin boleh/enggak lewat
  // status 403, bukan dicek role di sini.
  useEffect(() => {
    if (!user) return;
    fetch(`/api/admin/invoice-kwitansi/${id}`)
      .then(r => { if (r.status === 403) { setDitolak(true); setLoading(false); return null; } return r.json(); })
      .then(d => {
        if (!d) return;
        if (!d.dokumen) { setLoading(false); return; }
        setDokumen(d.dokumen); setBooking(d.booking || null); setPayment(d.payment || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, id]);

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  // Setuju tanpa TTD digital -- endpoint-nya di Next.js sendiri sekarang
  // (/api/admin/invoice-kwitansi/[id]/setuju, dipindah dari Go 2026-10-13
  // biar gating materai Rp5jt bisa ditegakkan server-side tanpa sentuh repo
  // jm-travel-api). Cek Caddyfile.tahap2 di VPS kalau ternyata masih
  // keproxy ke Go.
  async function setujui() {
    const pesanKonfirmasi = ['tanda_terima', 'kwitansi'].includes(dokumen.jenis)
      ? `Kirim ${JUDUL[dokumen.jenis]} ${dokumen.nomor} ke jamaah sekarang? Setelah dikirim, isi dokumen ini terkunci permanen.`
      : `Setujui ${JUDUL[dokumen.jenis] || 'dokumen'} ${dokumen.nomor}? Dokumen akan ditandai sudah dikirim.`;
    if (!confirm(pesanKonfirmasi)) return;
    setMenyetujui(true);
    try {
      const res = await fetch(`/api/admin/invoice-kwitansi/${dokumen.id}/setuju`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error || 'Gagal menyetujui'); return; }
      // Server nentuin metode beneran (TTU materai -> 'fisik', lainnya ->
      // 'setuju') — jangan hardcode di client (dikonfirmasi user 2026-10-14).
      setDokumen(prev => ({ ...prev, terkirim: 1, terkirim_metode: d.terkirim_metode || 'setuju', terkirim_at: d.terkirim_at }));
    } catch { alert('Terjadi kesalahan'); }
    finally { setMenyetujui(false); }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Anda tidak punya akses ke dokumen ini.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>← Kembali</button>
    </div>
  );

  if (!dokumen) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Dokumen tidak ditemukan.</div>;

  const judul = JUDUL[dokumen.jenis];
  const punyaRincianBooking = booking?.total_harga != null;
  // tanda_terima & kwitansi pakai jamaah_breakdown_pembayaran — buat TTU itu
  // SCOPED ke jamaah yang BENERAN ditutup payment itu, buat kwitansi isinya
  // sama kayak booking penuh TAPI dibekukan begitu udah terkirim (lihat
  // migration 224 & lock-on-send di POST .../setuju). Invoice tetap pakai
  // breakdown booking LIVE, belum ikut lock (dikonfirmasi user 2026-10-14).
  const jamaahUntukPembayaran = ['tanda_terima', 'kwitansi'].includes(dokumen.jenis)
    ? (booking?.jamaah_breakdown_pembayaran || booking?.jamaah_breakdown || [])
    : (booking?.jamaah_breakdown || []);
  const qtyJamaah = jamaahUntukPembayaran.length || (booking ? Number(booking.jumlah_jamaah || 1) : 1);
  const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || dokumen.status === 'paid';
  // UU Bea Meterai Pasal 3: "nilai nominal LEBIH DARI Rp5.000.000" — strictly
  // di atas, Rp5.000.000 persis TIDAK kena materai (dikonfirmasi user
  // 2026-10-13, sebelumnya salah pakai >=).
  const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) > BATAS_MATERAI;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>{dokumen.nomor} · di dialog print pilih &quot;Save as PDF&quot;</div>
      </div>

      {/* TTD digital & e-materai belum bisa dipakai (dikonfirmasi user 2026-10-04) — tombol
          "Kirim TTD Digital" diganti "Setuju" (lihat setujui). Komponen tetap dipasang supaya
          sesi digital lama (kalau ada) masih kelihatan. Admin-only -- jamaah yang lihat
          dokumen miliknya sendiri gak perlu/gak boleh liat aksi-aksi ini (dikonfirmasi
          user 2026-10-13). */}
      {isAdmin && <DokumenSignatureAksi dokumen="invoice" refId={dokumen.id} onCetakFisik={() => window.print()} hideCetakFisik hideKirimDigital />}

      {dokumen.terkirim ? (
        <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 10, fontSize: 12, background: '#ecfdf5', color: '#047857', fontWeight: 700 }}>
            ✅ {dokumen.terkirim_metode === 'setuju' ? 'Sudah disetujui' : `Sudah dikirim (${dokumen.terkirim_metode === 'fisik' ? 'fisik' : 'digital'})`}, {tgl(dokumen.terkirim_at)}
          </div>
          {isAdmin && dokumen.terkirim_metode === 'fisik' && dokumen.scan_fisik_path && (
            <div style={{ marginTop: 8 }}>
              <TombolWA nomor={booking?.pemesan_wa} label="Kirim Ulang Scan via WA"
                pesan={pesanDokumenFisikTerkirim({
                  namaJamaah: dokumen.nama, jenis: dokumen.jenis, nomor: dokumen.nomor,
                  linkScan: typeof window !== 'undefined' ? `${window.location.origin}${dokumen.scan_fisik_path}` : dokumen.scan_fisik_path,
                })} />
            </div>
          )}
          {/* Jalur "Setuju" (digital) gak punya file terpisah yang bisa
              di-link langsung kayak scan fisik -- linknya ke HALAMAN INI
              sendiri (sekarang bisa diakses pemilik booking, lihat GET
              /api/admin/invoice-kwitansi/[id]). Ini tombol KIRIM aktifnya
              (dikonfirmasi user 2026-10-13 -- sebelumnya "Setuju" cuma
              nandain status di database, jamaah gak pernah DIBERITAHU sama
              sekali, cuma bisa nemu sendiri kalau kebetulan buka Dokumen
              Saya). Notifikasi in-app juga udah otomatis terkirim dari
              endpoint /setuju. */}
          {isAdmin && dokumen.terkirim_metode === 'setuju' && (
            <div style={{ marginTop: 8 }}>
              <TombolWA nomor={booking?.pemesan_wa} label="Kirim ke Jamaah via WA"
                pesan={pesanDokumenDigitalTerkirim({
                  namaJamaah: dokumen.nama, jenis: dokumen.jenis, nomor: dokumen.nomor,
                  link: typeof window !== 'undefined' ? window.location.href : `/admin/cetak-invoice/${dokumen.id}`,
                })} />
            </div>
          )}
        </div>
      ) : !isAdmin ? null : ['tanda_terima', 'kwitansi'].includes(dokumen.jenis) ? (
        // Tanda Terima Uang & Kwitansi (dikonfirmasi user 2026-10-14): "Kirim
        // ke Jamaah" sekarang tombol TERPISAH dari upload scan — scan cuma
        // nempelin file, kontennya baru DIBEKUKAN & jamaah baru DIBERITAHU
        // pas tombol ini beneran diklik. >Rp5jt wajib lewat step scan dulu.
        <div className="no-print" style={{ textAlign: 'center', marginBottom: 12 }}>
          {butuhMaterai && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: '#666' }}>
              {['1. Lihat', '2. Print', '3. Scan Materai+TTD', '4. Kirim'].map((label, i) => {
                const selesai = i === 0 || (i === 1 && !!dokumen.scan_fisik_path) || (i === 2 && !!dokumen.scan_fisik_path);
                return (
                  <span key={label} style={{ padding: '3px 8px', borderRadius: 12, fontWeight: 700, background: selesai ? '#dcfce7' : '#f3f4f6', color: selesai ? '#15803d' : '#666' }}>
                    {selesai ? '✓ ' : ''}{label}
                  </span>
                );
              })}
            </div>
          )}
          {butuhMaterai ? (
            <>
              <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                ⚠️ Nominal ≥ Rp5.000.000 — wajib materai asli. Print, tempel materai, TTD basah nembus materai, stempel, lalu unggah scan sebelum bisa kirim.
              </div>
              <UploadScanDokumen label="Scan fisik (materai + TTD)" uploadUrl={`/api/admin/invoice-kwitansi/${dokumen.id}/scan-fisik`}
                userId={dokumen.id} path={dokumen.scan_fisik_path} uploadedAt={dokumen.scan_fisik_uploaded_at}
                onUploaded={(path) => setDokumen(d => ({ ...d, scan_fisik_path: path }))} />
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>Nominal &lt; Rp5.000.000, gak perlu materai — tinggal kirim.</div>
          )}
          <button onClick={setujui} disabled={menyetujui || (butuhMaterai && !dokumen.scan_fisik_path)}
            style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: (menyetujui || (butuhMaterai && !dokumen.scan_fisik_path)) ? 0.5 : 1 }}>
            {menyetujui ? 'Mengirim...' : '📤 Kirim ke Jamaah'}
          </button>
        </div>
      ) : butuhMaterai ? (
        // Invoice: perilaku LAMA gak diubah (di luar scope — dibahas
        // terpisah nanti, dikonfirmasi user 2026-10-14). >= Rp5jt WAJIB
        // materai asli, cuma jalur fisik (upload scan = auto-terkirim).
        <>
        <div className="no-print" style={{ textAlign: 'center', marginBottom: 12, fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 8 }}>
          ⚠️ Nominal ≥ Rp5.000.000 — wajib materai asli. Print, tempel materai, TTD basah nembus materai, stempel, lalu unggah scan.
        </div>
        <UploadScanDokumen label="Scan fisik (materai + TTD)" uploadUrl={`/api/admin/invoice-kwitansi/${dokumen.id}/scan-fisik`}
          userId={dokumen.id} path={dokumen.scan_fisik_path} uploadedAt={dokumen.scan_fisik_uploaded_at}
          onUploaded={(path) => setDokumen(d => ({ ...d, scan_fisik_path: path, terkirim: 1, terkirim_metode: 'fisik', terkirim_at: new Date().toISOString() }))} />
        </>
      ) : (
        // < Rp5jt -- gak perlu materai, TTD digital (PNG tanda tangan yang
        // udah dirender di dokumen) cukup, tinggal "Setuju" (dikonfirmasi
        // user 2026-10-12).
        <div className="no-print" style={{ textAlign: 'center', marginBottom: 12 }}>
          <button onClick={setujui} disabled={menyetujui}
            style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: menyetujui ? 0.6 : 1 }}>
            {menyetujui ? 'Memproses...' : '✅ Setuju'}
          </button>
          <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>Nominal &lt; Rp5.000.000, gak perlu materai — TTD digital cukup.</div>
        </div>
      )}

      <div className="sheet" style={{ background: '#fff', width: 720, margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <KopSurat pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, letterSpacing: 0.5, color: '#0E2F6E' }}>{judul}</div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 24 }}>No: {dokumen.nomor}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: booking ? 10 : 20 }}>
          <div>Kepada Yth.<br /><b>{dokumen.nama}</b></div>
          <div style={{ textAlign: 'right' }}>Tanggal: {tgl(dokumen.tanggal)}</div>
        </div>

        {booking && (
          <div style={{ fontSize: 12, background: '#f8f9fd', border: '1px solid #e0e8f0', borderRadius: 6, padding: '10px 12px', marginBottom: 16, lineHeight: 1.8 }}>
            <div><b>Booking ID:</b> {booking.id}</div>
            {booking.prog_name && <div><b>Program:</b> {booking.prog_name}</div>}
            {booking.tanggal_berangkat && <div><b>Tanggal Keberangkatan:</b> {tgl(booking.tanggal_berangkat)}</div>}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={{ ...td, background: '#f0f0f0', textAlign: 'left' }}>Keterangan</th>
              <th style={{ ...td, background: '#f0f0f0', textAlign: 'center', width: 50 }}>Qty</th>
              <th style={{ ...td, background: '#f0f0f0', textAlign: 'right', width: 120 }}>Satuan</th>
              <th style={{ ...td, background: '#f0f0f0', textAlign: 'right', width: 130 }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {dokumen.jenis === 'tanda_terima' ? (
              // Tanda Terima Uang: qty/satuan/jumlah TETAP ada (dikonfirmasi
              // user 2026-10-14, "paket blablabla qty berapa satuan berapa
              // total berapa dibayar berapa") — yang DIBENERIN itu cuma
              // SCOPING-nya (qtyJamaah & jamaahUntukPembayaran sekarang dari
              // payment yang BENERAN ditutup, bukan booking penuh). Khusus
              // pelunasan (bukan DP) ditambah rincian Total Harga - DP
              // Sudah Dibayar di bawahnya, biar kebaca sisa yang dilunasi
              // dihitung dari apa.
              <>
                <BarisItem label={`${LABEL_TIPE_PEMBAYARAN[payment?.type] || 'Pembayaran'} — diterima`}
                  sub={<KeteranganPembayaran list={jamaahUntukPembayaran} />}
                  qty={qtyJamaah} satuan={perUnit(dokumen.nominal, qtyJamaah)} jumlah={dokumen.nominal} tebal />
                {payment?.type === 'lunas' && booking?.total_harga != null && (
                  <>
                    <BarisItem label="Total Harga Program" jumlah={booking.total_harga} />
                    <BarisItem label="DP Sudah Dibayar" jumlah={-Number(booking.dp_amount || 0)} />
                  </>
                )}
                <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
              </>
            ) : punyaRincianBooking ? (
              <>
                <BarisPaket booking={booking} listOverride={dokumen.jenis === 'kwitansi' ? jamaahUntukPembayaran : undefined} />

                {booking.opsi_tambahan_total > 0 && (
                  <BarisItem
                    label={booking.opsi_tambahan_nama?.length > 0 ? `Opsi Tambahan: ${booking.opsi_tambahan_nama.join(', ')}` : 'Opsi Tambahan'}
                    jumlah={booking.opsi_tambahan_total}
                  />
                )}

                {dokumen.jenis === 'invoice' && (
                  <>
                    <BarisItem label={dokumen.judul} qty={qtyJamaah} satuan={perUnit(dokumen.nominal, qtyJamaah)} jumlah={dokumen.nominal} tebal />
                    <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
                    {booking.sisa_pembayaran > 0 && (
                      <BarisItem label="Sisa Pembayaran" sub="*Dilunasi maksimal H-30 sebelum keberangkatan" jumlah={booking.sisa_pembayaran} />
                    )}
                  </>
                )}

                {dokumen.jenis === 'kwitansi' && dokumen.nominal_dp != null && (
                  <>
                    <BarisItem label="Uang Muka (DP) — diterima" qty={qtyJamaah} satuan={perUnit(dokumen.nominal_dp, qtyJamaah)} jumlah={dokumen.nominal_dp} />
                    {dokumen.status === 'paid' ? (
                      <BarisItem label="Pelunasan — diterima" qty={qtyJamaah} satuan={perUnit(dokumen.nominal_pelunasan, qtyJamaah)} jumlah={dokumen.nominal_pelunasan} />
                    ) : (
                      <BarisCatatan>Pelunasan: <i>belum dibayar</i></BarisCatatan>
                    )}
                    <BarisItem label={dokumen.status === 'paid' ? 'TOTAL PAID (diterima)' : 'Total Diterima Sejauh Ini'} jumlah={dokumen.nominal} tebal />
                    <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
                  </>
                )}
              </>
            ) : (
              <>
                <BarisItem label={dokumen.jenis === 'invoice' ? dokumen.judul : LABEL_BARIS[dokumen.jenis]} jumlah={dokumen.nominal} tebal />
                <BarisCatatan>Terbilang: <i>{terbilang(dokumen.nominal)}</i></BarisCatatan>
              </>
            )}
          </tbody>
        </table>

        {dokumen.keterangan && dokumen.is_manual ? (
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Catatan: {dokumen.keterangan}</div>
        ) : null}

        {BUTUH_REKENING.includes(dokumen.jenis) && dokumen.status !== 'paid' && (pengaturan.bank_nama || pengaturan.bank_rekening) && (
          <div style={{ fontSize: 12, border: '1px dashed #1A4FA0', borderRadius: 6, padding: '10px 12px', marginBottom: 20, background: '#F5F8FE' }}>
            <div style={{ fontWeight: 700, color: '#0E2F6E', marginBottom: 4 }}>Silakan transfer ke rekening berikut:</div>
            <div>{pengaturan.bank_nama} — {pengaturan.bank_rekening}</div>
            <div>a.n. {pengaturan.bank_atas_nama}</div>
          </div>
        )}

        {/* Stempel PAID: satu kolom status buat semua jenis dokumen. Kwitansi
            statusnya di-set otomatis tiap generateOrUpdateKwitansi/
            syncKwitansiDariInvoice jalan (paid begitu nominal_pelunasan
            keisi); Invoice DP/Pelunasan ngikut kolom status yang sama (auto-
            generate langsung paid krn emang tanda terima; manual bisa
            ditandai paid belakangan lewat halaman daftar). */}
        {dokumen.status === 'paid' && (
          <div style={{ display: 'inline-block', border: '3px solid #16a34a', color: '#16a34a', fontWeight: 800, fontSize: 16, padding: '4px 20px', transform: 'rotate(-6deg)', marginBottom: 16 }}>
            PAID
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
          <div style={{ textAlign: 'center', fontSize: 12, position: 'relative' }}>
            {tgl(dokumen.tanggal)}
            <div style={{ height: butuhMaterai ? 110 : 70, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {/* Cap perusahaan — ditaruh agak ke kiri, nyerempet area TTD,
                  transparan dikit biar kesan cap stempel asli. */}
              {pengaturan.cap_perusahaan_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pengaturan.cap_perusahaan_path} alt="Cap Perusahaan"
                  style={{ position: 'absolute', left: -75, top: '50%', transform: 'translateY(-50%) rotate(-10deg)', width: 95, opacity: 0.85 }} />
              )}
              {/* Placeholder materai FISIK — tempel materai Rp10.000 asli di
                  sini, tanda tangan nembus materainya kayak biasa. Belum ada
                  integrasi e-Meterai digital (butuh akun Peruri dulu). */}
              {butuhMaterai && (
                <div style={{ border: '1px dashed #999', color: '#999', fontSize: 11, width: 110, height: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.4, transform: 'rotate(-6deg)' }}>
                  Materai<br />Rp10.000
                </div>
              )}
              {/* TTD digital — nimpa di atas materai (persis kayak tanda
                  tangan asli yang nembus materai fisik). */}
              {pengaturan.ttd_penandatangan_keuangan_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pengaturan.ttd_penandatangan_keuangan_path} alt="Tanda Tangan"
                  style={{ position: 'absolute', height: 65, objectFit: 'contain' }} />
              )}
            </div>
            <div style={{ fontWeight: 700, textDecoration: 'underline' }}>{pengaturan.nama_penandatangan_keuangan || pengaturan.nama_penandatangan || '-'}</div>
            <div style={{ color: '#666' }}>{pengaturan.jabatan_penandatangan_keuangan || pengaturan.jabatan_penandatangan || '-'}</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
        }
        @page { size: 210mm 297mm; margin: 15mm; }
      `}</style>
    </div>
  );
}
