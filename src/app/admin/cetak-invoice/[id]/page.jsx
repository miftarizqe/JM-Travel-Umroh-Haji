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
import { pesanDokumenFisikTerkirim } from '@/lib/waTemplates';

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

function BarisPaket({ booking }) {
  const qty = Number(booking.jumlah_jamaah || 1);
  return (
    <tr>
      <td style={td}>
        <div><b>Paket:</b> {PAKET_LABEL[booking.paket] || booking.paket}{booking.kamar ? ` · ${booking.kamar}` : ''}</div>
        {booking.jamaah_nama?.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <b>Atas Nama Jamaah:</b>
            <ol style={{ margin: '4px 0 0 20px', padding: 0 }}>
              {booking.jamaah_nama.map((nama, i) => <li key={i}>{nama}</li>)}
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

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDitolak(true); setLoading(false); return;
    }
    fetch(`/api/admin/invoice-kwitansi/${id}`)
      .then(r => r.json())
      .then(d => {
        if (!d.dokumen) { setLoading(false); return; }
        setDokumen(d.dokumen); setBooking(d.booking || null); setPayment(d.payment || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, id]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Halaman ini khusus admin.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>← Kembali</button>
    </div>
  );

  if (!dokumen) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Dokumen tidak ditemukan.</div>;

  const judul = JUDUL[dokumen.jenis];
  const punyaRincianBooking = booking?.total_harga != null;
  const qtyJamaah = booking ? Number(booking.jumlah_jamaah || 1) : 1;
  const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || dokumen.status === 'paid';
  const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) >= BATAS_MATERAI;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>{dokumen.nomor} · di dialog print pilih &quot;Save as PDF&quot;</div>
      </div>

      <DokumenSignatureAksi dokumen="invoice" refId={dokumen.id} onCetakFisik={() => window.print()} hideCetakFisik />

      {dokumen.terkirim ? (
        <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 10, fontSize: 12, background: '#ecfdf5', color: '#047857', fontWeight: 700 }}>
            ✅ Sudah dikirim ({dokumen.terkirim_metode === 'fisik' ? 'fisik' : 'digital'}, {tgl(dokumen.terkirim_at)})
          </div>
          {dokumen.terkirim_metode === 'fisik' && dokumen.scan_fisik_path && (
            <div style={{ marginTop: 8 }}>
              <TombolWA nomor={booking?.pemesan_wa} label="Kirim Ulang Scan via WA"
                pesan={pesanDokumenFisikTerkirim({
                  namaJamaah: dokumen.nama, jenis: dokumen.jenis, nomor: dokumen.nomor,
                  linkScan: typeof window !== 'undefined' ? `${window.location.origin}${dokumen.scan_fisik_path}` : dokumen.scan_fisik_path,
                })} />
            </div>
          )}
        </div>
      ) : (
        <UploadScanDokumen label="Scan fisik (materai + TTD)" uploadUrl={`/api/admin/invoice-kwitansi/${dokumen.id}/scan-fisik`}
          userId={dokumen.id} path={dokumen.scan_fisik_path} uploadedAt={dokumen.scan_fisik_uploaded_at}
          onUploaded={(path) => setDokumen(d => ({ ...d, scan_fisik_path: path, terkirim: 1, terkirim_metode: 'fisik', terkirim_at: new Date().toISOString() }))} />
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
            {punyaRincianBooking ? (
              <>
                <BarisPaket booking={booking} />

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

                {dokumen.jenis === 'tanda_terima' && (
                  <>
                    <BarisItem label={`${LABEL_TIPE_PEMBAYARAN[payment?.type] || 'Pembayaran'} — diterima`}
                      qty={qtyJamaah} satuan={perUnit(dokumen.nominal, qtyJamaah)} jumlah={dokumen.nominal} tebal />
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
