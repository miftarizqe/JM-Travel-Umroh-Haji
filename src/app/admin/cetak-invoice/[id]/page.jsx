'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan } from '@/lib/usePengaturan';
import DokumenSignatureAksi from '@/app/components/DokumenSignatureAksi';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';
import TombolWA from '@/app/components/TombolWA';
import { pesanDokumenFisikTerkirim, pesanDokumenDigitalTerkirim } from '@/lib/waTemplates';
import DokumenCetak, { rp, tgl, JUDUL, BATAS_MATERAI } from '../DokumenCetak';

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
  // Checklist "Nominal sudah benar" — gerbang terakhir sebelum admin klik
  // Kirim (dikonfirmasi user 2026-10-14) — admin WAJIB sadar liat nominal
  // sekali lagi sebelum ngirim dokumen keuangan yang abis dikirim gak bisa
  // diubah lagi (lock-on-send).
  const [nominalBenar, setNominalBenar] = useState(false);
  // Step "2. Print" di indikator TTU/Kwitansi >Rp5jt — SEBELUMNYA gak
  // pernah keupdate walau tombol print udah dipencet (ditemukan user
  // 2026-10-14 lewat screenshot, step-nya diem di "1. Lihat" aja). Dilacak
  // lokal (gak perlu disimpan ke server, cuma penanda visual) begitu
  // window.print() beneran dipanggil dari tombol manapun di halaman ini.
  const [sudahPrint, setSudahPrint] = useState(false);
  function cetak() { setSudahPrint(true); window.print(); }

  // Snapshot HTML BEKU (migration 227, dikonfirmasi user 2026-10-14:
  // "walaupun next time format/nama paket/siapa yg ttd diubah, yang udah
  // terkirim gabakal ikutan berubah") -- diambil dari DOM React yang UDAH
  // KETERENDER di browser admin PERSIS abis kirim sukses (ReactDOMServer
  // gak bisa dipakai di Route Handler App Router, lihat .../[id]/snapshot/
  // route.js), bukan di-generate ulang server-side. `justSent` dipicu
  // SEKALI doang abis setujui() sukses -- efeknya nunggu commit DOM dulu
  // (nomor/terkirim yang baru keupdate) baru nangkep innerHTML-nya.
  const sheetRef = useRef(null);
  const [justSent, setJustSent] = useState(false);
  useEffect(() => {
    if (!justSent || !sheetRef.current || !dokumen?.id) return;
    setJustSent(false);
    fetch(`/api/admin/invoice-kwitansi/${dokumen.id}/snapshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: sheetRef.current.innerHTML }),
    }).catch(() => { /* gagal simpan snapshot jangan ganggu alur kirim yang udah sukses */ });
  }, [justSent, dokumen?.id]);

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
      ? `Kirim ${JUDUL[dokumen.jenis]} ${dokumen.nomor || '(nomor baru akan dibuat)'} ke jamaah sekarang? Setelah dikirim, isi dokumen ini terkunci permanen.`
      : `Setujui ${JUDUL[dokumen.jenis] || 'dokumen'} ${dokumen.nomor || ''}? Dokumen akan ditandai sudah dikirim.`;
    if (!confirm(pesanKonfirmasi)) return;
    setMenyetujui(true);
    try {
      const res = await fetch(`/api/admin/invoice-kwitansi/${dokumen.id}/setuju`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error || 'Gagal menyetujui'); return; }
      // Server nentuin metode beneran (TTU materai -> 'fisik', lainnya ->
      // 'setuju') — jangan hardcode di client (dikonfirmasi user 2026-10-14).
      // nomor ikut di-refresh -- buat dokumen yang gak wajib materai, nomor
      // BARU dibakar di titik kirim ini (sebelumnya null/belum ada).
      setDokumen(prev => ({ ...prev, terkirim: 1, terkirim_metode: d.terkirim_metode || 'setuju', terkirim_at: d.terkirim_at, nomor: d.nomor || prev.nomor }));
      if (['tanda_terima', 'kwitansi'].includes(dokumen.jenis)) setJustSent(true);
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

  // berfungsiTandaTerima/butuhMaterai dihitung ULANG di sini (SAMA PERSIS
  // formula di DokumenCetak.jsx & POST .../setuju) -- dipakai buat gating UI
  // tombol/banner di LUAR .sheet (materai, scan, step indicator), bukan buat
  // render isi dokumennya sendiri (itu sekarang tanggung jawab DokumenCetak).
  const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || dokumen.status === 'paid';
  // UU Bea Meterai Pasal 3: "nilai nominal LEBIH DARI Rp5.000.000" — strictly
  // di atas, Rp5.000.000 persis TIDAK kena materai (dikonfirmasi user
  // 2026-10-13, sebelumnya salah pakai >=).
  const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) > BATAS_MATERAI;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={cetak}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>{dokumen.nomor || 'Nomor diberikan otomatis'} · di dialog print pilih &quot;Save as PDF&quot;</div>
      </div>

      {/* TTD digital & e-materai belum bisa dipakai (dikonfirmasi user 2026-10-04) — tombol
          "Kirim TTD Digital" diganti "Setuju" (lihat setujui). Komponen tetap dipasang supaya
          sesi digital lama (kalau ada) masih kelihatan. Admin-only -- jamaah yang lihat
          dokumen miliknya sendiri gak perlu/gak boleh liat aksi-aksi ini (dikonfirmasi
          user 2026-10-13). */}
      {isAdmin && <DokumenSignatureAksi dokumen="invoice" refId={dokumen.id} onCetakFisik={cetak} hideCetakFisik hideKirimDigital />}

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
                // "Print" ikut keitung selesai kalau scan udah ada juga
                // (gak mungkin bisa scan tanpa print duluan) — jaga-jaga
                // state lokal sudahPrint ilang kalau halaman di-reload
                // abis print (ditemukan user 2026-10-14).
                const selesai = i === 0 || (i === 1 && (sudahPrint || !!dokumen.scan_fisik_path)) || (i === 2 && !!dokumen.scan_fisik_path) || (i === 3 && !!dokumen.terkirim);
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
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: '#333', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={nominalBenar} onChange={e => setNominalBenar(e.target.checked)} />
            Nominal {rp(dokumen.nominal)} di atas sudah benar
          </label>
          <button onClick={setujui} disabled={menyetujui || !nominalBenar || (butuhMaterai && !dokumen.scan_fisik_path)}
            style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: (menyetujui || !nominalBenar || (butuhMaterai && !dokumen.scan_fisik_path)) ? 0.5 : 1 }}>
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

      {/* Dokumen UDAH TERKIRIM & punya html_snapshot (migration 227) --
          tampilin APA ADANYA, hasil render BEKU pas tombol Kirim diklik
          dulu, BUKAN render ulang DokumenCetak dari data terkini (biar
          format/paket/TTD-nya gak ikut berubah kalau komponennya kena
          bugfix/redesign belakangan, dikonfirmasi user 2026-10-14). Dokumen
          lama yang terkirim SEBELUM fitur ini ada (html_snapshot kosong)
          fallback ke render live seperti biasa -- gak bisa dibekukan
          retroaktif, itu batasnya. */}
      {dokumen.terkirim && dokumen.html_snapshot ? (
        <div dangerouslySetInnerHTML={{ __html: dokumen.html_snapshot }} />
      ) : (
        <div ref={sheetRef}>
          <DokumenCetak dokumen={dokumen} booking={booking} payment={payment} pengaturan={pengaturan} />
        </div>
      )}

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
